package parser

import "github.com/btcsuite/btcd/chaincfg/chainhash"

type ParsedTx struct {
	Hash        chainhash.Hash
	Version     int32
	LockTime    uint32
	IsCoinbase  bool
	Inputs      []ParsedInput
	Outputs     []ParsedOutput
	VinCount    uint16
	VoutCount   uint16
	TotalOutSat int64
	// SizeVBytes is BIP-141 vsize (weight+3)/4; WeightUnits is tx weight.
	SizeVBytes  uint32
	WeightUnits uint32
}

type ParsedInput struct {
	Index        uint32
	PrevTxID     chainhash.Hash
	PrevIndex    uint32
	ScriptSigHex string
	Sequence     uint32
	CoinbaseData string
}

type ParsedOutput struct {
	Index      uint32
	ValueSat   int64
	ScriptHex  string
	Address    string
	ScriptType string
}
