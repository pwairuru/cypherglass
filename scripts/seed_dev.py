#!/usr/bin/env python3
"""Dev seed without huge blockchain: synthetic price + derived marts.

Covers existing chain era (2009-01-03..2010-03-05 from mv_blocks_daily) so all
200+ charts render. No bitcoin node download required.
Usage:
  backend/.venv/bin/python scripts/seed_dev.py [--days N] [--no-price]
"""
import argparse
import math
import random
from datetime import date, datetime, timedelta, timezone

SAT = 100_000_000


def get_client():
    import clickhouse_connect
    import os
    return clickhouse_connect.get_client(
        host=os.getenv("CLICKHOUSE_HOST", "localhost"),
        port=int(os.getenv("CLICKHOUSE_PORT", "8124")),
        username=os.getenv("CLICKHOUSE_USER", "bitcoin"),
        password=os.getenv("CLICKHOUSE_PASSWORD", "bitcoin_clickhouse"),
    )


def price_for(day: date) -> float:
    """Synthetic early BTC price: $0.0007 (Oct09) -> $0.003 (May10) -> $0.08 (Jul10)."""
    t0 = date(2009, 1, 3)
    days = (day - t0).days
    # exponential base + noise; clamp small
    base = 0.0005 * math.exp(days / 160.0)
    if day < date(2009, 10, 1):
        base = 0.0
    # deterministic noise
    rnd = random.Random(days)
    noise = 1.0 + (rnd.random() - 0.5) * 0.12
    p = base * noise
    # milestones
    if day >= date(2010, 5, 22):
        p = max(p, 0.0025 * (1 + days / 5000))
    return round(max(p, 0.0), 6) if p < 1 else round(p, 4)


def sma(vals, n):
    out = []
    s = 0.0
    for i, v in enumerate(vals):
        s += v
        if i >= n:
            s -= vals[i - n]
        out.append(s / min(i + 1, n))
    return out


def ema(vals, n):
    k = 2 / (n + 1)
    out = []
    e = vals[0] if vals else 0
    for i, v in enumerate(vals):
        e = v if i == 0 else v * k + e * (1 - k)
        out.append(e)
    return out


def rsi(vals, n=14):
    if len(vals) <= n:
        return [50.0] * len(vals)
    out = [None] * len(vals)
    gains = [max(vals[i] - vals[i - 1], 0) for i in range(1, len(vals))]
    losses = [max(vals[i - 1] - vals[i], 0) for i in range(1, len(vals))]
    ag = sum(gains[:n]) / n
    al = sum(losses[:n]) / n
    out[n] = 100 - 100 / (1 + ag / al) if al else (100 if ag else 50)
    for i in range(n + 1, len(vals)):
        ag = (ag * (n - 1) + gains[i - 1]) / n
        al = (al * (n - 1) + losses[i - 1]) / n
        out[i] = 100 - 100 / (1 + ag / al) if al else (100 if ag else 50)
    for i in range(n):
        out[i] = 50.0
    return [float(x) for x in out]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit-days", type=int, default=0)
    args = ap.parse_args()
    random.seed(42)
    c = get_client()
    rows = c.query("SELECT day, countMerge(block_count), sumMerge(reward_sum) FROM bitcoin.mv_blocks_daily GROUP BY day ORDER BY day").result_rows
    if not rows:
        raise SystemExit("no mv_blocks_daily — decoder/seed chain first")
    days = [r[0] if isinstance(r[0], date) else r[0].date() for r in rows]
    if args.limit_days:
        days = days[: args.limit_days]
    print(f"seeding {len(days)} days {days[0]}..{days[-1]}")

    # supply cumulative
    rewards = {}
    for r in rows:
        d = r[0] if isinstance(r[0], date) else r[0].date()
        rewards[d] = float(r[2]) / SAT
    supply, run = [], 0.0
    for d in days:
        run += rewards.get(d, 0)
        supply.append(run)
    issued = rewards

    # price daily + hourly (noon + midnight proxy)
    closes = [price_for(d) for d in days]
    # hourly: 24 rows/day linear interp
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    daily_rows = []
    for d, cl in zip(days, closes):
        o = closes[max(0, days.index(d) - 1)] if days.index(d) > 0 else cl
        h = max(o, cl) * 1.02
        l = min(o, cl) * 0.98
        v = 10 + days.index(d)
        daily_rows.append(("binance", "BTCUSDT", d, o, h, l, cl, float(v)))
    c.command("ALTER TABLE bitcoin.price_ohlc_daily DELETE WHERE symbol = 'BTCUSDT' SETTINGS mutations_sync = 1")
    c.insert("bitcoin.price_ohlc_daily", daily_rows,
             column_names=["source", "symbol", "day", "open", "high", "low", "close", "volume"])
    print(f"price_ohlc_daily: {len(daily_rows)}")
    hourly_rows = []
    for i, d in enumerate(days):
        cl = closes[i]
        prev = closes[i - 1] if i > 0 else cl
        for h in range(0, 24, 6):
            ts = datetime(d.year, d.month, d.day, h, tzinfo=timezone.utc)
            px = prev + (cl - prev) * (h / 24)
            hourly_rows.append(("binance", "BTCUSDT", ts, px, px * 1.005, px * 0.995, px, 1.0))
    c.command("ALTER TABLE bitcoin.price_ohlc_hourly DELETE WHERE symbol = 'BTCUSDT' SETTINGS mutations_sync = 1")
    c.insert("bitcoin.price_ohlc_hourly", hourly_rows,
             column_names=["source", "symbol", "ts", "open", "high", "low", "close", "volume"])
    print(f"price_ohlc_hourly: {len(hourly_rows)}")

    # price tech
    s20, s50, s200 = sma(closes, 20), sma(closes, 50), sma(closes, 200)
    e21 = ema(closes, 21)
    mayer = [cl / s200[i] if s200[i] else 1 for i, cl in enumerate(closes)]
    ath, dd, athd = [], [], []
    peak = 0
    for cl in closes:
        peak = max(peak, cl)
        ath.append(peak)
        dd.append((cl - peak) / peak if peak else 0)
        athd.append((peak - cl) / peak if peak else 0)
    vol = []
    for i in range(len(closes)):
        w = closes[max(0, i - 29): i + 1]
        m = sum(w) / len(w)
        var = sum((x - m) ** 2 for x in w) / len(w)
        vol.append(math.sqrt(var) / m if m else 0)
    rsi14 = rsi([x if x > 0 else 0.0001 for x in closes])
    bull = [(s20[i] * 20 + e21[i] * 21) / 41 for i in range(len(days))]
    tech_rows = [(days[i], closes[i], s20[i], s50[i], s200[i], e21[i], mayer[i], ath[i],
                   dd[i], athd[i], vol[i], rsi14[i], bull[i], now) for i in range(len(days))]
    c.command("ALTER TABLE marts.price_tech_daily DELETE WHERE day >= '2009-01-01' SETTINGS mutations_sync = 1")
    c.insert("marts.price_tech_daily", tech_rows,
             column_names=["day", "close", "sma20", "sma50", "sma200", "ema21", "mayer",
                           "ath", "drawdown", "ath_distance", "volatility30", "rsi14", "bull_support", "updated_at"])
    print("price_tech_daily done")

    # supply / issuance / bands / risk / valuation marts
    sup_rows = []
    for i, d in enumerate(days):
        infl = (issued.get(d, 0) * 365 / supply[i]) if supply[i] else 0
        sup_rows.append((d, supply[i], issued.get(d, 0), issued.get(d, 0), infl, now))
    c.command("ALTER TABLE marts.supply_daily DELETE WHERE day >= '2009-01-01' SETTINGS mutations_sync = 1")
    c.insert("marts.supply_daily", sup_rows,
             column_names=["day", "supply_btc", "issued_btc", "subsidy_btc", "inflation_annual", "updated_at"])
    print("supply_daily done")

    # hodl: young early, aging over time
    hodl_rows = []
    for i, d in enumerate(days):
        age = min(1.0, i / max(1, len(days)))
        tot = supply[i] * SAT if supply[i] else 1
        b1d, b1w, b1m = tot * 0.02, tot * 0.05, tot * 0.10
        b3m, b6m = tot * 0.12, tot * 0.13
        b1y = tot * (0.10 + 0.25 * age)
        b2y = tot * (0.05 + 0.15 * age)
        b5p = tot - (b1d + b1w + b1m + b3m + b6m + b1y + b2y)
        hodl_rows.append((d, int(b1d), int(b1w), int(b1m), int(b3m), int(b6m), int(b1y), int(b2y), int(max(b5p, 0)), now))
    c.command("ALTER TABLE marts.hodl_daily DELETE WHERE day >= '2009-01-01' SETTINGS mutations_sync = 1")
    c.insert("marts.hodl_daily", hodl_rows,
             column_names=["day", "band_1d", "band_1w", "band_1m", "band_3m", "band_6m", "band_1y", "band_2y", "band_5y_plus", "updated_at"])
    print("hodl_daily done")

    # valuation: realized = supply * price * (0.7..0.95 drift)
    real_rows, mvrv_rows, sopr_rows, puell_rows = [], [], [], []
    for i, d in enumerate(days):
        cl = closes[i] or 0.0001
        factor = 0.75 + 0.2 * (i / max(1, len(days)))
        rcap = supply[i] * cl * factor
        mcap = supply[i] * cl
        mvrv = mcap / rcap if rcap else 1
        nupl = (mcap - rcap) / mcap if mcap else 0
        real_rows.append((d, int(rcap), now))
        mvrv_rows.append((d, mvrv, nupl, now))
        sopr_rows.append((d, 1.0 + 0.02 * math.sin(i / 9.0) + i / 20000, now))
        puell_rows.append((d, 0.8 + 0.4 * (0.5 + 0.5 * math.sin(i / 25.0)), now))
    for tbl, rws, cols in [
        ("marts.realized_daily", real_rows, ["day", "realized_cap", "updated_at"]),
        ("marts.mvrv_nupl_daily", mvrv_rows, ["day", "mvrv", "nupl", "updated_at"]),
        ("marts.sopr_daily", sopr_rows, ["day", "sopr", "updated_at"]),
        ("marts.puell_daily", puell_rows, ["day", "puell", "updated_at"]),
    ]:
        c.command(f"ALTER TABLE {tbl} DELETE WHERE day >= '2009-01-01' SETTINGS mutations_sync = 1")
        c.insert(tbl, rws, column_names=cols)
        print(tbl, "done", len(rws))

    # bands: 200w ~ sma200 proxy, 2y, pi
    band_rows = []
    ma2y = sma(closes, min(730, len(closes)))
    ma111 = sma(closes, min(111, len(closes)))
    ma350 = sma(closes, min(350, len(closes)))
    for i, d in enumerate(days):
        m200w = s200[i] or closes[i] or 0.0001
        heat = (closes[i] / m200w) if m200w else 1
        m2 = ma2y[i] or closes[i]
        m111 = ma111[i] or closes[i]
        m350 = ma350[i] or closes[i]
        band_rows.append((d, m200w, heat, m2, m2 * 5, m111, m350, m350 * 2,
                          (m200w + m2) / 2 * 0.9, (m200w + m2) / 2, now))
    c.command("ALTER TABLE marts.bands_daily DELETE WHERE day >= '2009-01-01' SETTINGS mutations_sync = 1")
    c.insert("marts.bands_daily", band_rows,
             column_names=["day", "ma200w", "heat_200w", "ma2y", "ma2y_x5", "ma111", "ma350", "ma350_x2", "cvdd_proxy", "balanced_proxy", "updated_at"])
    print("bands_daily done")

    # risk composite 0-100 from normalized mvrv/nupl/sopr/puell/mayer
    risk_rows = []
    for i, d in enumerate(days):
        mvrv = mvrv_rows[i][1]
        nupl = mvrv_rows[i][2]
        sopr = sopr_rows[i][1]
        pu = puell_rows[i][1]
        my = mayer[i]
        r_m = min(100, max(0, (mvrv - 0.8) / 2.5 * 100))
        r_n = min(100, max(0, (nupl + 0.2) / 0.8 * 100))
        r_s = min(100, max(0, (sopr - 0.97) / 0.1 * 100))
        r_p = min(100, max(0, (pu - 0.5) / 1.5 * 100))
        r_my = min(100, max(0, (my - 0.6) / 1.8 * 100))
        risk = (r_m + r_n + r_s + r_p + r_my) / 5
        risk_rows.append((d, risk, r_m, r_n, r_s, r_p, r_my, "risk-on" if risk > 60 else ("neutral" if risk > 35 else "risk-off"), now))
    c.command("ALTER TABLE marts.risk_daily DELETE WHERE day >= '2009-01-01' SETTINGS mutations_sync = 1")
    c.insert("marts.risk_daily", risk_rows,
             column_names=["day", "risk", "risk_mvrv", "risk_nupl", "risk_sopr", "risk_puell", "risk_mayer", "regime", "updated_at"])
    print("risk_daily done")

    # issuance schedule: subsidy 50 BTC pre-2012, halving every 210k blocks (~4y)
    iss_rows = []
    for i, d in enumerate(days):
        h = 43181 + i * 144  # approx height progression from current tip
        halvings = h // 210000
        sub = 50 * SAT // (2 ** halvings)
        s2f = supply[i] / (issued.get(d, 1) * 365 + 1) if supply[i] else 0
        iss_rows.append((d, h, int(sub), s2f, closes[i] * 1.1 if closes[i] else 0.001, max(0, 210000 - (h % 210000)) // 144, now))
    c.command("ALTER TABLE marts.issuance_daily DELETE WHERE day >= '2009-01-01' SETTINGS mutations_sync = 1")
    c.insert("marts.issuance_daily", iss_rows,
             column_names=["day", "height", "subsidy_sat", "s2f", "s2f_fair", "next_halving_days", "updated_at"])
    print("issuance_daily done")
    print("SEED OK")


if __name__ == "__main__":
    main()
