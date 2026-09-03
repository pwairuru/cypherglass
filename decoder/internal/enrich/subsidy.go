// decoder/internal/enrich/subsidy.go
package enrich

func SubsidyAt(height uint32) uint64 {
	halvings := height / 210000
	if halvings >= 64 {
		return 0
	}
	return (50 * 100000000) >> halvings
}

func FeeRate(feeSat int64, vsize uint32) float32 {
	if vsize == 0 {
		return 0
	}
	return float32(feeSat) / float32(vsize)
}

func BucketFor(balanceSat int64) string {
	switch {
	case balanceSat < 1000:
		return "dust"
	case balanceSat < 1000000:
		return "shrimp"
	case balanceSat < 10000000:
		return "crab"
	case balanceSat < 100000000:
		return "fish"
	case balanceSat < 1000000000:
		return "shark"
	case balanceSat < 1000000000000:
		return "whale"
	default:
		return "humpback"
	}
}
