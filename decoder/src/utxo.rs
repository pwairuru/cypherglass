//! Disk-backed UTXO store (redb page cache; no separate LRU).

use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};

use anyhow::Result;
use redb::{Database, ReadableTableMetadata, TableDefinition};

use crate::ch::{UtxoDeletes, UtxoPuts};

const UTXO_TABLE: TableDefinition<&str, u64> = TableDefinition::new("utxo");

fn key(txid: &str, vout: u32) -> String {
    format!("{txid}:{vout}")
}

pub struct UtxoStore {
    db: Database,
    misses: AtomicU64,
}

impl UtxoStore {
    pub fn open(path: &Path) -> Result<Self> {
        let db = Database::create(path)?;
        {
            let txn = db.begin_write()?;
            {
                let _ = txn.open_table(UTXO_TABLE)?;
            }
            txn.commit()?;
        }
        // State + UTXO files carry chain position: restrict to owner
        // read/write regardless of the process umask (state file is 0600;
        // Go parity on checkpoint hygiene).
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))?;
        }
        Ok(Self {
            db,
            misses: AtomicU64::new(0),
        })
    }

    pub fn put(&self, txid: &str, vout: u32, value: u64) -> Result<()> {
        let k = key(txid, vout);
        let txn = self.db.begin_write()?;
        {
            let mut table = txn.open_table(UTXO_TABLE)?;
            table.insert(k.as_str(), value)?;
        }
        txn.commit()?;
        Ok(())
    }

    pub fn get(&self, txid: &str, vout: u32) -> Result<Option<u64>> {
        let k = key(txid, vout);
        let txn = self.db.begin_read()?;
        let table = txn.open_table(UTXO_TABLE)?;
        match table.get(k.as_str())? {
            Some(guard) => Ok(Some(guard.value())),
            None => {
                self.misses.fetch_add(1, Ordering::Relaxed);
                Ok(None)
            }
        }
    }

    pub fn delete(&self, txid: &str, vout: u32) -> Result<()> {
        let k = key(txid, vout);
        let txn = self.db.begin_write()?;
        {
            let mut table = txn.open_table(UTXO_TABLE)?;
            table.remove(k.as_str())?;
        }
        txn.commit()?;
        Ok(())
    }

    /// Apply many puts + deletes in a SINGLE write transaction (one commit,
    /// one fsync). The syncer batches a whole `flush_pending` through here;
    /// per-op `put`/`delete` above remain for tests and single-point use.
    /// Keys keep the `txid:vout` encoding; later ops in the same batch win
    /// (same overwrite/no-op-missing semantics as the one-by-one path).
    pub fn batch_write(&self, puts: &UtxoPuts, deletes: &UtxoDeletes) -> Result<()> {
        let txn = self.db.begin_write()?;
        {
            let mut table = txn.open_table(UTXO_TABLE)?;
            for (txid, vout, value) in puts {
                table.insert(key(txid, *vout).as_str(), *value)?;
            }
            for (txid, vout) in deletes {
                table.remove(key(txid, *vout).as_str())?;
            }
        }
        txn.commit()?;
        Ok(())
    }

    pub fn len(&self) -> u64 {
        let txn = match self.db.begin_read() {
            Ok(txn) => txn,
            Err(_) => return 0,
        };
        let table = match txn.open_table(UTXO_TABLE) {
            Ok(table) => table,
            Err(_) => return 0,
        };
        table.len().unwrap_or(0)
    }

    /// Task 7 gate addition: `clippy::len_without_is_empty` companion.
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    pub fn misses(&self) -> u64 {
        self.misses.load(Ordering::Relaxed)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn put_get_delete_survives_reopen() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("utxo.redb");
        let store = UtxoStore::open(&path).unwrap();
        store.put("abc123", 0, 50_000).unwrap();
        drop(store);
        let store = UtxoStore::open(&path).unwrap();
        assert_eq!(store.get("abc123", 0).unwrap(), Some(50_000));
        store.delete("abc123", 0).unwrap();
        assert_eq!(store.get("abc123", 0).unwrap(), None);
    }

    #[test]
    fn miss_returns_none() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("utxo.redb");
        let store = UtxoStore::open(&path).unwrap();
        assert_eq!(store.get("nope", 7).unwrap(), None);
        assert_eq!(store.misses(), 1);
        assert_eq!(store.get("nope", 7).unwrap(), None);
        assert_eq!(store.misses(), 2);
    }

    #[test]
    fn db_file_is_owner_only() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("utxo.redb");
        let _store = UtxoStore::open(&path).unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = std::fs::metadata(&path).unwrap().permissions().mode();
            assert_eq!(mode & 0o777, 0o600, "utxo.redb must be 0600, got {mode:o}");
        }
    }

    #[test]
    fn batch_write_applies_puts_then_deletes_atomically() {
        let dir = tempfile::tempdir().unwrap();
        let store = UtxoStore::open(&dir.path().join("utxo.redb")).unwrap();
        // Later ops win; deleting a missing key is a no-op (one-by-one parity).
        let puts: UtxoPuts = vec![
            ("a".into(), 0, 100),
            ("a".into(), 0, 200),
            ("b".into(), 1, 300),
        ];
        let deletes: UtxoDeletes = vec![("b".into(), 1), ("ghost".into(), 9)];
        store.batch_write(&puts, &deletes).unwrap();
        assert_eq!(store.get("a", 0).unwrap(), Some(200));
        assert_eq!(store.get("b", 1).unwrap(), None);
        drop(store);
        let store = UtxoStore::open(&dir.path().join("utxo.redb")).unwrap();
        assert_eq!(
            store.get("a", 0).unwrap(),
            Some(200),
            "batch must be durable"
        );
    }
}
