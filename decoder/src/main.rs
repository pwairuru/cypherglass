//! Single-binary Bitcoin block decoder: `blk*.dat` files → ClickHouse.
//!
//! Pipeline: env config → infinite ClickHouse connect retry (5 s backoff,
//! Go parity) → load resume checkpoint (Go v1 migrates with `.bak`) → open
//! disk UTXO → catch-up → `notify` watch + 10 s poll → SIGINT/SIGTERM
//! graceful shutdown with partial-batch flush.
//!
//! `CLICKHOUSE_PORT` is the **HTTP** port (8123 on the server image); the
//! retired Go client spoke the native protocol on 9000.
//!
//! Runtime discipline: [`NativeWriter`](decoder::native::NativeWriter) owns a
//! private Tokio runtime and exposes a blocking API, so the entire pipeline
//! (connect retry, ping, syncer) runs on ONE dedicated plain `std::thread`.
//! The async main exists only to wait for the shutdown signal. Never
//! `block_on` from async code (it panics); never run the syncer on a Tokio
//! worker for the same reason.

use std::process::ExitCode;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use decoder::ch::ClickHouseWriter;
use decoder::config::{valid_db_name, Config};
use decoder::native::NativeWriter;
use decoder::state::{load_state, save_state_atomic};
use decoder::syncer::Syncer;
use decoder::utxo::UtxoStore;

/// Outcome of the pipeline thread.
enum Outcome {
    /// Signal arrived during the connect-retry wait; nothing synced.
    Aborted,
    /// Sync ran (possibly with an error); the value is the run result.
    Done(anyhow::Result<()>),
}

/// Sleep `dur` total, waking every 100 ms to check `stop` (prompt signal
/// abort during the 5 s CH backoff, Go parity).
fn sleep_or_stop(dur: Duration, stop: &AtomicBool) -> bool {
    let steps = dur.as_millis().div_ceil(100) as u64;
    for _ in 0..steps {
        if stop.load(Ordering::Relaxed) {
            return true;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    stop.load(Ordering::Relaxed)
}

/// The whole blocking pipeline: retry → state → UTXO → syncer run.
fn pipeline(cfg: Config, stop: &AtomicBool) -> Outcome {
    // Infinite backoff: long CH outages must not kill the decoder
    // (Go parity: Fatal + unless-stopped = crash loop).
    let mut attempt = 0u32;
    let writer = loop {
        if stop.load(Ordering::Relaxed) {
            return Outcome::Aborted;
        }
        attempt += 1;
        match NativeWriter::new(
            &cfg.clickhouse_host,
            cfg.clickhouse_port,
            &cfg.clickhouse_user,
            &cfg.clickhouse_password,
            &cfg.clickhouse_database,
        )
        .and_then(|w| w.ping().map(|()| w))
        {
            Ok(w) => {
                eprintln!("ClickHouse ready after {attempt} attempt(s)");
                break w;
            }
            Err(err) => {
                eprintln!("ClickHouse not ready (attempt {attempt}): {err:#}");
            }
        }
        if sleep_or_stop(Duration::from_secs(5), stop) {
            eprintln!("Aborted waiting for ClickHouse");
            return Outcome::Aborted;
        }
    };

    eprintln!(
        "Connecting to ClickHouse http://{}:{}",
        cfg.clickhouse_host, cfg.clickhouse_port
    );
    let st = load_state(&cfg.state_file);
    // Checkpoint any v1 -> v2 migration immediately so the `.bak` rollback
    // stays a plain restore.
    if let Err(err) = save_state_atomic(&cfg.state_file, &st) {
        eprintln!("warning: state save failed: {err:#}");
    }

    let utxo = match UtxoStore::open(&cfg.utxo_db) {
        Ok(u) => u,
        Err(err) => {
            return Outcome::Done(Err(anyhow::anyhow!(
                "opening UTXO store {}: {err:#}",
                cfg.utxo_db.display()
            )));
        }
    };

    eprintln!(
        "Starting sync from block {} (batch_blocks={})",
        st.last_height.saturating_add(1),
        cfg.batch_blocks
    );
    let mut syncer = Syncer::new(
        cfg.blocks_dir.clone(),
        cfg.state_file.clone(),
        st,
        utxo,
        ClickHouseWriter::new(writer),
        cfg.batch_blocks,
    );
    let res = syncer.run(stop).map(|()| {
        eprintln!(
            "Stopped at height {} file {:?} offset {}",
            syncer.state().last_height,
            syncer.state().last_file,
            syncer.state().last_offset
        );
    });
    Outcome::Done(res)
}

/// Wait for SIGINT or SIGTERM (Unix). Returns when either arrives.
async fn shutdown_signal() {
    #[cfg(unix)]
    {
        use tokio::signal::unix::{signal, SignalKind};
        let mut interrupt = signal(SignalKind::interrupt()).expect("install SIGINT handler");
        let mut terminate = signal(SignalKind::terminate()).expect("install SIGTERM handler");
        tokio::select! {
            _ = interrupt.recv() => {},
            _ = terminate.recv() => {},
        }
    }
    #[cfg(not(unix))]
    {
        let _ = tokio::signal::ctrl_c().await;
    }
}

#[tokio::main(flavor = "current_thread")]
async fn main() -> ExitCode {
    let cfg = Config::from_env();
    if !valid_db_name(&cfg.clickhouse_database) {
        eprintln!(
            "invalid CLICKHOUSE_DATABASE {:?}: must match ^[A-Za-z_][A-Za-z0-9_]{{0,63}}$",
            cfg.clickhouse_database
        );
        return ExitCode::from(2);
    }

    eprintln!(
        "Connecting to ClickHouse http://{}:{}",
        cfg.clickhouse_host, cfg.clickhouse_port
    );
    let stop = Arc::new(AtomicBool::new(false));
    let stop_pipe = Arc::clone(&stop);
    let handle = std::thread::spawn(move || pipeline(cfg, &stop_pipe));

    shutdown_signal().await;
    eprintln!("Shutting down...");
    stop.store(true, Ordering::Relaxed);
    // `join` only blocks; it never touches a runtime, so spawn_blocking is safe.
    let joined = tokio::task::spawn_blocking(|| handle.join()).await;
    match joined {
        Ok(Ok(Outcome::Aborted)) => ExitCode::SUCCESS,
        Ok(Ok(Outcome::Done(Ok(())))) => ExitCode::SUCCESS,
        Ok(Ok(Outcome::Done(Err(err)))) => {
            eprintln!("ERROR during sync: {err:#}");
            ExitCode::from(1)
        }
        Ok(Err(_)) => {
            eprintln!("ERROR: pipeline thread panicked");
            ExitCode::from(1)
        }
        Err(err) => {
            eprintln!("ERROR joining pipeline thread: {err}");
            ExitCode::from(1)
        }
    }
}
