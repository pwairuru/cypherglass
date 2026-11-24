import clickhouse_connect
from datetime import datetime, timezone

c = clickhouse_connect.get_client(host="localhost", port=8124, username="bitcoin", password="bitcoin_clickhouse")

EPOCH = datetime(1970, 1, 1, tzinfo=timezone.utc)
now = datetime(2024, 1, 3, 0, 0, 0, tzinfo=timezone.utc)
outs = [
    # txid, idx, value_sat, spk, type, address, spent, spending_txid, spent_h, spent_time, block_h, ts, updated
    ("txe2e0", 0, 500_000_000, "0014a", "p2wpkh", "bc1qa", 0, "", 0, EPOCH, 0, datetime(2024, 1, 1, 0, 0, 0, tzinfo=timezone.utc), now),
    ("txe2e1", 0, 50_000_000, "0014b", "p2wpkh", "bc1qb", 0, "", 0, EPOCH, 1, datetime(2024, 1, 1, 1, 0, 0, tzinfo=timezone.utc), now),
    ("txe2e2", 1, 5_000_000, "0014c", "p2wpkh", "bc1qc", 0, "", 0, EPOCH, 2, datetime(2024, 1, 2, 0, 0, 0, tzinfo=timezone.utc), now),
]
c.insert("bitcoin.outputs_v2", outs, column_names=["txid", "output_index", "value_sat", "script_pubkey_hex", "script_type", "address", "spent", "spending_txid", "spent_height", "spent_time", "block_height", "timestamp", "updated_at"])
ins = [
    ("txe2e2", 0, "txe2e1", 0, 50_000_000, "", 4294967295, "", 2, datetime(2024, 1, 2, 0, 0, 0, tzinfo=timezone.utc), now),
]
c.insert("bitcoin.inputs_v2", ins, column_names=["txid", "input_index", "prev_txid", "prev_output_index", "value_sat", "script_sig_hex", "sequence", "coinbase_data", "block_height", "timestamp", "updated_at"])
print("fixture outputs+inputs inserted")
