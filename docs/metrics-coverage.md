# Metrics coverage: Bitcoin Magazine Pro / LookIntoBitcoin + IntoTheCryptoverse

Source of truth: `backend-rs/src/metrics/registry.rs` (267 metrics). Rule:
metrics read ONLY `bitcoin.mv_*`, `marts.*`, `bitcoin.price_ohlc_*` (enforced by
`test_no_base_table_reads`).

Chart page design is catalogued separately: `docs/charts/chart-catalog.yaml`
(109 chart pages, 267/267 metrics covered) and
`docs/charts/chart-by-chart.md` (per-chart contract).

> Legacy removal (2026-11-24): the Python `backend/` and the Go decoder
> (`decoder/legacy-go/`) were deleted after a full snapshot landed on `main`.
> Historical notes below that mention Python workers or the Go decoder are
> retained for context only.

## Ingest (Rust only)

- Blockchain ingest: Rust `decoder` (`decoder/src/`, `bitcoin` crate). Dev
  all-in-one builds `juicefs/Dockerfile.allinone` (bitcoind + JuiceFS + Rust
  decoder); prod split builds `decoder/Dockerfile` (Rust musl).
- Backend API: Rust `backend-rs` (Axum). `docker-compose.yml` `api` and
  `docker-compose.prod.yml` `api` both build `backend-rs/Dockerfile`.
  Routes: `GET /api/v1/metrics`, `/coverage`, `/{id}/series`,
  `/price_ohlc_{grain}/ohlc`.
- Scheduled ingest (price/marts/external) was removed with the Python Celery
  worker. Those tables keep serving existing rows; a Rust scheduler is TODO.

## LookIntoBitcoin (bitcoinmagazinepro.com/charts -> lookintobitcoin.com) mapping

| LIB chart slug | Status | CypherGlass metric(s) |
|---|---|---|
| mvrv-zscore | done | `mvrv_z_daily` |
| mvrv-quantile-bands, mvrv-zscore-2yr-rolling, mvrv-momentum | done (new) | `mvrv_momentum_daily`, `mvrv_z_2yr_daily` |
| long/short-term-holder-mvrv{,-zscore}, sth/lth-realized-price, sth/lth-supply | done (proxy) | `sth_supply_daily`, `lth_supply_daily`, `sth_lth_ratio_daily`, `sth_realized_price_daily` (155d SMA proxy), `lth_realized_price_daily` ((realized − STH value)/LTH supply), `sth_mvrv_daily`, `lth_mvrv_daily`; true age cost-basis needs UTXO-age realized (finer age bands TODO) |
| puell-multiple | done | `puell_daily/weekly`, `puell_sma30_daily` |
| sopr-spent-output-profit-ratio | done | `sopr_daily/weekly`, `sopr_sma7_daily` |
| rhodl-ratio | proxy | `rhodl_proxy_daily` (1w band / 2y band; true RHODL needs realized-value by age) |
| reserve-risk, relative-unrealized-profit--loss | proxy/done | `reserve_risk_proxy_daily`, `nupl_daily/weekly` |
| realized-price, balanced-price, terminal-price, top-cap, delta-top, cvdd | done/proxy | `realized_price_daily`, `balanced_proxy_daily`, `cvdd_proxy_daily`, canonical `delta_cap_daily` (realized − average cap), `avg_cap_daily`, `top_cap_daily` (average cap x35). Terminal Price formula unverifiable from gated sources + needs full CDD history (TODO, see research note) |
| pi-cycle-top-indicator, pi-cycle-top-bottom-indicator, golden-ratio-multiplier | done | `pi_111_daily`, `pi_350x2_daily`, `pi_oscillator_daily`, `ma2y_daily`, `ma2y_x5_daily`, `golden_161_daily` |
| 200-week-moving-average-heatmap, bitcoin-rainbow-chart, bitcoin-power-law, stock-to-flow-model | done/proxy | `ma200w_daily`, `heat_200w_daily`, `powerlaw_fair_daily`, `logreg_upper/lower_daily`, `s2f_daily`, `s2f_fair_daily` |
| bitcoin-investor-tool, bitcoin-price-prediction, mvrv-quantile-bands | covered | 2Y MA bands + MVRV bands above |
| hash-ribbons, bitcoin-hashrate-chart, bitcoin-miner-difficulty | done | `hashribbon_fast/slow/cross_daily`, `hashrate_daily/weekly/sma30`, `difficulty_daily/weekly/sma14` |
| bitcoin-hashprice, bitcoin-hash-price-volatility | done | `hashprice_daily` (volatility via `volatility30_daily` on price; hashprice vol TODO) |
| bitcoin-miner-revenue-{total,block-rewards,fees,fees-vs-rewards} | done | `miner_revenue_btc/usd_daily`, `reward_daily`, `fees_daily`, `fees_vs_reward_daily`, `fee_share_pct_daily` |
| coin-days-destroyed-cdd, supply-adjusted-cdd, value-days-destroyed-multiple, whale-shadows | done (new) | `cdd_daily`, `cdd_supply_adjusted_daily`, `vddm_daily`, `spent_value_daily` via `bitcoin.mv_cdd_daily` (`clickhouse/init/11_cdd.sql`) |
| hodl-waves, {1,5,10}-year-hodl-wave, realized-cap-hodl-waves | done | `hodl_band_*`, `hodl_1y/5y_plus_daily`, `realized_cap_daily` |
| bitcoin-active-addresses, active-address-sentiment-indicator, new-addresses | done (stale-gated) | `active_addresses_*`, `new_addresses_daily` via `marts.address_cohorts_daily`; `poll_address_sweeper` backfills `addresses_v2` (spent-flag repair + version-aware snapshot) and `poll_address_cohorts` snapshots cohorts — full loop verified live on fixture data (3 addresses, 1 flag repaired, single-counted) |
| addresses-greater-than-{0.01..10000}-btc, holding-x-btc-by-year, addresses-non-zero-balance | done (stale-gated) | `addr_gt1/10/100/1000_btc_daily` via `marts.address_cohorts_daily` + sweeper/cohorts tasks, verified live (dust/crab/shark buckets, gt1=1). USD cohorts + % in profit/loss still TODO (need price-valued balances per address) |
| addresses-greater-than-{1..1m}-usd, percent-addresses-in-{profit,loss} | done live | `addr_gt1k/10k/100k/1m_usd_daily` (LIB $1k/$10k/$100k/$1M thresholds) + `pct_addresses_in_profit_daily` via `marts.address_usd_daily` + `poll_address_usd` (avg received cost vs close, zero-balance excluded). Verified live both branches: 0.0 -> 0.5 -> 0.0 across a crash day. Receives on days without a close are skipped (documented approximation) |
| bitcoin-funding-rates, btc-open-interest | done live | `funding_rate_daily`, `open_interest_daily` via `marts.funding_daily`, populated by `poll_funding` (Binance futures, no key) on beat — 34 rows loaded live |
| lightning-network-{capacity,nodes} | code-done, key-gated | `lightning_capacity_daily`, `lightning_nodes_daily` via `marts.lightning_daily`; `poll_lightning` (1ML, defensive parse + mocked tests) runs when `ONE_ML_TOKEN` is set. mempool.space checked unreachable from this host, so no keyless fallback exists |
| bitcoin-etf-{daily,cumulative}-flows-{usd,btc}, treasury-tracker/*, hodlboard | done live | `etf_flow_btc/usd_daily`, `etf_cumulative_btc_daily` via `marts.etf_flows_daily`; `poll_etf_flows` CSV/URL loader implemented + tested, 2-row CSV loaded live (cumulative 620.5 BTC verified). Treasury-co holdings still TODO (needs filings ingest) |
| bitcoin-fear-and-greed-index | done live | `fear_greed_daily` via `marts.fear_greed_daily`, populated by `poll_fear_greed` (Alternative.me, no key) on beat — 90 rows loaded live, serving non-stale |
| bitcoin-profitable-days, everything-indicator, bitcoin-cycle-master | covered/proxy | `risk_daily` composite + cycle bands; documented composites in Overview |
| bitcoin-circulating-supply, bitcoin-blocks-mined, bitcoin-block-height | done | `supply_daily`, `blocks_daily`, `height_daily` |
| bitcoin-{50,200}-day-, {50,100}-week-, 365-day-moving-averages, bitcoin-key-moving-averages | done | `price_sma20/50/200_daily`, `price_ema21_daily`, `bmsb_20w/21w_daily`, `ma200w_daily` |
| bitcoin-yearly-{highs,lows,highs-lows}, price-history, bitcoin-volatility, monthly-returns-heatmap, seasonality, sharpe-ratio, crosby-ratio, portfolio-* | partial | OHLC + `volatility30_daily`, `rsi14_daily`, `price_mom30/yoy_daily`, `price_sharpe_proxy_daily`; full portfolio lab (DCA sim, seasonality heatmap, correlation matrices) is frontend TODO reusing `price_ohlc_daily` |
| macro/* (m2, cpi, fed, yields, dxy, sp500, gold), btc-vs-* correlations | code-done, key-gated | `dxy/m2_global/fed_funds/cpi_yoy_daily` via `marts.macro_daily`; real `poll_macro` FRED fetcher implemented + mocked tests (FRED API verified live reachable). Treasury yields / SP500 / gold still TODO (same table, add columns) |

## IntoTheCryptoverse (Benjamin Cowen) mapping
| ITC tool/chart | Status | CypherGlass metric(s) |
|---|---|---|
| Price risk / risk dashboard | done | `risk_daily/weekly`, `risk_mvrv/nupl/sopr/puell/mayer_daily`, `risk_sma7_daily`, Overview risk header |
| Bull-market support band (20W SMA + 21W EMA) | done (SMA proxy) | `bull_support_daily` (legacy daily blend) + `bmsb_20w_daily` (140d SMA) + `bmsb_21w_daily` (147d SMA proxy for 21W EMA; true EMA needs `exponentialMovingAverage` backfill — documented) |
| Log regression / power-law bands | done | `powerlaw_fair_daily`, `logreg_upper/lower_daily` |
| 200W heatmap, long-term MAs | done | `ma200w_daily`, `heat_200w_daily`, `price_sma200_daily` |
| MVRV Z-score | done | `mvrv_z_daily`, `mvrv_z_2yr_daily` |
| ROI after bottom | done | `roi_bottom_daily` |
| Short-term bubble risk | done | `bubble_risk_daily` |
| BTC dominance, ETH/BTC, TOTAL, flippening, alt risk | done live (TOTAL done) | `ethbtc_daily`, `btc_dominance_daily`, `total_mcap_daily` (TOTAL crypto cap, CoinGecko) via `marts.alt_prices_daily` — 721 rows + $2.096T today verified live. Flippening/alt-risk screeners remain frontend TODO |
| US inflation / rates, macro recession risk | done (stale-gated) | `cpi_yoy/fed_funds/m2_global_daily` via `marts.macro_daily` (see LIB macro row) |
| DCA simulation, exit strategies, risk portfolio tester, MPT, workbench | partial (DCA done) | **DCA Lab tab live** (`lib/dca.ts` + `DcaLab.tsx` + 7 vitest tests): recurring buys vs lump sum over loaded OHLC. Exit strategies / risk-portfolio tester / MPT / no-code workbench remain frontend TODO |
| Weekly videos / Telegram / TradingView / merch | n/a | not software metrics; out of scope |

## Operational notes (found live)

**DDL re-application wipes MV state.** `--apply-ddl` re-ran `05_mvs.sql` /
`08_extended_mvs.sql` / `11_cdd.sql`, whose `DROP VIEW` statements wipe MV
state on populated systems (base tables untouched; aggregates do NOT
rebuild). Proven live: MVs went to 0 rows after a re-apply and were restored
by re-seed. Fixed: all `DROP VIEW` lines removed (files now `CREATE IF NOT
EXISTS` only + header warnings); re-apply verified safe on the live system.
`e2e --seed/--check` remains a CI-only harness: its asserts assume empty MVs
and fail on a populated node by design — use direct service queries for live
verification instead.

**Two volume roots on this host.** `DATA_ROOT` bind-mounts resolved to
`/run/media/.../filos1/...` for the old stack and `/run/media/.../filos/...`
after a remount; `docker compose up` after the switch recreated the stack on
the other root (full real 43k-block dataset vs. fixture world — verify with
`docker inspect <svc> --format '{{range .Mounts}}...'` before assuming which
world is live). Dev `DATABASE_URL` must point at host port 5433 (5432 belongs
to another project's postgres). Rust tests already default to 5433. A stale
`_sqlx_migrations` checksum on an old volume is repaired by re-applying the
idempotent `backend-rs/migrations/001_auth_user_social.sql`.

Terminal Price research trail (why not implemented as exact):

- `lookintobitcoin.com/charts/terminal-price` and `/top-cap`: "About" sections are paywalled/JS-rendered — fetch returns shell text only, no formula.
- `charts.woobull.com/bitcoin-top-cap/`: 526 (Cloudflare block); Wayback CDX + availability API: no snapshots.
- Implemented instead from well-documented definitions: Average Cap = cumulative market cap / days since genesis, Top Cap = Average Cap x35, Delta Cap = Realized − Average Cap (Woo/Puell). `balanced_proxy_daily`/`cvdd_proxy_daily` stay labeled proxy.
- Terminal Price stays TODO: needs its exact CDD-based formulation verified plus full coin-days history.

## What was added this pass

- Live runtime proof: restored ClickHouse (rustfs S3 backend recovered), re-applied all 12 DDL files, `e2e --apply-ddl --seed --check` ALL PASS live; seeded marts served real rows for new metrics; external tasks ran live (90 F&G, 34 funding, 721 cross-asset rows → stale=False); empty tables honestly stale.
- Correctness fix found live: NVT/velocity/delta-cap/ROI-bottom windows were evaluated post-JOIN/post-filter, breaking genesis semantics on sub-ranges. Fixed to compute cumulatives over full history then range-filter (`e2e` NVT baseline 50.0 → 150.0 = 150.0 PASS). `backend-rs`: metrics router (`/api/v1/metrics*`) + descriptions + `ApiError -> Response` + `run_migrations` on boot; workspace includes `decoder`; `backend-rs/Dockerfile`; dev + prod compose build Rust API; dev all-in-one builds from source (Rust decoder guaranteed).
- 29 new metrics (210 -> 239): hashprice, hashribbon cross, MVRV momentum, MVRV-Z 2Y, RHODL proxy, reserve-risk proxy, STH/LTH supply + ratio + realized + MVRV, golden x1.6, Pi oscillator, delta cap, power-law fair + log-reg bands, BMSB 20W/21W, ROI-bottom, bubble risk, 30d momentum + Sharpe proxy, CDD + supply-adjusted + VDDM + spent value (with new `11_cdd.sql` MV, wired into `scripts/e2e_onchain.py --apply-ddl`).
- 20 new metrics (239 -> 259): YoY price, funding rate + open interest, ETF daily USD/BTC + cumulative, DXY/M2/Fed/CPI macro, Fear & Greed, ETH/BTC + BTC dominance, Lightning capacity + nodes, new addresses + 4 balance cohorts (via new `12_external_marts.sql` + `backend/app/workers/external.py` beat ingest; keyless sources run, keyed ones no-op honestly).
- This pass (259 -> 267 + workers + frontend + ingest fix): canonical Top Cap + Average Cap + Delta Cap (Woo/Puell, verified live); TOTAL market cap (`total_mcap_daily`, $2.096T live); `poll_address_sweeper` backfill + `poll_address_cohorts` with full live loop (merge-safe dedup); real FRED/ETF/1ML ingest code (ETF CSV loaded live, FRED API reachable, 1ML defensive); DCA Lab frontend tab (`lib/dca.ts` + `DcaLab.tsx` + tests); USD cohorts + % in profit (5 metrics) via `marts.address_usd_daily` + `poll_address_usd`, verified live both branches; Rust decoder now computes `difficulty` from compact bits (replaces 0.0 sentinel) and historical rows were backfilled live (`BACKFILL OK`: 43,181 keys, rewards invariant, genesis = exactly 1.0) so hashrate/hashribbon/hashprice serve real values; decoder Docker image builds (musl Rust + Go legacy, GOPROXY/GOSUMDB build-args for restricted networks) and the image binary was run live (CH handshake, sync watch, graceful shutdown); DDL re-application made idempotent (DROP VIEWs removed after a live wipe+recovery proved the hazard).
- 5 new metrics (261 -> 266): USD balance cohorts ($1k/$10k/$100k/$1M) + % addresses in profit via `marts.address_usd_daily` + `poll_address_usd` (13_address_usd.sql), verified live incl. profit AND loss branches.
- Historical `difficulty=0.0` rows: FIXED live — `scripts/backfill_difficulty.py --execute` ran clean to `BACKFILL OK` (43,181 distinct keys stable, base versions doubled exactly, reward sums invariant at 215,905,000,000,000 sat, MVs refired exactly once per block, genesis difficulty exactly 1.0, 2010 eras match known history). Mining family (hashrate/hashribbon/hashprice/difficulty) now serves real values via the Rust API. Note: SQL `FINAL` must trail the table (`FROM t FINAL WHERE`), and `clickhouse-connect` may raise on the INSERT even though ClickHouse applies it — verification asserts catch a real failure.
- Remaining TODOs (no fake data): true UTXO-age cost-basis (finer than avg-cost-per-address), Terminal Price (formula unverifiable from gated sources; needs full CDD history — research trail above), FRED/1ML keys for live macro/lightning rows, treasury-co holdings ingest, yields/SP500/gold columns, seasonality/correlation lab, exit-strategy/MPT/workbench UI. Ingest follow-up: restart `bitcoin-knots` to resume chain sync with the fixed decoder (blocked: JuiceFS `database is not formatted` FATAL on 2026-11-19 — needs a careful re-format against existing S3 state, data-risky, not attempted). Test env notes: dev `DATABASE_URL` must use host port 5433 (5432 belongs to another project's postgres); `register_rate_limit_429` is wall-clock-sensitive and flakes under heavy parallel load (passes quiet; proven environmental, not a regression); e2e `--seed/--check` is CI-only (assumes empty MVs).
