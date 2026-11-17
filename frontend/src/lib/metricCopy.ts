import type { SeriesPoint } from "../components/OnchainChart";

/** Humanized chart copy. Plain words, short sentences, no sales talk. */

function fmt(n: number, unit: string): string {
  if (!Number.isFinite(n)) return "no data";
  const abs = Math.abs(n);
  let out: string;
  if (abs >= 1e12) out = (n / 1e12).toFixed(2) + "T";
  else if (abs >= 1e9) out = (n / 1e9).toFixed(2) + "B";
  else if (abs >= 1e6) out = (n / 1e6).toFixed(2) + "M";
  else if (abs >= 1e3) out = (n / 1e3).toFixed(2) + "K";
  else if (abs >= 100) out = n.toFixed(1);
  else if (abs >= 1) out = n.toFixed(2);
  else if (abs >= 0.01) out = n.toFixed(3);
  else out = n.toPrecision(2);
  return unit ? `${out} ${unit}` : out;
}

export function summarizePoints(points: SeriesPoint[], unit: string): string {
  if (points.length === 0) return "No points in this range.";
  const first = points[0].v;
  const last = points[points.length - 1].v;
  if (points.length === 1) return `Now at ${fmt(last, unit)}.`;
  const pct = first !== 0 ? ((last - first) / Math.abs(first)) * 100 : 0;
  const dir = last > first ? "up" : last < first ? "down" : "flat";
  const pctText = Number.isFinite(pct) ? `${Math.abs(pct).toFixed(1)}% ${dir}` : dir;
  return `Now at ${fmt(last, unit)}, ${pctText} from ${fmt(first, unit)} at the start.`;
}

const BY_METRIC: Record<string, string> = {
  "active_addresses_daily": "Count of addresses that sent or received coins that day. It tracks real network use.",
  "active_addresses_hourly": "Count of addresses seen that hour. It tracks real network use at short time scales.",
  "active_addresses_sma7_daily": "7 day average of active addresses. It smooths daily noise and shows the trend in use.",
  "active_addresses_weekly": "Active addresses per week. It smooths daily noise.",
  "address_activity_daily": "Active addresses per day. This is an older name for the same count.",
  "ath_daily": "Highest price reached so far, carried forward each day. It marks the level to beat.",
  "ath_distance_daily": "How far price sits below the all time high. It shows the depth of the drawdown in percent terms.",
  "avg_block_interval_daily": "Mean seconds between blocks that day. The network targets 600 seconds.",
  "avg_block_interval_weekly": "Mean seconds between blocks that week. The network targets 600 seconds.",
  "avg_block_size_daily": "Mean block size that day in bytes. Full blocks mean high demand for space.",
  "avg_block_size_sma7_daily": "7 day average of block size. It smooths daily noise.",
  "avg_block_size_weekly": "Block size that week, weighted by block count. It shows if blocks run full.",
  "avg_block_weight_daily": "Mean block weight that day in weight units. It reflects SegWit use and fullness.",
  "avg_block_weight_sma7_daily": "7 day average of block weight. It smooths daily noise.",
  "avg_block_weight_weekly": "Block weight that week, weighted by block count.",
  "avg_txs_per_block_daily": "Mean transaction count per block that day. It tracks how full blocks are.",
  "avg_txs_per_block_sma7_daily": "7 day average of transactions per block. It smooths daily noise.",
  "avg_txs_per_block_weekly": "Transactions per block that week, weighted by block count.",
  "aviv_daily": "Market price divided by investor cost basis. It reads like MVRV and shows the same overbought and oversold zones.",
  "balanced_proxy_daily": "Model price between realized value and spent value. Price far above it meant late stage heat.",
  "block_size_total_daily": "Bytes added to the chain that day. It tracks how much data blocks carried.",
  "block_size_total_weekly": "Bytes added to the chain that week.",
  "block_stats_daily": "Blocks found per day. This is an older name for the same count.",
  "blocks_cumulative_daily": "Running total of blocks found. It grows by about 144 per day.",
  "blocks_daily": "Blocks found that day. The network targets 144 per day.",
  "blocks_hourly": "Blocks found that hour. Early chain history looks sparse and uneven.",
  "blocks_sma7_daily": "7 day average of blocks per day. It smooths variance around the 144 target.",
  "blocks_weekly": "Blocks found that week starting Monday. It smooths daily variance.",
  "bull_support_daily": "Combined 21 week average and 20 week mean. Price held above it in past uptrends and lost it when trends broke.",
  "cvdd_proxy_daily": "Cumulative value divided by age. Price under it meant coins traded below their held value.",
  "difficulty_daily": "Mining difficulty that day. It resets every 2016 blocks to keep block time near 10 minutes.",
  "difficulty_sma14_daily": "14 day average of difficulty. It smooths each reset.",
  "difficulty_weekly": "Mining difficulty that week.",
  "drawdown_daily": "Fall from the last all time high. It shows how deep the current dip runs.",
  "fee_bucket_0-1_daily": "Transactions that paid 0 to 1 sats per vbyte that day. Cheap lane when blocks are empty.",
  "fee_bucket_1-5_daily": "Transactions that paid 1 to 5 sats per vbyte that day.",
  "fee_bucket_100plus_daily": "Transactions that paid over 100 sats per vbyte that day. It spikes when users bid hard for the next block.",
  "fee_bucket_20-100_daily": "Transactions that paid 20 to 100 sats per vbyte that day.",
  "fee_bucket_5-20_daily": "Transactions that paid 5 to 20 sats per vbyte that day.",
  "fee_bucket_low_share_daily": "Share of transactions under 5 sats per vbyte. High means blocks had room.",
  "fee_median_sat_daily": "Median fee in sats that day. It shows what a normal transaction paid.",
  "fee_per_tx_daily": "Mean fee per transaction that day in BTC. It rises when blocks fill up.",
  "fee_per_tx_sma7_daily": "7 day average of mean fee per transaction. It smooths daily spikes.",
  "fee_share_pct_daily": "Share of miner revenue from fees that day. It grows as the subsidy shrinks.",
  "feerate_median_daily": "Median fee rate in sats per vbyte. It shows what a normal urgent transaction paid.",
  "feerate_median_weekly": "Median fee rate that week in sats per vbyte.",
  "fees_cumulative_daily": "Running total of fees paid to miners. It only moves up.",
  "fees_daily": "Total fees users paid miners that day in BTC. Spikes mean blocks were full.",
  "fees_hourly": "Total fees users paid miners that hour in BTC.",
  "fees_sma30_daily": "30 day average of daily fees. It shows the trend in fee demand.",
  "fees_sma7_daily": "7 day average of daily fees. It smooths daily spikes.",
  "fees_vs_reward_daily": "Fees divided by block subsidy that day. It shows how much miners rely on fees.",
  "fees_weekly": "Total fees users paid miners that week in BTC.",
  "halving_countdown_daily": "Days left until the next halving that day. The subsidy halves every 210,000 blocks.",
  "hashrate_daily": "Estimated hash power from difficulty. It tracks miner participation and network security.",
  "hashrate_sma30_daily": "30 day average of estimated hash power. It shows the trend in miner deployment.",
  "hashrate_weekly": "Estimated hash power that week.",
  "hashribbon_fast_daily": "30 day average of hash power. Compare it to the 60 day line to see if miners pull back.",
  "hashribbon_slow_daily": "60 day average of hash power. When the fast line crosses below it, miners are under stress.",
  "heat_200w_daily": "Price divided by the 200 week average. High values meant late stage heat.",
  "height_daily": "Block height that day. It counts blocks from genesis.",
  "hodl_1y_plus_daily": "Coins that did not move for a year or more. It tracks long-term holders.",
  "hodl_1y_plus_weekly": "End of week supply held a year or more in BTC.",
  "hodl_5y_plus_daily": "Coins that did not move for five years or more. It tracks the most patient holders.",
  "hodl_band_1d_daily": "Coins last moved within a day. It tracks the most active supply.",
  "hodl_band_1d_weekly": "End of week supply last moved within a day.",
  "hodl_band_1m_daily": "Coins held between a week and a month. It tracks recent buyers.",
  "hodl_band_1m_weekly": "End of week supply held between a week and a month.",
  "hodl_band_1w_daily": "Coins held between a day and a week. It tracks short term movers.",
  "hodl_band_1w_weekly": "End of week supply held between a day and a week.",
  "hodl_band_1y_daily": "Coins held between one and two years. It tracks patient holders.",
  "hodl_band_1y_weekly": "End of week supply held between one and two years.",
  "hodl_band_2y_daily": "Coins held between two and five years. It tracks very patient holders.",
  "hodl_band_2y_weekly": "End of week supply held between two and five years.",
  "hodl_band_3m_daily": "Coins held between one and three months. It tracks newer holders.",
  "hodl_band_3m_weekly": "End of week supply held between one and three months.",
  "hodl_band_5y_plus_daily": "Coins held five years or more. It tracks the oldest supply.",
  "hodl_band_5y_plus_weekly": "End of week supply held five years or more.",
  "hodl_band_6m_daily": "Coins held between six months and a year. It tracks mid term holders.",
  "hodl_band_6m_weekly": "End of week supply held between six months and a year.",
  "hodl_long_share_daily": "Share of supply held a year or more. Rising means more coins sit still.",
  "hodl_short_daily": "Supply moved within the last month. It tracks coins that trade often.",
  "inflation_annual_daily": "Yearly growth of supply that day. It drops in steps at each halving.",
  "large_tx_daily": "Transactions moving over 10 BTC that day. It tracks whale activity.",
  "large_tx_hourly": "Transactions moving over 10 BTC that hour. It tracks whale activity.",
  "large_tx_share_daily": "Share of transactions moving over 10 BTC that day.",
  "large_tx_weekly": "Transactions moving over 10 BTC that week.",
  "ma200w_daily": "200 week moving average of price in USD. Past bear lows sat near it.",
  "ma2y_daily": "2 year moving average of price in USD. It tracks the long trend.",
  "ma2y_x5_daily": "2 year average times five. Price above it meant late stage heat.",
  "market_cap_daily": "Price times circulating supply. It tracks the market value of all coins.",
  "market_cap_sma30_daily": "30 day average of market cap. It smooths daily price swings.",
  "mayer_multiple_daily": "Price divided by its 200 day average. Above 2.4 lined up with overheated markets.",
  "miner_revenue_btc_daily": "Block subsidy plus fees earned by miners that day. It tracks miner income in BTC.",
  "miner_revenue_sma7_daily": "7 day average of miner revenue in BTC. It smooths daily luck in blocks.",
  "miner_revenue_usd_daily": "Block subsidy plus fees in USD that day. It tracks miner income in dollar terms.",
  "mvrv_daily": "MVRV divides market price by the average price coins last moved at. Above 3 often lined up with tops. Below 1 meant the market traded under its cost basis.",
  "mvrv_sma30_daily": "30 day average of MVRV. It smooths daily moves and keeps the same overbought and oversold zones.",
  "mvrv_weekly": "Weekly MVRV. It smooths daily noise and shows the same overbought and oversold zones.",
  "mvrv_z_daily": "MVRV Z-score counts how far MVRV sits from its own history. High scores lined up with euphoria.",
  "nupl_daily": "NUPL shows unrealized profit as a share of market cap. High readings mean most holders sit in profit.",
  "nupl_sma7_daily": "7 day average of NUPL. It smooths daily moves.",
  "nupl_weekly": "Weekly NUPL. It smooths daily noise.",
  "nvt_daily": "NVT divides network value by transfer volume. High values mean price grew faster than chain use.",
  "nvt_sma30_daily": "30 day average of NVT. It smooths daily volume swings.",
  "outputs_count_daily": "New outputs created that day. It tracks payment and change activity.",
  "outputs_count_hourly_proxy": "Hourly output value estimate in BTC. It tracks short term flows.",
  "outputs_value_daily": "BTC value in new outputs that day. It tracks how much value wallets received.",
  "outputs_value_median_daily": "Median output value that day in BTC. It shows the size of a normal payment.",
  "pi_111_daily": "111 day moving average of price. In past cycles the top arrived when price crossed the 350 day line times two.",
  "pi_350x2_daily": "350 day moving average times two. Crosses with the 111 day line marked past cycle tops.",
  "price_btc_usd": "BTC price in USD. This feed is disabled.",
  "price_change_pct_daily": "Daily price change in percent. It shows the size of the daily move.",
  "price_close_daily": "Daily BTC close in USD. This is the price the market settled at.",
  "price_close_hourly": "Hourly BTC close in USD. Use it to check moves inside the day.",
  "price_ema21_daily": "21 day exponential average of price. It reacts faster than simple averages.",
  "price_high_daily": "Highest BTC price that day in USD.",
  "price_low_daily": "Lowest BTC price that day in USD.",
  "price_ohlc_daily": "BTC price in USD. Each candle shows open, high, low and close for the day.",
  "price_open_daily": "BTC price at the start of the day in USD.",
  "price_range_daily": "High minus low that day in USD. It shows how wide trading ran.",
  "price_sma200_daily": "200 day average of BTC price. It tracks the long trend.",
  "price_sma20_daily": "20 day average of BTC price. It tracks the short trend.",
  "price_sma50_daily": "50 day average of BTC price. It tracks the mid trend.",
  "price_volume_daily": "BTC volume traded that day. It shows how much changed hands on the exchange.",
  "puell_daily": "Puell divides new coin value by its yearly average. High values mean miners earn well above normal. Low values meant miner stress.",
  "puell_sma30_daily": "30 day average of Puell. It smooths daily moves.",
  "puell_weekly": "Weekly Puell multiple. It tracks miner pay against the yearly norm.",
  "realized_cap_daily": "Each coin counted at the price it last moved. It tracks capital stored in BTC and moves slower than market cap.",
  "realized_cap_sma30_daily": "30 day average of realized cap. It smooths daily moves.",
  "realized_cap_weekly": "End of week realized cap in USD. It tracks stored capital without daily noise.",
  "realized_price_daily": "Realized cap divided by supply. It is the average onchain cost basis per coin.",
  "reward_cumulative_daily": "Running total of new coins paid to miners. It only moves up and slows at each halving.",
  "reward_daily": "New coins paid to miners that day in BTC. It falls by half every 210,000 blocks.",
  "reward_weekly": "New coins paid to miners that week in BTC.",
  "risk_daily": "Composite risk from MVRV, NUPL, SOPR, Puell and Mayer. 0 is cold, 100 is hot. It is a guide, not a trade call.",
  "risk_mayer_daily": "Mayer part of the risk score. It tracks how far price sits above its 200 day average.",
  "risk_mvrv_daily": "MVRV part of the risk score. It tracks market price against onchain cost.",
  "risk_nupl_daily": "NUPL part of the risk score. It tracks unrealized profit.",
  "risk_puell_daily": "Puell part of the risk score. It tracks miner pay against the yearly norm.",
  "risk_sma7_daily": "7 day average of composite risk. It smooths daily moves.",
  "risk_sopr_daily": "SOPR part of the risk score. It tracks if coins move at a profit.",
  "risk_weekly": "End of week composite risk from 0 to 100. High is hot, low is cold.",
  "rsi14_daily": "RSI counts up days against down days over 14 days. Above 70 is hot, below 30 is washed out.",
  "s2f_daily": "Stock to flow divides current supply by yearly issuance. It tracks scarcity after each halving.",
  "s2f_fair_daily": "Model price from stock to flow in USD. Compare it to market price to see the gap.",
  "script_multisig_daily": "Outputs using multisig that day. It tracks shared custody use.",
  "script_multisig_share_daily": "Share of outputs using multisig that day.",
  "script_nonstandard_daily": "Outputs with nonstandard scripts that day. It tracks odd or custom uses.",
  "script_nonstandard_share_daily": "Share of outputs with nonstandard scripts that day.",
  "script_nulldata_daily": "OP_RETURN outputs that day. It tracks data stored onchain.",
  "script_nulldata_share_daily": "Share of OP_RETURN outputs that day.",
  "script_p2pkh_daily": "Pay to pubkey hash outputs that day. This is the oldest common address type.",
  "script_p2pkh_share_daily": "Share of pay to pubkey hash outputs that day.",
  "script_p2sh_daily": "Pay to script hash outputs that day. It tracks multisig and wrapped SegWit use.",
  "script_p2sh_share_daily": "Share of pay to script hash outputs that day.",
  "script_p2tr_daily": "Pay to Taproot outputs that day. It tracks Taproot adoption.",
  "script_p2tr_share_daily": "Share of pay to Taproot outputs that day.",
  "script_p2wpkh_daily": "Native SegWit outputs that day. It tracks modern wallet use.",
  "script_p2wpkh_share_daily": "Share of native SegWit outputs that day.",
  "script_p2wsh_daily": "Native SegWit script outputs that day. It tracks larger SegWit scripts.",
  "script_p2wsh_share_daily": "Share of native SegWit script outputs that day.",
  "script_pubkey_daily": "Pay to pubkey outputs that day. Early coinbases used this type.",
  "script_pubkey_share_daily": "Share of pay to pubkey outputs that day.",
  "segwit_share_daily": "Share of transactions using SegWit that day. It tracks upgrade adoption.",
  "sopr_daily": "SOPR checks if coins moved at a profit. Above 1 means sellers took profit. Below 1 means they sold at a loss.",
  "sopr_sma7_daily": "7 day average of SOPR. It smooths daily profit taking.",
  "sopr_weekly": "Weekly SOPR. It shows if coins moved at a profit that week.",
  "subsidy_daily": "New coins from the block subsidy that day, without fees. It drops at each halving.",
  "supply_daily": "Coins mined so far. It grows slower after each halving.",
  "supply_issued_daily": "New coins issued that day. It tracks daily issuance.",
  "thermocap_daily": "Sum of all miner revenue in USD over time. It tracks total security spend.",
  "transfer_count_daily": "Transfer transactions that day. It tracks how many payments settled.",
  "transfer_count_hourly": "Transfer transactions that hour.",
  "transfer_usd_daily": "Onchain transfer volume in USD that day. It tracks dollar value settled.",
  "transfer_volume_cumulative_daily": "Running total of BTC moved onchain. It only moves up.",
  "transfer_volume_daily": "Total BTC moved onchain that day, without coinbases. It tracks how much value the chain settled.",
  "transfer_volume_hourly": "Total BTC moved onchain that hour, without coinbases.",
  "transfer_volume_sma30_daily": "30 day average of transfer volume. It shows the trend in chain use.",
  "transfer_volume_sma7_daily": "7 day average of transfer volume. It smooths daily swings.",
  "transfer_volume_weekly": "Total BTC moved onchain that week, without coinbases.",
  "tx_count_cumulative_daily": "Running total of transactions. It only moves up.",
  "tx_count_daily": "Count of normal transactions confirmed that day. It tracks demand for block space.",
  "tx_count_hourly": "Count of normal transactions confirmed that hour.",
  "tx_count_sma30_daily": "30 day average of transaction count. It shows the trend in demand.",
  "tx_count_sma7_daily": "7 day average of transaction count. It smooths daily swings.",
  "tx_count_weekly": "Transactions confirmed that week.",
  "tx_size_hourly": "Median transaction size that hour in bytes.",
  "tx_size_median_daily": "Median transaction size that day in bytes. It tracks how heavy normal transactions are.",
  "tx_size_median_weekly": "Median transaction size that week in bytes.",
  "tx_volume_hourly": "Transactions confirmed that hour. This is an older name for the same count.",
  "tx_weight_median_daily": "Median transaction weight that day in weight units. It reflects SegWit use.",
  "value_dust_btc_daily": "BTC value in dust outputs that day. Dust means tiny outputs.",
  "value_dust_daily": "Count of dust outputs that day. Dust means tiny outputs.",
  "value_institutional_btc_daily": "BTC value in very large outputs that day.",
  "value_institutional_daily": "Count of very large outputs that day.",
  "value_median_daily": "Median transaction value that day in BTC. It shows the size of a normal transfer.",
  "value_median_weekly": "Median transaction value that week in BTC.",
  "value_per_active_daily": "Transfer value divided by active addresses that day. It shows value per user.",
  "value_retail_btc_daily": "BTC value in retail sized outputs that day.",
  "value_retail_daily": "Count of retail sized outputs that day.",
  "value_small_btc_daily": "BTC value in small outputs that day.",
  "value_small_daily": "Count of small outputs that day.",
  "value_whale_btc_daily": "BTC value in whale sized outputs that day.",
  "value_whale_daily": "Count of whale sized outputs that day.",
  "velocity_daily": "Transfer volume divided by supply. It shows how fast coins change hands.",
  "vin_mean_daily": "Mean inputs per transaction that day. More inputs mean more coins joined.",
  "vin_mean_weekly": "Mean inputs per transaction that week.",
  "volatility30_daily": "30 day price volatility. High values mean wide daily swings.",
  "vout_mean_daily": "Mean outputs per transaction that day. More outputs mean more payments or change.",
  "vout_mean_weekly": "Mean outputs per transaction that week.",
};

const BY_CATEGORY: Record<string, string> = {
  price: "BTC market price in USD. Compare levels, not headlines.",
  valuation: "Valuation compares price to onchain cost. High means holders sit on large paper gains.",
  profitability: "Profitability shows if coins move at a gain or a loss. It tracks seller behavior.",
  risk: "Risk blends several valuation gauges into a 0 to 100 score. High is hot, low is cold.",
  cycle: "Cycle bands track long trends like the 200 week average. Price far above them meant late stage bull runs.",
  supply: "Supply tracks coins by how long they sat still. Rising long held supply means less coins for sale.",
  flow: "Flow tracks value settled onchain. It shows if the chain is used for transfers or quiet.",
  fees: "Fees track demand for block space. High fees mean full blocks.",
  mining: "Mining tracks hash power, difficulty and miner pay. It shows if miners expand or pull back.",
  network: "Network tracks blocks and block content. It shows if the chain runs as expected.",
  addresses: "Addresses track users and outputs. More active addresses mean more people transacted.",
  script: "Script types show which address formats people used. Shifts follow wallet upgrades.",
  issuance: "Issuance tracks new supply and halvings. New supply drops in steps, not smoothly.",
};

const GENERIC = "Onchain data for the selected range. Read the trend and the current level together.";

export function explainMetric(metricId: string, category: string | undefined, backendDesc: string | undefined): string {
  const base = BY_METRIC[metricId] ?? (category && BY_CATEGORY[category]) ?? backendDesc ?? GENERIC;
  if (BY_METRIC[metricId] || (category && BY_CATEGORY[category])) return base;
  if (backendDesc && backendDesc.length > 8 && !backendDesc.endsWith("/ day.") && !backendDesc.endsWith("/ daily")) return backendDesc;
  return base;
}

export function describeChart(args: {
  metricId: string;
  category?: string;
  backendDesc?: string;
  points: SeriesPoint[];
  unit: string;
}): string {
  const what = explainMetric(args.metricId, args.category, args.backendDesc);
  const now = summarizePoints(args.points, args.unit);
  return `${what} ${now}`;
}

export const PRICE_HERO_COPY =
  "BTC price in USD with volume and the 20 day average. Candles show the trading range. The average shows trend direction.";

export const RISK_COPY =
  "Composite risk from MVRV, NUPL, SOPR, Puell and Mayer on a 0 to 100 scale. High lined up with overheated markets. Low lined up with fear.";
