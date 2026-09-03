package clickhouse

import (
	"context"
	"fmt"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"
	"github.com/freegoup/decoder/internal/parser"
)

type Client struct {
	conn driver.Conn
	db   string
}

func NewClient(ctx context.Context, host, port, user, password, database string) (*Client, error) {
	conn, err := clickhouse.Open(&clickhouse.Options{
		Addr: []string{fmt.Sprintf("%s:%s", host, port)},
		Auth: clickhouse.Auth{
			Database: database,
			Username: user,
			Password: password,
		},
		Compression: &clickhouse.Compression{
			Method: clickhouse.CompressionLZ4,
		},
		Settings: clickhouse.Settings{
			"async_insert":          1,
			"wait_for_async_insert": 0,
		},
		DialTimeout:     30 * time.Second,
		MaxOpenConns:    5,
		MaxIdleConns:    2,
		ConnMaxLifetime: time.Hour,
	})
	if err != nil {
		return nil, fmt.Errorf("clickhouse connect: %w", err)
	}

	if err := conn.Ping(ctx); err != nil {
		conn.Close()
		return nil, fmt.Errorf("clickhouse ping: %w", err)
	}

	fmt.Println("Connected to ClickHouse")
	return &Client{conn: conn, db: database}, nil
}

func (c *Client) InsertBlock(ctx context.Context, block *parser.ParsedBlock) error {
	batch, err := c.conn.PrepareBatch(ctx, fmt.Sprintf(`INSERT INTO %s.blocks`, c.db))
	if err != nil {
		return err
	}
	if err := batch.Append(
		block.Height,
		block.Hash.String(),
		block.Header.Timestamp,
		uint32(0),
		uint32(0),
		uint32(block.Header.Version),
		block.Header.Bits,
		block.Header.Nonce,
		block.Header.MerkleRoot.String(),
		block.Header.PrevBlock.String(),
		uint16(len(block.Transactions)),
		float64(0),
		"",
	); err != nil {
		return err
	}
	return batch.Send()
}

func (c *Client) InsertTransactions(ctx context.Context, block *parser.ParsedBlock) error {
	batch, err := c.conn.PrepareBatch(ctx, fmt.Sprintf(`INSERT INTO %s.transactions`, c.db))
	if err != nil {
		return err
	}

	blockHash := block.Hash.String()

	for _, tx := range block.Transactions {
		txid := tx.Hash.String()
		var feeSat int64 = 0
		if !tx.IsCoinbase {
			feeSat = 0 - tx.TotalOutSat
		}
		if err := batch.Append(
			txid,
			block.Height,
			blockHash,
			block.Header.Timestamp,
			tx.Version,
			tx.LockTime,
			uint32(0),
			uint32(0),
			tx.VinCount,
			tx.VoutCount,
			uint8(map[bool]uint8{true: 1, false: 0}[tx.IsCoinbase]),
			uint64(tx.TotalOutSat),
			feeSat,
		); err != nil {
			return err
		}
	}
	return batch.Send()
}

func (c *Client) InsertOutputs(ctx context.Context, block *parser.ParsedBlock) error {
	batch, err := c.conn.PrepareBatch(ctx, fmt.Sprintf(`INSERT INTO %s.outputs`, c.db))
	if err != nil {
		return err
	}

	for _, tx := range block.Transactions {
		txid := tx.Hash.String()
		for _, out := range tx.Outputs {
			if err := batch.Append(
				txid,
				out.Index,
				uint64(out.ValueSat),
				out.ScriptHex,
				out.ScriptType,
				out.Address,
				false,
				"",
				block.Height,
				block.Header.Timestamp,
			); err != nil {
				return err
			}
		}
	}
	return batch.Send()
}

func (c *Client) InsertInputs(ctx context.Context, block *parser.ParsedBlock) error {
	batch, err := c.conn.PrepareBatch(ctx, fmt.Sprintf(`INSERT INTO %s.inputs`, c.db))
	if err != nil {
		return err
	}

	for _, tx := range block.Transactions {
		txid := tx.Hash.String()
		for _, in := range tx.Inputs {
			if err := batch.Append(
				txid,
				in.Index,
				in.PrevTxID.String(),
				in.PrevIndex,
				in.ScriptSigHex,
				in.Sequence,
				in.CoinbaseData,
				block.Height,
				block.Header.Timestamp,
			); err != nil {
				return err
			}
		}
	}
	return batch.Send()
}

func (c *Client) Close() error {
	return c.conn.Close()
}
