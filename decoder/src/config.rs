//! Runtime configuration loaded from the environment.
//!
//! Mirrors the Go decoder's `getEnv` defaults in `decoder/main.go` plus the
//! plan's extra knobs (`UTXO_DB`, `BATCH_BLOCKS`). Empty env values fall back
//! to defaults, exactly like Go's `getEnv`.

use std::path::PathBuf;

/// Single-variant network hook (spec: mainnet-only v1). Later chains must
/// extend this enum instead of reshaping [`Config`].
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum Network {
    /// Bitcoin mainnet: magic `f9 be b4 d9`, mainnet address params.
    #[default]
    Mainnet,
}

/// All runtime knobs for the decoder binary.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Config {
    pub clickhouse_host: String,
    pub clickhouse_port: u16,
    pub clickhouse_user: String,
    pub clickhouse_password: String,
    pub clickhouse_database: String,
    pub blocks_dir: PathBuf,
    pub state_file: PathBuf,
    pub utxo_db: PathBuf,
    pub batch_blocks: usize,
    pub network: Network,
}

fn env_or(key: &str, fallback: &str) -> String {
    match std::env::var(key) {
        Ok(v) if !v.is_empty() => v,
        _ => fallback.to_string(),
    }
}

fn env_or_parse<T>(key: &str, fallback: T) -> T
where
    T: std::str::FromStr,
{
    match std::env::var(key) {
        Ok(v) if !v.is_empty() => v.parse().unwrap_or(fallback),
        _ => fallback,
    }
}

impl Config {
    /// Build configuration from the environment, applying documented defaults:
    /// `CLICKHOUSE_HOST=clickhouse`, `CLICKHOUSE_PORT=8123` (HTTP; the
    /// retired Go client used native 9000),
    /// `CLICKHOUSE_USER=bitcoin`, `CLICKHOUSE_PASSWORD=bitcoin_clickhouse`,
    /// `CLICKHOUSE_DATABASE=bitcoin`, `BLOCKS_DIR=/data/bitcoin/blocks`,
    /// `STATE_FILE=/data/decoder_state.json`,
    /// `UTXO_DB=<STATE_FILE dir>/utxo.redb`, `BATCH_BLOCKS=10`.
    pub fn from_env() -> Self {
        let state_file = PathBuf::from(env_or("STATE_FILE", "/data/decoder_state.json"));
        let utxo_db = match std::env::var("UTXO_DB") {
            Ok(v) if !v.is_empty() => PathBuf::from(v),
            _ => state_file
                .parent()
                .filter(|p| !p.as_os_str().is_empty())
                .map_or_else(|| PathBuf::from("utxo.redb"), |dir| dir.join("utxo.redb")),
        };
        // A zero batch size would stall the syncer; clamp to at least 1.
        let batch_blocks: usize = env_or_parse("BATCH_BLOCKS", 10);
        let batch_blocks = batch_blocks.max(1);
        Self {
            clickhouse_host: env_or("CLICKHOUSE_HOST", "clickhouse"),
            clickhouse_port: env_or_parse("CLICKHOUSE_PORT", 8123),
            clickhouse_user: env_or("CLICKHOUSE_USER", "bitcoin"),
            clickhouse_password: env_or("CLICKHOUSE_PASSWORD", "bitcoin_clickhouse"),
            clickhouse_database: env_or("CLICKHOUSE_DATABASE", "bitcoin"),
            blocks_dir: PathBuf::from(env_or("BLOCKS_DIR", "/data/bitcoin/blocks")),
            state_file,
            utxo_db,
            batch_blocks,
            network: Network::Mainnet,
        }
    }
}

/// Validate a ClickHouse database identifier before interpolating it into
/// `INSERT INTO <db>.<table>` statements (values stay bound parameters).
///
/// Exact regex: `^[A-Za-z_][A-Za-z0-9_]{0,63}$` (same as Go `dbIdentRe`).
pub fn valid_db_name(name: &str) -> bool {
    let bytes = name.as_bytes();
    if bytes.is_empty() || bytes.len() > 64 {
        return false;
    }
    let first = bytes[0];
    if !(first.is_ascii_alphabetic() || first == b'_') {
        return false;
    }
    bytes[1..]
        .iter()
        .all(|b| b.is_ascii_alphanumeric() || *b == b'_')
}

#[cfg(test)]
mod tests {
    use super::{valid_db_name, Config};

    #[test]
    fn rejects_injection_db_name() {
        assert!(!valid_db_name("bitcoin; DROP TABLE x"));
        assert!(valid_db_name("bitcoin"));
    }

    #[test]
    fn db_name_parity_with_go_vectors() {
        for ok in ["bitcoin", "btc_2", "_x", "A"] {
            assert!(valid_db_name(ok), "must accept {ok:?}");
        }
        // 64 chars is the max (`_` + 63); 65 must fail.
        assert!(valid_db_name(&"a".repeat(64)));
        for bad in [
            "",
            "bitcoin; DROP TABLE x",
            "a-b",
            "a b",
            "a.b",
            "a`b",
            "bitcoin\" --",
            "x';--",
            "toString(1)",
            "a/b",
            "..",
            &"a".repeat(65),
            "0abc",
            "ünicode",
        ] {
            assert!(!valid_db_name(bad), "must reject {bad:?}");
        }
    }

    #[test]
    fn env_defaults_and_overrides() {
        // Defaults with a clean environment.
        for key in [
            "CLICKHOUSE_HOST",
            "CLICKHOUSE_PORT",
            "CLICKHOUSE_USER",
            "CLICKHOUSE_PASSWORD",
            "CLICKHOUSE_DATABASE",
            "BLOCKS_DIR",
            "STATE_FILE",
            "UTXO_DB",
            "BATCH_BLOCKS",
        ] {
            std::env::remove_var(key);
        }
        let cfg = Config::from_env();
        assert_eq!(cfg.clickhouse_host, "clickhouse");
        assert_eq!(cfg.clickhouse_port, 8123);
        assert_eq!(cfg.clickhouse_user, "bitcoin");
        assert_eq!(cfg.clickhouse_password, "bitcoin_clickhouse");
        assert_eq!(cfg.clickhouse_database, "bitcoin");
        assert_eq!(cfg.blocks_dir.to_str().unwrap(), "/data/bitcoin/blocks");
        assert_eq!(cfg.state_file.to_str().unwrap(), "/data/decoder_state.json");
        // UTXO_DB defaults to the state file's directory.
        assert_eq!(cfg.utxo_db.to_str().unwrap(), "/data/utxo.redb");
        assert_eq!(cfg.batch_blocks, 10);

        // Overrides + empty-means-default (Go getEnv parity).
        std::env::set_var("CLICKHOUSE_HOST", "ch-internal");
        std::env::set_var("CLICKHOUSE_PORT", "9001");
        std::env::set_var("BATCH_BLOCKS", "25");
        std::env::set_var("UTXO_DB", "/vol/utxo.redb");
        std::env::set_var("CLICKHOUSE_USER", "");
        let cfg = Config::from_env();
        assert_eq!(cfg.clickhouse_host, "ch-internal");
        assert_eq!(cfg.clickhouse_port, 9001);
        assert_eq!(cfg.batch_blocks, 25);
        assert_eq!(cfg.utxo_db.to_str().unwrap(), "/vol/utxo.redb");
        assert_eq!(cfg.clickhouse_user, "bitcoin");

        // Bad numbers fall back; zero batch clamps to 1.
        std::env::set_var("CLICKHOUSE_PORT", "not-a-port");
        std::env::set_var("BATCH_BLOCKS", "0");
        let cfg = Config::from_env();
        assert_eq!(cfg.clickhouse_port, 8123);
        assert_eq!(cfg.batch_blocks, 1);

        for key in [
            "CLICKHOUSE_HOST",
            "CLICKHOUSE_PORT",
            "CLICKHOUSE_USER",
            "UTXO_DB",
            "BATCH_BLOCKS",
        ] {
            std::env::remove_var(key);
        }
    }
}
