//! Single-binary Bitcoin block decoder: blk files → ClickHouse.
//!
//! Task 1 scaffolding: load env config, validate the DB identifier, load the
//! resume checkpoint (migrating Go v1 state), and checkpoint it back. Task 7
//! replaces this wiring with the full pipeline (CH retry, watch loop,
//! signal shutdown).

mod config;
mod state;

use std::process::ExitCode;

use config::{valid_db_name, Config};
use state::{load_state, save_state_atomic};

fn main() -> ExitCode {
    let cfg = Config::from_env();
    if !valid_db_name(&cfg.clickhouse_database) {
        eprintln!(
            "invalid CLICKHOUSE_DATABASE {:?}: must match ^[A-Za-z_][A-Za-z0-9_]{{0,63}}$",
            cfg.clickhouse_database
        );
        return ExitCode::from(2);
    }
    let st = load_state(&cfg.state_file);
    println!(
        "decoder resume height={} file={:?} offset={} state={}",
        st.last_height,
        st.last_file,
        st.last_offset,
        cfg.state_file.display()
    );
    // Checkpoint any v1 -> v2 migration immediately so the `.bak` rollback
    // stays a plain restore.
    if let Err(err) = save_state_atomic(&cfg.state_file, &st) {
        eprintln!("warning: state save failed: {err:#}");
    }
    ExitCode::SUCCESS
}
