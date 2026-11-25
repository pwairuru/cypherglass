# CypherGlass Chart Parity Ledger

**Date:** 2026-11-24  
**Target:** 98% chart and feature parity with Into The Cryptoverse (ITC), Bitcoin Magazine Pro / LookIntoBitcoin (LIB), and Checkonchain (COC).  
**Rule:** social sentiment, news, video and community features are the only excluded unit.

## Score

| Metric | Value |
|---|---:|
| Parity units defined | **91** |
| Units in scope | **90** |
| Excluded units (social/news/video/community) | **1** |
| Units designed by this spec | **90** |
| In-scope design completion | **90/90 = 100%** |
| Overall design parity | **90/91 = 98.90%** |
| Implementation status | **29 in progress**, 61 not started, 1 excluded |

`Designed` means the behaviour, chart page, controls, data source and acceptance criteria are specified. It does **not** mean shipped. The `implementation` column is updated per chart batch.

## Ledger

| ID | Family | Competitor reference | CypherGlass chart(s) | Design | Implementation |
|---|---|---|---|---|---|
| P01 | Price chart with candles/line, volume, MAs | ITC price, LIB price, COC price | `price.btc` | Designed | in_progress |
| P02 | Returns and momentum | ITC momentum, COC rolling performance | `price.momentum` | Designed | not_started |
| P03 | Drawdown from ATH | LIB drawdown, COC drawdowns | `price.drawdown` | Designed | not_started |
| P04 | MVRV, Z-score, 2Y Z, momentum | ITC MVRV Z, LIB MVRV Z, COC MVRV | `valuation.mvrv` | Designed | in_progress |
| P05 | Realized cap and realized price | LIB realized cap/price, COC realized cap | `valuation.realized_cap`, `valuation.realized_price` | Designed | not_started |
| P06 | NUPL | LIB NUPL, COC NUPL | `valuation.nupl` | Designed | not_started |
| P07 | SOPR | LIB SOPR, COC SOPR | `profitability.sopr` | Designed | not_started |
| P08 | SOPR by STH/LTH cohort | COC STH/LTH SOPR | `profitability.sopr_cohorts` | Designed | not_started |
| P09 | Net realized PnL | LIB realized PnL, COC net realized PnL | `profitability.realized_pnl` | Designed | not_started |
| P10 | Sell-side risk ratio | COC sell-side risk | `profitability.sell_side_risk` | Designed | not_started |
| P11 | STH/LTH MVRV and cost basis | LIB STH/LTH MVRV, COC STH/LTH | `valuation.sth`, `valuation.lth` | Designed | not_started |
| P12 | Reserve risk and RHODL | LIB reserve risk/RHODL, COC reserve risk | `valuation.risk_ratios` | Designed | not_started |
| P13 | CVDD, top cap, delta cap, balanced price | LIB CVDD/top cap, COC cost-basis models | `valuation.cap_models` | Designed | not_started |
| P14 | MVRV quantile bands and histograms | LIB quantiles, COC histograms | `valuation.quantile_bands`, `valuation.histograms` | Designed | not_started |
| P15 | Supply in profit/loss | LIB supply in profit, COC supply P/L | `supply.profit_loss` | Designed | not_started |
| P16 | HODL waves | LIB HODL waves, COC HODL waves | `supply.hodl_waves` | Designed | in_progress |
| P17 | STH/LTH supply | LIB STH/LTH supply, COC STH/LTH supply | `supply.cohorts` | Designed | in_progress |
| P18 | Address cohorts by BTC balance | LIB address cohorts, COC address counts | `addresses.btc_cohorts` | Designed | not_started |
| P19 | Address cohorts by USD balance | LIB address cohorts USD | `addresses.usd_cohorts` | Designed | not_started |
| P20 | Active and new addresses | LIB active addresses, COC active addresses | `addresses.activity` | Designed | not_started |
| P21 | Addresses in profit | LIB % addresses in profit | `addresses.profit` | Designed | not_started |
| P22 | Fee revenue | LIB miner revenue/fees, COC fee revenue | `fees.revenue` | Designed | in_progress |
| P23 | Fee buckets and fee rates | COC fee buckets | `fees.buckets`, `fees.per_tx` | Designed | not_started |
| P24 | Tx count, size and value bands | COC transfer volumes, LIB large tx | `fees.tx_count`, `fees.tx_size`, `fees.value_bands` | Designed | not_started |
| P25 | Transfer volume, velocity and NVT | LIB transfer volume/NVT, COC NVT | `flow.transfer_volume`, `flow.velocity`, `flow.nvt` | Designed | not_started |
| P26 | CDD and VDDM | LIB CDD/VDDM, COC CDD/VDDM | `flow.cdd`, `flow.vddm` | Designed | not_started |
| P27 | Hashrate and difficulty | LIB hashrate, COC difficulty | `mining.hashrate` | Designed | in_progress |
| P28 | Hash ribbons | LIB hash ribbons, COC hash ribbons | `mining.hashribbon` | Designed | not_started |
| P29 | Hashprice | LIB hashprice, COC hashprice | `mining.hashprice` | Designed | not_started |
| P30 | Miner revenue and fee share | LIB miner revenue, COC mining revenue | `mining.revenue` | Designed | not_started |
| P31 | Puell multiple | LIB Puell, COC Puell | `profitability.puell` | Designed | in_progress |
| P32 | Issuance, S2F and halving schedule | LIB S2F/issuance, COC inflation/S2F | `issuance.s2f`, `issuance.schedule` | Designed | not_started |
| P33 | Blocks, block interval, block size/weight | LIB blocks, COC block size | `network.blocks`, `network.blocksize`, `network.tx_per_block` | Designed | not_started |
| P34 | Lightning capacity and nodes | LIB Lightning, COC Lightning | `network.lightning` | Designed | not_started |
| P35 | Script type counts and shares | COC script types, LIB script types | `script.counts`, `script.shares` | Designed | not_started |
| P36 | 200W MA and heatmap | LIB 200W heatmap, COC 200W quantiles | `cycle.200w` | Designed | in_progress |
| P37 | 2Y MA, 5x bands, golden ratio | LIB 2Y MA, COC magic lines | `cycle.2y` | Designed | in_progress |
| P38 | Pi Cycle Top | LIB Pi Cycle, COC Pi Cycle | `cycle.pi` | Designed | in_progress |
| P39 | Power law and log regression | ITC log regression, LIB/COC power law | `cycle.powerlaw` | Designed | in_progress |
| P40 | Bull market support band | ITC bull support, LIB BMSB | `cycle.bmsb` | Designed | in_progress |
| P41 | Risk composite and components | ITC risk model, LIB risk | `risk.composite`, `risk.dashboard` | Designed | in_progress |
| P42 | Cycle master dashboard | ITC cycle master, LIB cycle master | `cycle.master` | Designed | not_started |
| P43 | URPD distribution, heatmap and diffs | COC URPD/heatmaps | `urpd.distribution`, `urpd.heatmap`, `urpd.diffs` | Designed | not_started |
| P44 | Cointime: liveliness, vaultedness, supply regions | COC Cointime | `cointime.liveliness`, `cointime.supply_regions` | Designed | not_started |
| P45 | Funding rates and open interest | LIB funding/OI, COC funding/OI | `derivatives.funding`, `derivatives.open_interest` | Designed | not_started |
| P46 | Options OI/IV/skew, term structure, liquidations | COC options/term/liquidations | `derivatives.options`, `derivatives.term_structure`, `derivatives.liquidations` | Designed | not_started |
| P47 | ETF flows | LIB ETF flows, COC ETF flows | `flow.etf` | Designed | not_started |
| P48 | ETF balances and AUM | COC ETF balances | `etf.balances` | Designed | not_started |
| P49 | Treasury companies and MSTR metrics | LIB treasury tracker, COC treasuries | `treasury.companies` | Designed | not_started |
| P50 | Macro: DXY, M2, Fed, CPI | ITC macro, LIB macro, COC capital rotation | `macro.dashboard` | Designed | not_started |
| P51 | BTC dominance, ETH/BTC, total cap | ITC dominance/flippening, LIB macro | `macro.relative` | Designed | not_started |
| P52 | Cross-asset correlations | COC correlations | `macro.correlations` | Designed | not_started |
| P53 | Fear & Greed | LIB Fear & Greed, COC Fear & Greed | `sentiment.fear_greed` | Designed | not_started |
| P54 | Seasonality and monthly returns | LIB seasonality, COC monthly performance | `technical.seasonality`, `technical.monthly_returns` | Designed | in_progress |
| P55 | Bollinger, MACD, Stochastic | COC technical indicators | `technical.bollinger`, `technical.macd`, `technical.stochastic` | Designed | in_progress |
| P56 | Compare overlay and small multiples | ITC compare, LIB compare, COC compare | `compare.overlay` | Designed | in_progress |
| P57 | Saved layouts and dashboards | ITC/LIB/COC saved views | `compare.overlay`, `cycle.master`, `risk.dashboard` | Designed | in_progress |
| P58 | Chart alerts | LIB alerts 40/100, COC alerts | `alerts.manager` | Designed | in_progress |
| P59 | Screenshot, CSV, share link | LIB screenshot/CSV, COC screenshot | all charts (EXP requirements) | Designed | in_progress |
| P60 | Mobile-responsive charts | ITC mobile app; LIB/COC mobile web | all charts (MOB requirements) | Designed | not_started |
| P61 | Chart explanations and AI analyst | LIB AI Analyst, ITC chart tutorials | all charts (EDU requirements) | Designed | not_started |
| P62 | No-code indicator workbench | ITC Workbench | `workbench.custom` | Designed | not_started |
| P63 | DCA, exit strategy, portfolio and MPT simulators | ITC DCA/exit/portfolio/MPT, LIB strategies | `strategies.dca`, `strategies.exit`, `strategies.portfolio` | Designed | not_started |
| P64 | Social sentiment, news, video, community | ITC videos/Telegram, LIB research/community | none | **Excluded** | n/a |
| P65 | Full-history ranges and zoom presets | COC 12 relayout presets, LIB full history | all time-series charts | Designed | in_progress |
| P66 | Log/linear and per-axis controls | COC log axes/axis manipulation, LIB log toggle | all time-series charts | Designed | in_progress |
| P67 | Multi-series overlay and cohort tabs | COC variants/cohorts, LIB chart options | `multi_series` archetype charts | Designed | in_progress |
| P68 | Annotations and 52 drawing tools | ITC/TradingView-style drawing, COC annotations | all charts via `AnnotationPanel` | Designed | in_progress |
| P69 | Chart types: histogram, heatmap, scatter, table, gauge | COC histograms/heatmaps/scatter/tables | 12 chart pages | Designed | in_progress |
| P70 | Multi-pane indicators | TradingView-style panes, COC subplots | `technical.macd` + price charts | Designed | not_started |
| P71 | API access to metrics | LIB API 200+ metrics | `/api/v1/charts/*` | Designed | in_progress |
| P72 | CSV export of visible data | LIB CSV downloads | global chart toolbar | Designed | in_progress |
| P73 | Public API keys, scopes and rate limits | LIB API | `backend-rs/src/charts` | Designed | not_started |
| P74 | Embeddable read-only charts | LIB/COC share images | `EXP-05` | Designed | not_started |
| P75 | Data freshness and proxy badges | LIB/COC data notes | all charts (DQ requirements) | Designed | in_progress |
| P76 | Email/webhook alert delivery | LIB email/push, COC alerts | `alerts.manager` | Designed | not_started |
| P77 | Saved chart state in URL | COC/LIB shareable links | all charts | Designed | in_progress |
| P78 | Per-chart parameter controls (MA length, z-window, bins) | ITC Workbench, COC chart controls | all analytical charts | Designed | in_progress |
| P79 | Performance and accessibility budgets | competitor baseline | all charts | Designed | not_started |
| P80 | Pine Script / TradingView indicator export | ITC/LIB private TradingView indicators | line/oscillator/bands charts | Designed | not_started |
| P81 | Exchange balances and netflow | COC exchange balances, LIB exchange balances | `entity.exchange_balances` | Designed | not_started |
| P82 | Lifespan signals: binary CDD, seller exhaustion, consecutive days | COC lifespan signals | `flow.lifespan_signals` | Designed | not_started |
| P83 | Monetary premium over thermocap | COC monetary premium | `valuation.monetary_premium` | Designed | not_started |
| P84 | Mining models: difficulty regression, difficulty per issuance, miner profitable days, mining pulse | COC mining models | `mining.models` | Designed | not_started |
| P85 | Capital rotation and realized-cap net change | COC capital rotation | `flow.capital_rotation` | Designed | not_started |
| P86 | Rainbow chart | LIB rainbow, COC rainbow | `cycle.rainbow` | Designed | not_started |
| P87 | Rolling high/low price ranges | COC price ranges | `technical.price_ranges` | Designed | not_started |
| P88 | Sharpe, Sortino and Calmar ratios | COC risk-adjusted ratios | `technical.risk_adjusted` | Designed | not_started |
| P89 | Inflation-adjusted price and drawdown | COC inflation-adjusted price | `technical.inflation_adjusted` | Designed | not_started |
| P90 | ETF market dashboard: price, volume, MVRV, dominance, aggregate volume, cash-and-carry | COC ETF market | `etf.market` | Designed | not_started |
| P91 | Supply net position change and absorption rates | COC supply net position change | `supply.net_position_change` | Designed | not_started |

## Status rules

- `Designed` — spec + catalog entry + acceptance list exist.
- `In progress` — chart batch started; at least one acceptance item failing.
- `Shipped` — all acceptance items pass, visual test recorded, parity review recorded.
- `Excluded` — explicitly outside scope, with reason.

## Change control

Any new competitor feature or chart family must be added as a new parity unit. The denominator changes, so the percentage must be recalculated and signed off. Do not silently expand the denominator to preserve 98%.
