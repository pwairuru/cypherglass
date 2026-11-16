//! Bitcoin block decoder library: `blk*.dat` files → ClickHouse.
//!
//! The [`syncer`] module owns the pipeline (`catch_up` + `run`); the binary
//! entry point (`src/main.rs`) only wires env → ClickHouse connect retry →
//! state → UTXO → syncer → signal shutdown.

pub mod address;
pub mod ch;
pub mod config;
pub mod enrich;
pub mod native;
pub mod parser;
pub mod state;
pub mod syncer;
pub mod utxo;
