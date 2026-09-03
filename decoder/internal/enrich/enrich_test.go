// decoder/internal/enrich/enrich_test.go
package enrich

import "testing"

func TestSubsidySchedule(t *testing.T) {
	if got := SubsidyAt(0); got != 5000000000 {
		t.Fatalf("genesis subsidy = %d", got)
	}
	if got := SubsidyAt(210000); got != 2500000000 {
		t.Fatalf("halving1 = %d", got)
	}
	if got := SubsidyAt(840000); got != 312500000 {
		t.Fatalf("halving4 = %d", got)
	}
}

func TestUTXOMapPutGet(t *testing.T) {
	m := NewUTXOMap()
	m.Put("abc", 0, 1000)
	v, ok := m.Get("abc", 0)
	if !ok || v != 1000 {
		t.Fatalf("get = %d %v", v, ok)
	}
}

func TestFeeRate(t *testing.T) {
	if got := FeeRate(1000, 250); got != 4.0 {
		t.Fatalf("feerate = %v", got)
	}
}

func TestBucketFor(t *testing.T) {
	if BucketFor(500) != "dust" {
		t.Fatalf("dust bucket wrong")
	}
	if BucketFor(150000000000) != "whale" {
		t.Fatalf("whale bucket wrong")
	}
}
