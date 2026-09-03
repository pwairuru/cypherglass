package parser

import (
	"github.com/btcsuite/btcd/chaincfg"
	"github.com/btcsuite/btcd/txscript"
)

var mainNetParams = chaincfg.MainNetParams

func ExtractAddress(pkScript []byte) (string, string) {
	scriptClass, addresses, _, err := txscript.ExtractPkScriptAddrs(pkScript, &mainNetParams)
	if err != nil {
		return "", "unknown"
	}
	if len(addresses) == 0 {
		return "", scriptClass.String()
	}
	return addresses[0].EncodeAddress(), scriptClass.String()
}
