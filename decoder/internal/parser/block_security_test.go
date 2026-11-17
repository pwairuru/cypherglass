package parser

import (
	"bytes"
	"encoding/binary"
	"testing"

	"github.com/btcsuite/btcd/chaincfg/chainhash"
	"github.com/btcsuite/btcd/wire"
)

// A forged length prefix (e.g. 0xFFFFFFFF) must NOT cause a multi-GB
// allocation: the scanner must skip it quickly and keep going.
func TestScanBlocksRejectsOversizeRecord(t *testing.T) {
	var buf bytes.Buffer
	buf.Write([]byte{0xf9, 0xbe, 0xb4, 0xd9}) // magic
	size := make([]byte, 4)
	binary.LittleEndian.PutUint32(size, 0xFFFFFFFF) // 4GB lie
	buf.Write(size)
	buf.Write([]byte{0xf9, 0xbe, 0xb4, 0xd9}) // trailing magic, no body
	r := bytes.NewReader(buf.Bytes())
	calls := 0
	err := ScanBlocksOpts(r, 0, 0, nil, func(BlockScanResult) error {
		calls++
		return nil
	})
	if err != nil {
		t.Fatalf("oversize record must be skipped, not fatal: %v", err)
	}
	if calls != 0 {
		t.Fatalf("oversize record must not invoke callback, got %d calls", calls)
	}
}

// Negative output values (invalid consensus, possible in corrupt files and
// never validated by wire deserialization) must be clamped so fee/value
// aggregates in ClickHouse cannot wrap negative.
func TestParseTransactionClampsNegativeOutputs(t *testing.T) {
	tx := wire.NewMsgTx(2)
	tx.AddTxIn(wire.NewTxIn(&wire.OutPoint{Hash: chainhash.Hash{}, Index: 0xffffffff}, nil, nil))
	tx.AddTxOut(wire.NewTxOut(-100, []byte{0x51}))
	tx.AddTxOut(wire.NewTxOut(5000000000, []byte{0x51}))
	pt := parseTransaction(tx)
	if len(pt.Outputs) != 2 {
		t.Fatalf("want 2 outputs, got %d", len(pt.Outputs))
	}
	if pt.Outputs[0].ValueSat != 0 {
		t.Fatalf("negative output not clamped: %d", pt.Outputs[0].ValueSat)
	}
	if pt.TotalOutSat != 5000000000 {
		t.Fatalf("total wrong: %d", pt.TotalOutSat)
	}
	if pt.TotalOutSat < 0 {
		t.Fatal("total must never be negative")
	}
}
