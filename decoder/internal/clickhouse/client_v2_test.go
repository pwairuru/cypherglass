// decoder/internal/clickhouse/client_v2_test.go
package clickhouse

import "testing"

func TestV2ColumnCounts(t *testing.T) {
	if BlockV2Columns() != 17 {
		t.Fatalf("blocks_v2 cols changed")
	}
	if TxV2Columns() != 17 {
		t.Fatalf("tx_v2 cols changed")
	}
}
