use crate::config::Settings;
use std::env;
use std::fmt;
use std::time::Duration;

#[derive(Clone, Debug)]
pub struct ChClient {
    client: reqwest::Client,
    base_url: String,
    user: String,
    password: String,
    database: String,
}

#[derive(Debug)]
pub struct ChError {
    class: String,
}

impl fmt::Display for ChError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.class)
    }
}

impl std::error::Error for ChError {}

impl ChError {
    pub fn class(&self) -> &str {
        &self.class
    }

    fn from_reqwest(err: &reqwest::Error) -> Self {
        let class = if err.is_timeout() {
            "timeout"
        } else if err.is_connect() || err.is_request() {
            "unreachable"
        } else {
            "error"
        }
        .to_string();
        Self { class }
    }

    fn auth_error() -> Self {
        Self {
            class: "auth_error".into(),
        }
    }

    fn http_error() -> Self {
        Self {
            class: "http_error".into(),
        }
    }
}

impl ChClient {
    pub fn from_env() -> Self {
        let host = env::var("CLICKHOUSE_HOST").unwrap_or_else(|_| "localhost".into());
        let port = env::var("CLICKHOUSE_PORT")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(8123);
        let user = env::var("CLICKHOUSE_USER").unwrap_or_else(|_| "bitcoin".into());
        let password =
            env::var("CLICKHOUSE_PASSWORD").unwrap_or_else(|_| "bitcoin_clickhouse".into());
        let database = env::var("CLICKHOUSE_DATABASE").unwrap_or_else(|_| "bitcoin".into());

        Self::new(host, port, user, password, database)
    }

    pub fn from_settings(settings: &Settings) -> Self {
        Self::new(
            settings.clickhouse_host.clone(),
            settings.clickhouse_port,
            settings.clickhouse_user.clone(),
            settings.clickhouse_password.clone(),
            settings.clickhouse_database.clone(),
        )
    }

    fn new(
        host: String,
        port: u16,
        user: String,
        password: String,
        database: String,
    ) -> Self {
        let client = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(5))
            .timeout(Duration::from_secs(15))
            .build()
            .expect("clickhouse http client");

        Self {
            client,
            base_url: format!("http://{}:{}", host, port),
            user,
            password,
            database,
        }
    }

    pub async fn check(&self) -> Result<(), ChError> {
        let url = format!(
            "{}?query=SELECT%201&database={}",
            self.base_url, self.database
        );
        match self
            .client
            .get(&url)
            .basic_auth(&self.user, Some(&self.password))
            .send()
            .await
        {
            Ok(response) => {
                if response.status().is_success() {
                    Ok(())
                } else {
                    let status = response.status();
                    tracing::warn!(%status, "clickhouse check returned non-success status");
                    if status == reqwest::StatusCode::UNAUTHORIZED
                        || status == reqwest::StatusCode::FORBIDDEN
                    {
                        Err(ChError::auth_error())
                    } else {
                        Err(ChError::http_error())
                    }
                }
            }
            Err(err) => {
                let classified = ChError::from_reqwest(&err);
                tracing::warn!(error = %err, class = %classified.class, "clickhouse check failed");
                Err(classified)
            }
        }
    }
}
