// decoder/internal/clickhouse/columns.go
package clickhouse

// V2 column counts mirror clickhouse/init/03_schema_v2.sql.
// Guards against silent schema/drift mismatches in batch Append calls.
func BlockV2Columns() int { return 17 }

func TxV2Columns() int { return 17 }

func OutputsV2Columns() int { return 13 }

func InputsV2Columns() int { return 11 }
