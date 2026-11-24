import clickhouse_connect

c = clickhouse_connect.get_client(
    host="localhost", port=8124, username="bitcoin", password="bitcoin_clickhouse"
)

print("base total:", c.query("SELECT count() FROM bitcoin.blocks_v2").result_rows)
print("base distinct keys:", c.query("SELECT uniqExact((height, hash)) FROM bitcoin.blocks_v2").result_rows)
print("hourly:", c.query("SELECT countMerge(block_count) FROM bitcoin.mv_blocks_hourly").result_rows)
print("daily:", c.query("SELECT count() FROM bitcoin.mv_blocks_daily").result_rows)
print("reward:", c.query("SELECT sumMerge(reward_sum) FROM bitcoin.mv_blocks_daily").result_rows)
print("genesis diff:", c.query("SELECT day, avgMerge(avg_difficulty) FROM bitcoin.mv_blocks_daily WHERE day = '2009-01-03' GROUP BY day").result_rows)
print("era sample:", c.query("SELECT day, avgMerge(avg_difficulty) FROM bitcoin.mv_blocks_daily WHERE day IN ('2009-06-01', '2009-12-31', '2010-01-15', '2010-02-15') GROUP BY day ORDER BY day").result_rows)
