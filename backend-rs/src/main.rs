use backend_rs::{build_router_with, db::pg_pool, store, AppState, ChClient, Settings};
use std::net::SocketAddr;

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt::init();

    let settings = Settings::from_env();

    store::init(settings.valkey_url.clone());

    let pg = pg_pool(&settings.database_url);

    let state = AppState {
        pg,
        valkey_url: settings.valkey_url.clone(),
        ch: ChClient::from_env(),
        jwt_secret: settings.jwt_secret.clone(),
        jwt_expire_min: settings.jwt_expire_min,
        google_client_id: settings.google_client_id.clone(),
        google_client_secret: settings.google_client_secret.clone(),
        github_client_id: settings.github_client_id.clone(),
        github_client_secret: settings.github_client_secret.clone(),
        oauth_redirect_base: settings.oauth_redirect_base.clone(),
    };

    let app = build_router_with(state, &settings);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:8000")
        .await
        .expect("failed to bind");

    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(shutdown_signal())
    .await
    .expect("server failed");
}

async fn shutdown_signal() {
    let mut term = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
        .expect("failed to install SIGTERM handler");
    tokio::select! {
        _ = tokio::signal::ctrl_c() => {},
        _ = term.recv() => {},
    }
}
