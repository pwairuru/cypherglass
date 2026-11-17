package clickhouse

import "testing"

// The database name is interpolated into INSERT statements (values stay
// driver-bound parameters), so it must be a strict identifier.
func TestValidDBName(t *testing.T) {
	for _, ok := range []string{"bitcoin", "btc_2", "_x", "A"} {
		if !validDBName(ok) {
			t.Fatalf("must accept %q", ok)
		}
	}
	for _, bad := range []string{
		"", "bitcoin; DROP TABLE x", "a-b", "a b", "a.b", "a`b",
		"bitcoin\" --", "x';--", "toString(1)", "a/b", "..",
		"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
	} {
		if validDBName(bad) {
			t.Fatalf("must reject %q", bad)
		}
	}
}
