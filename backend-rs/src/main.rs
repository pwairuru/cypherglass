use backend_rs::{build_router, AppState, ChClient, Settings};
use sqlx::postgres::PgPoolOptions;

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt::init();

    let settings = Settings::from_env();

    let pg = PgPoolOptions::new()
        .connect_lazy(&settings.database_url)
        .expect("failed to create postgres pool");

    let state = AppState {
        pg,
        valkey_url: settings.valkey_url,
        ch: ChClient::from_env(),
        jwt_secret: settings.jwt_secret,
    };

    let app = build_router(state);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:8000")
        .await
        .expect("failed to bind");

    axum::serve(listener, app)
        .await
        .expect("server failed");
}
