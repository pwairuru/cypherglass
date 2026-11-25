//! CypherGlass scheduler binary.
//!
//! Chart alert evaluation lives here, not in the API process, so ingest and
//! evaluation can be deployed and scaled independently.

use backend_rs::{charts::alerts, db::pg_pool, ChClient, Settings};
use std::time::Duration;

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt().init();

    let settings = Settings::from_env();
    let pg = pg_pool(&settings.database_url);
    let ch = ChClient::from_settings(&settings);
    let interval = std::env::var("SCHEDULER_INTERVAL_SECS")
        .ok()
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(300)
        .max(30);

    tracing::info!(interval_secs = interval, "scheduler started");
    let mut tick = tokio::time::interval(Duration::from_secs(interval));
    loop {
        tokio::select! {
            _ = tick.tick() => {
                match alerts::evaluate_due(&pg, &ch).await {
                    Ok(summary) => tracing::info!(
                        evaluated = summary.evaluated,
                        fired = summary.fired,
                        skipped = summary.skipped,
                        "chart-alerts tick"
                    ),
                    Err(err) => tracing::warn!(error = %err, "chart-alerts tick failed"),
                }
            }
            _ = shutdown_signal() => {
                tracing::info!("scheduler stopping");
                break;
            }
        }
    }
}

async fn shutdown_signal() {
    let mut term = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
        .expect("failed to install SIGTERM handler");
    tokio::select! {
        _ = tokio::signal::ctrl_c() => {},
        _ = term.recv() => {},
    }
}
