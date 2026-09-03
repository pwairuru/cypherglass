package parser

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"io"
	"log"

	"github.com/btcsuite/btcd/chaincfg/chainhash"
	"github.com/btcsuite/btcd/wire"
)

var mainnetMagic = []byte{0xf9, 0xbe, 0xb4, 0xd9}

// XORDeobfuscator deobfuscates Bitcoin Core blk*.dat files.
// Bitcoin Core obfuscates block files by XORing every byte with an 8-byte
// key stored in xor.dat in the blocks directory.
type XORDeobfuscator struct {
	key [8]byte
}

func NewXORDeobfuscator(key []byte) *XORDeobfuscator {
	d := &XORDeobfuscator{}
	copy(d.key[:], key)
	return d
}

func (d *XORDeobfuscator) Deobfuscate(buf []byte, offset int64) {
	if d == nil {
		return
	}
	for i := range buf {
		buf[i] ^= d.key[(int(offset)+i)%8]
	}
}

type ParsedBlock struct {
	Height       uint32
	Hash         chainhash.Hash
	Header       wire.BlockHeader
	Transactions []*ParsedTx
}

type BlockScanResult struct {
	Block       *ParsedBlock
	BytesRead   int64
	FileNum     int
	OffsetStart int64
}

func ParseBlock(raw []byte) (*ParsedBlock, error) {
	block := &wire.MsgBlock{}
	if err := block.Deserialize(bytes.NewReader(raw)); err != nil {
		return nil, fmt.Errorf("deserialize block: %w", err)
	}

	blockHash := block.BlockHash()

	pb := &ParsedBlock{
		Hash:   blockHash,
		Header: block.Header,
		Transactions: make([]*ParsedTx, 0, len(block.Transactions)),
	}

	for _, tx := range block.Transactions {
		pt := parseTransaction(tx)
		pb.Transactions = append(pb.Transactions, pt)
	}

	if len(block.Transactions) > 0 {
		coinbaseTx := block.Transactions[0]
		if len(coinbaseTx.TxIn) > 0 && len(coinbaseTx.TxIn[0].SignatureScript) > 0 {
			script := coinbaseTx.TxIn[0].SignatureScript
			if len(script) >= 4 {
				pb.Height = binary.LittleEndian.Uint32(script[0:4])
			}
		}
	}

	return pb, nil
}

func ScanBlocks(r io.ReadSeeker, fileNum int, startOffset int64, fn func(BlockScanResult) error) error {
	return ScanBlocksOpts(r, fileNum, startOffset, nil, fn)
}

// ScanBlocksOpts scans a blk*.dat file for blocks. If deobfuscator is non-nil,
// all data read is XOR-deobfuscated (Bitcoin Core block file obfuscation).
func ScanBlocksOpts(r io.ReadSeeker, fileNum int, startOffset int64, deobfuscator *XORDeobfuscator, fn func(BlockScanResult) error) error {
	if _, err := r.Seek(startOffset, io.SeekStart); err != nil {
		return fmt.Errorf("seek: %w", err)
	}

	var offset int64 = startOffset
	magicBuf := make([]byte, 4)
	sizeBuf := make([]byte, 4)

	for {
		_, err := io.ReadFull(r, magicBuf)
		if err == io.EOF || err == io.ErrUnexpectedEOF {
			return nil
		}
		if err != nil {
			return fmt.Errorf("read magic: %w", err)
		}
		if deobfuscator != nil {
			deobfuscator.Deobfuscate(magicBuf, offset)
		}
		offset += 4

		if !bytes.Equal(magicBuf, mainnetMagic) {
			if _, err := r.Seek(offset, io.SeekStart); err != nil {
				return fmt.Errorf("seek forward: %w", err)
			}
			continue
		}

		if _, err := io.ReadFull(r, sizeBuf); err != nil {
			if err == io.EOF || err == io.ErrUnexpectedEOF {
				return nil
			}
			return fmt.Errorf("read size: %w", err)
		}
		if deobfuscator != nil {
			deobfuscator.Deobfuscate(sizeBuf, offset)
		}
		blockSize := binary.LittleEndian.Uint32(sizeBuf)
		offset += 4

		blockData := make([]byte, blockSize)
		if _, err := io.ReadFull(r, blockData); err != nil {
			if err == io.EOF || err == io.ErrUnexpectedEOF {
				return nil
			}
			return fmt.Errorf("read block data: %w", err)
		}
		if deobfuscator != nil {
			deobfuscator.Deobfuscate(blockData, offset)
		}

		pb, err := ParseBlock(blockData)
		if err != nil {
			log.Printf("WARN: skipping block at offset %d: %v", offset, err)
			offset += int64(blockSize)
			continue
		}

		totalRead := int64(4 + 4 + blockSize)

		if err := fn(BlockScanResult{
			Block:       pb,
			BytesRead:   totalRead,
			FileNum:     fileNum,
			OffsetStart: offset - 4,
		}); err != nil {
			return err
		}

		offset += int64(blockSize)
	}
}

func parseTransaction(tx *wire.MsgTx) *ParsedTx {
	txHash := tx.TxHash()
	pt := &ParsedTx{
		Hash:     txHash,
		Version:  tx.Version,
		LockTime: tx.LockTime,
	}

	isCoinbase := len(tx.TxIn) > 0 &&
		tx.TxIn[0].PreviousOutPoint.Hash == (chainhash.Hash{}) &&
		tx.TxIn[0].PreviousOutPoint.Index == 0xFFFFFFFF

	pt.IsCoinbase = isCoinbase

	for i, in := range tx.TxIn {
		pi := ParsedInput{
			Index:    uint32(i),
			Sequence: in.Sequence,
		}
		if !isCoinbase {
			pi.PrevTxID = in.PreviousOutPoint.Hash
			pi.PrevIndex = in.PreviousOutPoint.Index
			pi.ScriptSigHex = fmt.Sprintf("%x", in.SignatureScript)
		} else {
			pi.CoinbaseData = fmt.Sprintf("%x", in.SignatureScript)
		}
		pt.Inputs = append(pt.Inputs, pi)
	}

	var totalOut int64
	for i, out := range tx.TxOut {
		po := ParsedOutput{
			Index:     uint32(i),
			ValueSat:  out.Value,
			ScriptHex: fmt.Sprintf("%x", out.PkScript),
		}
		po.Address, po.ScriptType = ExtractAddress(out.PkScript)
		pt.Outputs = append(pt.Outputs, po)
		totalOut += out.Value
	}

	pt.TotalOutSat = totalOut
	pt.VinCount = uint16(len(tx.TxIn))
	pt.VoutCount = uint16(len(tx.TxOut))

	return pt
}
