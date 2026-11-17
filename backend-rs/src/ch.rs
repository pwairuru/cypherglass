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
    message: String,
}

impl fmt::Display for ChError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl std::error::Error for ChError {}

impl ChError {
    pub fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

impl From<reqwest::Error> for ChError {
    fn from(err: reqwest::Error) -> Self {
        Self::new(format!("{}: {}", std::any::type_name::<reqwest::Error>(), err))
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
        let password = env::var("CLICKHOUSE_PASSWORD").unwrap_or_else(|_| "bitcoin_clickhouse".into());
        let database = env::var("CLICKHOUSE_DATABASE").unwrap_or_else(|_| "bitcoin".into());

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
        let response = self
            .client
            .get(&url)
            .basic_auth(&self.user, Some(&self.password))
            .send()
            .await?;

        if response.status().is_success() {
            Ok(())
        } else {
            Err(ChError::new(format!("HTTP {}", response.status())))
        }
    }
}
