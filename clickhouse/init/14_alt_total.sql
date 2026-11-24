-- clickhouse/init/14_alt_total.sql
-- Adds TOTAL crypto market cap to the alt-prices mart (fresh volumes get it
-- from 12_external_marts.sql; existing volumes apply this file via
-- scripts/e2e_onchain.py --apply-ddl).
ALTER TABLE marts.alt_prices_daily ADD COLUMN IF NOT EXISTS total_mcap_t Float64 CODEC(Gorilla, ZSTD(9));
