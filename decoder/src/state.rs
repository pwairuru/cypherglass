//! Persistent sync checkpoint: `{last_height,last_file,last_offset}`.
//!
//! State file is JSON, mode `0600`, written atomically (tmp file + rename).
//! Version 1 is the Go format (no `version` key); it is migrated to v2 on
//! load with the original bytes preserved at `<STATE_FILE>.bak`.
//! Corrupt JSON, negative offsets, or hostile `last_file` values resume from
//! a zero state with a warning, never a panic.

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

/// Current on-disk state schema version.
pub const STATE_VERSION: u8 = 2;

/// Resume checkpoint for the blk-file syncer.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SyncState {
    pub version: u8,
    pub last_height: u32,
    pub last_file: String,
    pub last_offset: i64,
}

impl Default for SyncState {
    fn default() -> Self {
        Self {
            version: STATE_VERSION,
            last_height: 0,
            last_file: String::new(),
            last_offset: 0,
        }
    }
}

/// Go-era state shape (no `version` key), accepted for one-way migration.
#[derive(Deserialize)]
struct GoStateV1 {
    #[serde(default)]
    last_height: u32,
    #[serde(default)]
    last_file: String,
    #[serde(default)]
    last_offset: i64,
}

/// Strict Bitcoin Core block file name, mirroring Go `loadState` hygiene:
/// `blk` + 1+ digits + `.dat`, total length 8..=32.
fn valid_state_file_name(name: &str) -> bool {
    if name.len() < 8 || name.len() > 32 {
        return false;
    }
    if !name.starts_with("blk") || !name.ends_with(".dat") {
        return false;
    }
    let digits = &name[3..name.len() - 4];
    !digits.is_empty() && digits.bytes().all(|b| b.is_ascii_digit())
}

/// Fail-closed validation shared by v1-migrated and v2 states: a tampered
/// `last_file` must never steer resume, nor may a negative offset.
fn validated(mut state: SyncState) -> SyncState {
    if !state.last_file.is_empty() && !valid_state_file_name(&state.last_file) {
        eprintln!(
            "WARNING: ignoring suspicious last_file {:?}, resuming clean",
            state.last_file
        );
        return SyncState::default();
    }
    if state.last_offset < 0 {
        eprintln!(
            "WARNING: ignoring negative last_offset {}, resuming clean",
            state.last_offset
        );
        return SyncState::default();
    }
    state.version = STATE_VERSION;
    state
}

fn backup_path(path: &Path) -> PathBuf {
    let mut s = path.as_os_str().to_owned();
    s.push(".bak");
    PathBuf::from(s)
}

/// Load the checkpoint at `path`, migrating Go v1 state (no `version` key)
/// to v2 with a `.bak` copy of the original. Missing files, corrupt JSON,
/// unknown versions, hostile file names, and negative offsets all resume
/// from a zero state with a warning.
pub fn load_state(path: &Path) -> SyncState {
    let data = match std::fs::read(path) {
        Ok(data) => data,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => return SyncState::default(),
        Err(err) => {
            eprintln!("ERROR reading state {}: {err}", path.display());
            return SyncState::default();
        }
    };

    // Current schema: must carry version 2 explicitly.
    match serde_json::from_slice::<SyncState>(&data) {
        Ok(state) if state.version == STATE_VERSION => return validated(state),
        Ok(state) if state.version <= 1 => {
            // Explicit version 0/1: treat like Go v1 below.
        }
        Ok(state) => {
            eprintln!(
                "WARNING: unsupported state version {}, resuming clean",
                state.version
            );
            return SyncState::default();
        }
        Err(_) => {
            // Missing version key (or wrong types): try the Go v1 shape.
        }
    }

    match serde_json::from_slice::<GoStateV1>(&data) {
        Ok(v1) => {
            let bak = backup_path(path);
            if !bak.exists() {
                if let Err(err) = std::fs::write(&bak, &data) {
                    eprintln!(
                        "WARNING: cannot write state backup {}: {err}",
                        bak.display()
                    );
                } else {
                    #[cfg(unix)]
                    {
                        use std::os::unix::fs::PermissionsExt;
                        let _ =
                            std::fs::set_permissions(&bak, std::fs::Permissions::from_mode(0o600));
                    }
                }
            }
            let migrated = SyncState {
                version: STATE_VERSION,
                last_height: v1.last_height,
                last_file: v1.last_file,
                last_offset: v1.last_offset,
            };
            let validated = validated(migrated);
            // Persist the migrated schema now so rollback stays a plain `.bak` restore.
            if let Err(err) = save_state_atomic(path, &validated) {
                eprintln!("WARNING: cannot persist migrated state: {err:#}");
            }
            validated
        }
        Err(err) => {
            eprintln!(
                "WARNING: corrupt state {}, resuming clean: {err}",
                path.display()
            );
            SyncState::default()
        }
    }
}

/// Write `state` atomically: tmp file in the same directory with mode
/// `0600`, fsync, then rename over `path`.
pub fn save_state_atomic(path: &Path, state: &SyncState) -> Result<()> {
    if let Some(dir) = path.parent().filter(|p| !p.as_os_str().is_empty()) {
        std::fs::create_dir_all(dir)
            .with_context(|| format!("creating state dir {}", dir.display()))?;
    }
    let data = serde_json::to_vec(state).context("serializing sync state")?;
    let mut tmp = path.as_os_str().to_owned();
    tmp.push(format!(".tmp.{}", std::process::id()));
    let tmp = PathBuf::from(tmp);

    {
        use std::io::Write;
        let mut f = std::fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .open(&tmp)
            .with_context(|| format!("opening temp state {}", tmp.display()))?;
        f.write_all(&data)
            .with_context(|| format!("writing temp state {}", tmp.display()))?;
        f.sync_all()
            .with_context(|| format!("fsync temp state {}", tmp.display()))?;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&tmp, std::fs::Permissions::from_mode(0o600))
            .with_context(|| format!("chmod temp state {}", tmp.display()))?;
    }
    std::fs::rename(&tmp, path)
        .with_context(|| format!("renaming {} to {}", tmp.display(), path.display()))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{load_state, save_state_atomic, SyncState, STATE_VERSION};
    use std::path::PathBuf;

    #[test]
    fn migrates_go_state_with_backup() {
        // write Go-format {"last_height":800000,...} with no version, load, expect version==2 and .bak exists
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("decoder_state.json");
        let original = r#"{"last_height":800000,"last_file":"blk00012.dat","last_offset":456}"#;
        std::fs::write(&path, original).unwrap();

        let st = load_state(&path);
        assert_eq!(st.version, 2);
        assert_eq!(STATE_VERSION, 2);
        assert_eq!(st.last_height, 800000);
        assert_eq!(st.last_file, "blk00012.dat");
        assert_eq!(st.last_offset, 456);

        let bak = PathBuf::from(format!("{}.bak", path.display()));
        assert!(bak.exists(), ".bak backup must exist after migration");
        assert_eq!(std::fs::read_to_string(&bak).unwrap(), original);

        // On-disk state is now v2 and reloads without another migration.
        let reloaded = load_state(&path);
        assert_eq!(reloaded, st);
    }

    #[test]
    fn corrupt_state_resumes_clean() {
        // garbage bytes + negative offset + hostile LastFile "../evil.dat" -> zero state, no panic
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("decoder_state.json");

        std::fs::write(&path, b"\xff\xfe{{{not json").unwrap();
        assert_eq!(load_state(&path), SyncState::default());

        std::fs::write(
            &path,
            r#"{"version":2,"last_height":5,"last_file":"blk00001.dat","last_offset":-1}"#,
        )
        .unwrap();
        assert_eq!(load_state(&path), SyncState::default());

        std::fs::write(
            &path,
            r#"{"version":2,"last_height":5,"last_file":"../evil.dat","last_offset":10}"#,
        )
        .unwrap();
        assert_eq!(load_state(&path), SyncState::default());

        // Unknown future versions also resume clean.
        std::fs::write(
            &path,
            r#"{"version":99,"last_height":5,"last_file":"blk00001.dat","last_offset":10}"#,
        )
        .unwrap();
        assert_eq!(load_state(&path), SyncState::default());

        // Missing file resumes clean.
        let missing = dir.path().join("does-not-exist.json");
        assert_eq!(load_state(&missing), SyncState::default());

        // save round-trip still works after corrupt loads
        let st = SyncState {
            version: STATE_VERSION,
            last_height: 800001,
            last_file: "blk00013.dat".to_string(),
            last_offset: 78,
        };
        save_state_atomic(&path, &st).unwrap();
        assert_eq!(load_state(&path), st);

        // Saved file is 0600 and valid JSON with version 2.
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = std::fs::metadata(&path).unwrap().permissions().mode() & 0o777;
            assert_eq!(mode, 0o600, "state file must be 0600");
        }
        let raw = std::fs::read_to_string(&path).unwrap();
        assert!(
            raw.contains("\"version\":2"),
            "on-disk state must carry version"
        );
    }
}
