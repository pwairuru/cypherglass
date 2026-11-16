//! Disk-backed UTXO store (redb page cache; no separate LRU).

use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};

use anyhow::Result;
use redb::{Database, ReadableTableMetadata, TableDefinition};

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
}
