use backend_rs::{build_router_with, db::pg_pool, AppState, ChClient, Settings};

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt::init();

    let settings = Settings::from_env();

    let pg = pg_pool(&settings.database_url);

    let state = AppState {
        pg,
        valkey_url: settings.valkey_url.clone(),
        ch: ChClient::from_env(),
        jwt_secret: settings.jwt_secret.clone(),
    };

    let app = build_router_with(state, &settings);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:8000")
        .await
        .expect("failed to bind");

    axum::serve(listener, app)
        .await
        .expect("server failed");
}
