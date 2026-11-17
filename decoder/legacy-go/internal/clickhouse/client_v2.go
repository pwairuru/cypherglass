// decoder/internal/clickhouse/client_v2.go
package clickhouse

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/freegoup/decoder/internal/enrich"
	"github.com/freegoup/decoder/internal/parser"
)

// InsertBlockV2 writes one row to blocks_v2 (17 cols, see 03_schema_v2.sql).
// fee_total_sat is derived from coinbase economics: coinbase out - subsidy,
// clamped at 0. interval_sec defaults to 600s for genesis / unknown prevTime.
func (c *Client) InsertBlockV2(ctx context.Context, block *parser.ParsedBlock, prevTime time.Time) error {
	batch, err := c.conn.PrepareBatch(ctx, fmt.Sprintf(`INSERT INTO %s.blocks_v2`, c.db))
	if err != nil {
		return err
	}
	var coinbaseOut int64
	for _, tx := range block.Transactions {
		if tx.IsCoinbase {
			coinbaseOut += tx.TotalOutSat
		}
	}
	reward := enrich.SubsidyAt(block.Height)
	feeTotal := max64(coinbaseOut-int64(reward), 0)
	interval := int32(600)
	if !prevTime.IsZero() {
		interval = int32(block.Header.Timestamp.Sub(prevTime).Seconds())
	}
	err = batch.Append(
		block.Height,
		block.Hash.String(),
		block.Header.Timestamp,
		uint32(0), // size: not tracked by parser yet
		uint32(0), // weight: not tracked by parser yet
		uint32(block.Header.Version),
		block.Header.Bits,
		block.Header.Nonce,
		block.Header.MerkleRoot.String(),
		block.Header.PrevBlock.String(),
		uint16(len(block.Transactions)),
		float64(0), // difficulty: filled by backfill from RPC headers
		"",         // chainwork: filled by backfill from RPC headers
		uint64(reward),
		uint64(feeTotal),
		interval,
		time.Now().UTC(),
	)
	if err != nil {
		return err
	}
	return batch.Send()
}

func max64(a, b int64) int64 {
	if a > b {
		return a
	}
	return b
}

// InsertTransactionsV2 writes one row per tx to transactions_v2 (17 cols).
// input_total_sat is resolved via utxo.Get (0 on miss); fee_sat =
// input_total - total_out (0 for coinbase); fee_rate_sat_vbyte comes from
// the parser-recorded vsize (BIP-141).
func (c *Client) InsertTransactionsV2(ctx context.Context, block *parser.ParsedBlock, utxo *enrich.UTXOMap) error {
	batch, err := c.conn.PrepareBatch(ctx, fmt.Sprintf(`INSERT INTO %s.transactions_v2`, c.db))
	if err != nil {
		return err
	}

	blockHash := block.Hash.String()

	for _, tx := range block.Transactions {
		txid := tx.Hash.String()
		var inputTotal uint64
		if !tx.IsCoinbase {
			for _, in := range tx.Inputs {
				if v, ok := utxo.Get(in.PrevTxID.String(), in.PrevIndex); ok {
					inputTotal += v
				}
			}
		}
		var feeSat int64
		if !tx.IsCoinbase {
			feeSat = int64(inputTotal) - tx.TotalOutSat
		}
		if err := batch.Append(
			txid,
			block.Height,
			blockHash,
			block.Header.Timestamp,
			uint32(tx.Version),
			tx.LockTime,
			tx.SizeVBytes,
			tx.WeightUnits,
			tx.VinCount,
			tx.VoutCount,
			uint8(map[bool]uint8{true: 1, false: 0}[tx.IsCoinbase]),
			uint64(max64(tx.TotalOutSat, 0)),
			inputTotal,
			feeSat,
			enrich.FeeRate(feeSat, tx.SizeVBytes),
			changeHeavy(tx),
			time.Now().UTC(),
		); err != nil {
			return err
		}
	}
	return batch.Send()
}

// changeHeavy returns 1 when over half the outputs reuse an address.
// Input addresses are not resolvable from the value-only UTXO map, so this
// approximates reuse via duplicate addresses within the same tx and is
// documented as such; refine once address history is available.
func changeHeavy(tx *parser.ParsedTx) uint8 {
	if len(tx.Outputs) == 0 {
		return 0
	}
	seen := make(map[string]int, len(tx.Outputs))
	for _, out := range tx.Outputs {
		if out.Address != "" {
			seen[out.Address]++
		}
	}
	reused := 0
	for _, out := range tx.Outputs {
		if out.Address != "" && seen[out.Address] > 1 {
			reused++
		}
	}
	if reused*2 > len(tx.Outputs) {
		return 1
	}
	return 0
}

// InsertOutputsV2 writes one row per output to outputs_v2 (13 cols).
// All outputs land unspent (spent=0, empty spending columns, epoch
// spent_time); spending updates are applied by a later sweeper task.
func (c *Client) InsertOutputsV2(ctx context.Context, block *parser.ParsedBlock) error {
	batch, err := c.conn.PrepareBatch(ctx, fmt.Sprintf(`INSERT INTO %s.outputs_v2`, c.db))
	if err != nil {
		return err
	}

	for _, tx := range block.Transactions {
		txid := tx.Hash.String()
		for _, out := range tx.Outputs {
			if err := batch.Append(
				txid,
				uint16(out.Index),
				uint64(max64(out.ValueSat, 0)),
				out.ScriptHex,
				out.ScriptType,
				out.Address,
				uint8(0),              // spent
				"",                    // spending_txid
				uint32(0),             // spent_height
				time.Unix(0, 0).UTC(), // spent_time: unset
				block.Height,
				block.Header.Timestamp,
				time.Now().UTC(),
			); err != nil {
				return err
			}
		}
	}
	return batch.Send()
}

// InsertInputsV2 writes one row per input to inputs_v2 (11 cols).
// value_sat comes from utxo.Get; misses write 0 and are counted in logs.
func (c *Client) InsertInputsV2(ctx context.Context, block *parser.ParsedBlock, utxo *enrich.UTXOMap) error {
	batch, err := c.conn.PrepareBatch(ctx, fmt.Sprintf(`INSERT INTO %s.inputs_v2`, c.db))
	if err != nil {
		return err
	}

	var misses int
	for _, tx := range block.Transactions {
		txid := tx.Hash.String()
		for _, in := range tx.Inputs {
			var value uint64
			if !tx.IsCoinbase {
				v, ok := utxo.Get(in.PrevTxID.String(), in.PrevIndex)
				if !ok {
					misses++
				} else {
					value = v
				}
			}
			if err := batch.Append(
				txid,
				uint16(in.Index),
				in.PrevTxID.String(),
				in.PrevIndex,
				value,
				in.ScriptSigHex,
				in.Sequence,
				in.CoinbaseData,
				block.Height,
				block.Header.Timestamp,
				time.Now().UTC(),
			); err != nil {
				return err
			}
		}
	}
	if misses > 0 {
		log.Printf("inputs_v2: %d UTXO misses (value_sat=0) in block %d", misses, block.Height)
	}
	return batch.Send()
}
