-- clickhouse/init/10_extra_indexes.sql
-- S3-friendly skip indexes. NOTE: MaterializedViews (*.mv_*) do NOT support
-- ADD INDEX (storage MaterializedView) — their ORDER BY (day/hour) already
-- provides primary-key skipping. Only base-adjacent tables get indexes here.
ALTER TABLE bitcoin.price_ohlc_daily ADD INDEX IF NOT EXISTS idx_price_day (day) TYPE minmax GRANULARITY 1;
ALTER TABLE bitcoin.price_ohlc_hourly ADD INDEX IF NOT EXISTS idx_price_ts (ts) TYPE minmax GRANULARITY 1;
ALTER TABLE marts.price_tech_daily ADD INDEX IF NOT EXISTS idx_tech_day (day) TYPE minmax GRANULARITY 1;
ALTER TABLE marts.risk_daily ADD INDEX IF NOT EXISTS idx_risk_day (day) TYPE minmax GRANULARITY 1;
ALTER TABLE marts.supply_daily ADD INDEX IF NOT EXISTS idx_supply_day (day) TYPE minmax GRANULARITY 1;
