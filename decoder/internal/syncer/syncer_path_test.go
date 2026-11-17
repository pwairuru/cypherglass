package syncer

import (
	"os"
	"path/filepath"
	"testing"
)

// Valid names resolve inside blocksDir.
func TestResolveBlkPathValid(t *testing.T) {
	dir := t.TempDir()
	for _, name := range []string{"blk00000.dat", "blk00001.dat", "blk12345.dat"} {
		p := filepath.Join(dir, name)
		if err := os.WriteFile(p, []byte("x"), 0600); err != nil {
			t.Fatal(err)
		}
		got, err := resolveBlkPath(dir, p)
		if err != nil {
			t.Fatalf("resolve %s: %v", name, err)
		}
		if got != p {
			t.Fatalf("got %q want %q", got, p)
		}
	}
}

// Traversal, absolute escapes, and odd names must be rejected before open.
func TestResolveBlkPathRejectsTraversal(t *testing.T) {
	dir := t.TempDir()
	for _, bad := range []string{
		"../evil.dat",
		"../../etc/passwd",
		"/etc/passwd",
		"/tmp/blk00001.dat",
		"blk.dat",
		"blkX.dat",
		"blk00001.dat ",
		" blk00001.dat",
		"blk00001.DAT",
		"rev00001.dat",
		"xor.dat",
	} {
		if _, err := resolveBlkPath(dir, bad); err == nil {
			t.Fatalf("expected rejection for %q", bad)
		}
	}
	// Missing file (racy delete) surfaces an error so callers skip.
	if _, err := resolveBlkPath(dir, filepath.Join(dir, "blk00999.dat")); err == nil {
		t.Fatal("expected error for missing file")
	}
}

// A symlink named like a block file but pointing outside blocksDir must be
// rejected (planted-symlink exfiltration / parser-confusion guard).
func TestResolveBlkPathRejectsSymlinkEscape(t *testing.T) {
	dir := t.TempDir()
	outside := t.TempDir()
	secret := filepath.Join(outside, "secret.dat")
	if err := os.WriteFile(secret, []byte("s"), 0600); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(dir, "blk99999.dat")
	if err := os.Symlink(secret, link); err != nil {
		t.Skipf("symlinks unavailable: %v", err)
	}
	if _, err := resolveBlkPath(dir, link); err == nil {
		t.Fatal("expected rejection for symlink escaping blocksDir")
	}
	// A symlink pointing INSIDE blocksDir resolves fine.
	real := filepath.Join(dir, "blk00007.dat")
	if err := os.WriteFile(real, []byte("x"), 0600); err != nil {
		t.Fatal(err)
	}
	inner := filepath.Join(dir, "blk00008.dat")
	_ = os.Remove(inner)
	if err := os.Symlink(real, inner); err != nil {
		t.Skipf("symlinks unavailable: %v", err)
	}
	if _, err := resolveBlkPath(dir, inner); err != nil {
		t.Fatalf("inner symlink must resolve: %v", err)
	}
}
