use secrecy::SecretString;
use std::env;

fn _default_database_url() -> String {
    "postgresql://cypher:cypher@localhost:5432/cypher".into()
}

fn _default_jwt_secret() -> SecretString {
    SecretString::new(
        "dev-only-not-for-prod-0123456789abcdef0123456789abcdef01234567".into(),
    )
}

#[derive(Debug, Clone)]
pub struct Settings {
    pub database_url: String,
    pub clickhouse_host: String,
    pub clickhouse_port: u16,
    pub clickhouse_user: String,
    pub clickhouse_password: String,
    pub clickhouse_database: String,
    pub valkey_url: String,
    pub jwt_secret: SecretString,
    pub jwt_expire_min: u64,
    pub cors_origins: String,
    pub env: String,
    pub google_client_id: String,
    pub google_client_secret: String,
    pub github_client_id: String,
    pub github_client_secret: String,
    pub oauth_redirect_base: String,
}

impl Settings {
    pub fn from_env() -> Self {
        dotenvy::dotenv().ok();

        let env_raw = env::var("ENV")
            .or_else(|_| env::var("APP_ENV"))
            .unwrap_or_else(|_| "dev".into());
        let env_lower = env_raw.to_lowercase();
        let is_prod = env_lower == "prod" || env_lower == "production";

        let jwt_secret_raw = env::var("JWT_SECRET").unwrap_or_else(|_| {
            "dev-only-not-for-prod-0123456789abcdef0123456789abcdef01234567".into()
        });

        if jwt_secret_raw.len() < 32 {
            panic!("JWT_SECRET must be >=32 bytes (set a strong value in .env)");
        }
        if (jwt_secret_raw == "changeme-dev-secret" || jwt_secret_raw == "changeme") && is_prod {
            panic!("JWT_SECRET must be >=32 bytes in prod");
        }

        Self {
            database_url: env::var("DATABASE_URL").unwrap_or_else(|_| _default_database_url()),
            clickhouse_host: env::var("CLICKHOUSE_HOST").unwrap_or_else(|_| "localhost".into()),
            clickhouse_port: env::var("CLICKHOUSE_PORT")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(8123),
            clickhouse_user: env::var("CLICKHOUSE_USER").unwrap_or_else(|_| "bitcoin".into()),
            clickhouse_password: env::var("CLICKHOUSE_PASSWORD")
                .unwrap_or_else(|_| "bitcoin_clickhouse".into()),
            clickhouse_database: env::var("CLICKHOUSE_DATABASE").unwrap_or_else(|_| "bitcoin".into()),
            valkey_url: env::var("VALKEY_URL").unwrap_or_else(|_| "valkey://localhost:6379/0".into()),
            jwt_secret: SecretString::new(jwt_secret_raw.into()),
            jwt_expire_min: env::var("JWT_EXPIRE_MIN")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(60),
            cors_origins: env::var("CORS_ORIGINS")
                .unwrap_or_else(|_| "http://localhost:5173,http://localhost:8002".into()),
            env: env_lower,
            google_client_id: env::var("GOOGLE_CLIENT_ID").unwrap_or_default(),
            google_client_secret: env::var("GOOGLE_CLIENT_SECRET").unwrap_or_default(),
            github_client_id: env::var("GITHUB_CLIENT_ID").unwrap_or_default(),
            github_client_secret: env::var("GITHUB_CLIENT_SECRET").unwrap_or_default(),
            oauth_redirect_base: env::var("OAUTH_REDIRECT_BASE")
                .unwrap_or_else(|_| "http://localhost:8002".into()),
        }
    }

    pub fn cors_origin_list(&self) -> Vec<String> {
        self.cors_origins
            .split(',')
            .map(|o| o.trim().to_string())
            .filter(|o| !o.is_empty())
            .collect()
    }
}
