# Chart implementation tracker

Generated from the catalog. Update `implementation` in `chart-catalog.yaml` as work lands.

| Chart | Title | Phase | Priority | Status | Implementation |
|---|---|---|---|---|---|
| `price.btc` | Bitcoin Price | phase_2_price | P0 | existing | in_progress |
| `price.cycle_overlays` | Cycle Overlays | phase_2_price | P0 | existing | not_started |
| `price.drawdown` | Drawdown from ATH | phase_2_price | P0 | existing | not_started |
| `price.mayer` | Mayer Multiple | phase_2_price | P0 | existing | not_started |
| `price.momentum` | Price Momentum | phase_2_price | P0 | existing | not_started |
| `price.rsi` | RSI-14 | phase_2_price | P0 | existing | not_started |
| `price.sharpe` | Sharpe Proxy 30D | phase_2_price | P0 | existing | not_started |
| `price.volatility` | Realized Volatility 30D | phase_2_price | P0 | existing | not_started |
| `valuation.aviv` | AVIV Ratio | phase_3_valuation | P0 | existing | not_started |
| `valuation.cap_models` | Cap Models: Average, Top, Delta, Balanced, CVDD | phase_3_valuation | P0 | existing | not_started |
| `valuation.lth` | LTH MVRV & Cost Basis | phase_3_valuation | P0 | existing | not_started |
| `valuation.mvrv` | MVRV / Z-Score / Momentum | phase_3_valuation | P0 | existing | in_progress |
| `valuation.nupl` | NUPL | phase_3_valuation | P0 | existing | not_started |
| `valuation.realized_cap` | Realized Cap vs Market Cap | phase_3_valuation | P0 | existing | not_started |
| `valuation.realized_price` | Realized Price | phase_3_valuation | P0 | existing | not_started |
| `valuation.risk_ratios` | Reserve Risk & RHODL | phase_3_valuation | P0 | existing | not_started |
| `valuation.sth` | STH MVRV & Cost Basis | phase_3_valuation | P0 | existing | not_started |
| `profitability.puell` | Puell Multiple | phase_4_profitability_risk | P1 | existing | not_started |
| `profitability.sopr` | SOPR | phase_4_profitability_risk | P1 | existing | not_started |
| `risk.composite` | Risk Composite | phase_4_profitability_risk | P0 | existing | in_progress |
| `cycle.200w` | 200W MA + Heatmap | phase_5_cycle | P0 | existing | not_started |
| `cycle.2y` | 2Y MA, 5x Bands, Golden 1.6 | phase_5_cycle | P0 | existing | not_started |
| `cycle.bmsb` | Bull Market Support Band | phase_5_cycle | P0 | existing | not_started |
| `cycle.pi` | Pi Cycle Top | phase_5_cycle | P0 | existing | not_started |
| `cycle.powerlaw` | Power Law & Log Regression | phase_5_cycle | P0 | existing | not_started |
| `issuance.s2f` | Stock-to-Flow | phase_6_supply | P1 | existing | not_started |
| `issuance.schedule` | Issuance & Halving Schedule | phase_6_supply | P1 | existing | not_started |
| `supply.circulating` | Circulating Supply & Inflation | phase_6_supply | P1 | existing | not_started |
| `supply.cohorts` | STH / LTH Supply | phase_6_supply | P1 | existing | not_started |
| `supply.hodl_waves` | HODL Waves | phase_6_supply | P1 | existing | in_progress |
| `supply.long_term` | Long-Term Supply | phase_6_supply | P1 | existing | not_started |
| `addresses.activity` | Active & New Addresses | phase_7_addresses | P1 | existing | not_started |
| `addresses.btc_cohorts` | Address Cohorts by BTC Balance | phase_7_addresses | P1 | existing | not_started |
| `addresses.outputs` | Outputs & Output Value | phase_7_addresses | P1 | existing | not_started |
| `addresses.profit` | Addresses in Profit | phase_7_addresses | P1 | existing | not_started |
| `addresses.usd_cohorts` | Address Cohorts by USD Balance | phase_7_addresses | P1 | existing | not_started |
| `fees.buckets` | Fee Rate Buckets | phase_8_fees | P1 | existing | not_started |
| `fees.per_tx` | Fee per Transaction / Fee Rate | phase_8_fees | P1 | existing | not_started |
| `fees.revenue` | Fee Revenue | phase_8_fees | P1 | existing | not_started |
| `fees.segwit` | SegWit Share | phase_8_fees | P1 | existing | not_started |
| `fees.tx_count` | Transaction Count | phase_8_fees | P1 | existing | not_started |
| `fees.tx_size` | Transaction Size & Weight | phase_8_fees | P1 | existing | not_started |
| `fees.value_bands` | Transaction Value Bands | phase_8_fees | P1 | existing | not_started |
| `fees.vin_vout` | Inputs & Outputs per Tx | phase_8_fees | P1 | existing | not_started |
| `flow.cdd` | Coin Days Destroyed | phase_9_flow | P1 | existing | not_started |
| `flow.etf` | ETF Flows | phase_9_flow | P1 | existing | not_started |
| `flow.legacy` | Legacy Transfer Volume | phase_9_flow | P1 | existing | not_started |
| `flow.nvt` | NVT Ratio | phase_9_flow | P1 | existing | not_started |
| `flow.transfer_volume` | Transfer Volume & Velocity | phase_9_flow | P1 | existing | not_started |
| `flow.value_bands` | Value Bands in BTC | phase_9_flow | P1 | existing | not_started |
| `flow.vddm` | Value Days Destroyed Multiple | phase_9_flow | P1 | existing | not_started |
| `flow.velocity` | Monetary Velocity | phase_9_flow | P1 | existing | not_started |
| `mining.hashprice` | Hashprice | phase_10_mining | P1 | existing | not_started |
| `mining.hashrate` | Hashrate & Difficulty | phase_10_mining | P1 | existing | not_started |
| `mining.hashribbon` | Hash Ribbons | phase_10_mining | P1 | existing | not_started |
| `mining.revenue` | Miner Revenue | phase_10_mining | P1 | existing | not_started |
| `network.blocks` | Blocks & Block Interval | phase_11_network | P1 | existing | not_started |
| `network.blocksize` | Block Size & Weight | phase_11_network | P1 | existing | not_started |
| `network.lightning` | Lightning Network | phase_11_network | P1 | existing | not_started |
| `network.tx_per_block` | Transactions per Block | phase_11_network | P1 | existing | not_started |
| `script.counts` | Script Type Counts | phase_12_script | P1 | existing | not_started |
| `script.shares` | Script Type Shares | phase_12_script | P1 | existing | not_started |
| `macro.dashboard` | Macro Dashboard | phase_13_macro | P1 | existing | not_started |
| `macro.relative` | BTC Dominance / ETH-BTC / Total Cap | phase_13_macro | P1 | existing | not_started |
| `derivatives.funding` | Funding Rates | phase_14_derivatives | P1 | existing | not_started |
| `derivatives.open_interest` | Open Interest | phase_14_derivatives | P1 | existing | not_started |
| `sentiment.fear_greed` | Fear & Greed | phase_15_sentiment | P1 | existing | not_started |
| `alerts.manager` | Chart Alerts | phase_15_platform | P2 | new | not_started |
| `compare.overlay` | Compare Overlay | phase_15_platform | P2 | new | not_started |
| `strategies.dca` | DCA Lab | phase_15_platform | P0 | existing | not_started |
| `strategies.exit` | Exit Strategy Simulator | phase_15_platform | P2 | new | not_started |
| `strategies.portfolio` | Risk Portfolio Tester | phase_15_platform | P2 | new | not_started |
| `workbench.custom` | Indicator Workbench | phase_15_platform | P2 | new | not_started |
| `cointime.liveliness` | Liveliness & Vaultedness | phase_16_data_dependent | P2 | new | not_started |
| `cointime.supply_regions` | Active vs Vaulted Supply | phase_16_data_dependent | P2 | new | not_started |
| `cycle.master` | Cycle Master Dashboard | phase_16_data_dependent | P2 | new | not_started |
| `derivatives.liquidations` | Liquidations | phase_16_data_dependent | P2 | new | not_started |
| `derivatives.options` | Options OI / IV / Skew | phase_16_data_dependent | P2 | new | not_started |
| `derivatives.term_structure` | Futures Term Structure | phase_16_data_dependent | P2 | new | not_started |
| `etf.balances` | ETF Balances & AUM | phase_16_data_dependent | P2 | new | not_started |
| `macro.correlations` | Cross-Asset Correlations | phase_16_data_dependent | P2 | new | not_started |
| `profitability.realized_pnl` | Net Realized PnL | phase_16_data_dependent | P2 | new | not_started |
| `profitability.sell_side_risk` | Sell-Side Risk Ratio | phase_16_data_dependent | P2 | new | not_started |
| `profitability.sopr_cohorts` | SOPR by Cohort | phase_16_data_dependent | P2 | new | not_started |
| `risk.dashboard` | Risk Regime Dashboard | phase_16_data_dependent | P2 | new | not_started |
| `supply.profit_loss` | Supply in Profit / Loss | phase_16_data_dependent | P2 | new | not_started |
| `technical.bollinger` | Bollinger Bands | phase_16_data_dependent | P2 | new | not_started |
| `technical.drawdown_table` | Drawdown Table | phase_16_data_dependent | P2 | new | in_progress |
| `technical.macd` | MACD | phase_16_data_dependent | P2 | new | not_started |
| `technical.monthly_returns` | Monthly Returns Heatmap | phase_16_data_dependent | P2 | new | in_progress |
| `technical.seasonality` | Seasonality | phase_16_data_dependent | P2 | new | in_progress |
| `technical.stochastic` | Stochastic Oscillator | phase_16_data_dependent | P2 | new | not_started |
| `treasury.companies` | Treasury Companies | phase_16_data_dependent | P2 | new | not_started |
| `urpd.diffs` | URPD Differences | phase_16_data_dependent | P2 | new | not_started |
| `urpd.distribution` | URPD: Supply by Cost Basis | phase_16_data_dependent | P2 | new | not_started |
| `urpd.heatmap` | URPD Heatmap | phase_16_data_dependent | P2 | new | not_started |
| `valuation.histograms` | MVRV / NUPL / SOPR Histograms | phase_16_data_dependent | P2 | new | in_progress |
| `valuation.quantile_bands` | MVRV Quantile Bands | phase_16_data_dependent | P2 | new | not_started |
| `cycle.rainbow` | Rainbow Chart | phase_17_parity_extension | P2 | new | not_started |
| `entity.exchange_balances` | Exchange Balances & Netflow | phase_17_parity_extension | P2 | new | not_started |
| `etf.market` | ETF Market Dashboard | phase_17_parity_extension | P2 | new | not_started |
| `flow.capital_rotation` | Capital Rotation | phase_17_parity_extension | P2 | new | not_started |
| `flow.lifespan_signals` | Lifespan Signals | phase_17_parity_extension | P2 | new | not_started |
| `mining.models` | Mining Models | phase_17_parity_extension | P2 | new | not_started |
| `supply.net_position_change` | Supply Net Position Change | phase_17_parity_extension | P2 | new | not_started |
| `technical.inflation_adjusted` | Inflation-Adjusted Price | phase_17_parity_extension | P2 | new | not_started |
| `technical.price_ranges` | Price High/Low Range | phase_17_parity_extension | P2 | new | not_started |
| `technical.risk_adjusted` | Risk-Adjusted Returns | phase_17_parity_extension | P2 | new | not_started |
| `valuation.monetary_premium` | Monetary Premium | phase_17_parity_extension | P2 | new | not_started |
