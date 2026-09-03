// decoder/internal/enrich/utxo.go
package enrich

import (
	"fmt"
	"sync"
)

type UTXOMap struct {
	mu sync.RWMutex
	m  map[string]uint64
}

func NewUTXOMap() *UTXOMap { return &UTXOMap{m: make(map[string]uint64)} }

func mapKey(txid string, index uint32) string { return fmt.Sprintf("%s:%d", txid, index) }

func (u *UTXOMap) Put(txid string, index uint32, value uint64) {
	u.mu.Lock()
	defer u.mu.Unlock()
	u.m[mapKey(txid, index)] = value
}

func (u *UTXOMap) Get(txid string, index uint32) (uint64, bool) {
	u.mu.RLock()
	defer u.mu.RUnlock()
	v, ok := u.m[mapKey(txid, index)]
	return v, ok
}

func (u *UTXOMap) Delete(txid string, index uint32) {
	u.mu.Lock()
	defer u.mu.Unlock()
	delete(u.m, mapKey(txid, index))
}

func (u *UTXOMap) Len() int {
	u.mu.RLock()
	defer u.mu.RUnlock()
	return len(u.m)
}
