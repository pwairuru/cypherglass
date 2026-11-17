use crate::config::Settings;
use serde::Serialize;
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

    fn parse_error() -> Self {
        Self {
            class: "parse_error".into(),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct SeriesPoint {
    pub t: String,
    pub v: Option<f64>,
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

    /// Execute an arbitrary ClickHouse query with typed parameters.
    ///
    /// Parameters are passed as `param_<name>` URL query arguments; the SQL
    /// itself is sent in the POST body with `FORMAT JSONCompact` appended so
    /// rows come back as plain JSON arrays.
    pub async fn query(
        &self,
        sql: &str,
        params: &[(&str, &str)],
    ) -> Result<Vec<Vec<serde_json::Value>>, ChError> {
        let url = self.build_query_url(params);
        let body = format!("{} FORMAT JSONCompact", sql);

        let response = self
            .client
            .post(&url)
            .basic_auth(&self.user, Some(&self.password))
            .header(reqwest::header::CONTENT_TYPE, "text/plain")
            .body(body)
            .send()
            .await
            .map_err(|e| {
                let classified = ChError::from_reqwest(&e);
                tracing::warn!(error = %e, class = %classified.class, "clickhouse query request failed");
                classified
            })?;

        if !response.status().is_success() {
            let status = response.status();
            tracing::warn!(%status, "clickhouse query returned non-success status");
            return Err(ChError::http_error());
        }

        let json: serde_json::Value = response.json().await.map_err(|e| {
            tracing::warn!(error = %e, "clickhouse query response is not valid json");
            ChError::parse_error()
        })?;

        let data = json
            .get("data")
            .and_then(|v| v.as_array())
            .ok_or_else(ChError::parse_error)?;

        let mut rows = Vec::with_capacity(data.len());
        for row in data {
            let cells = row
                .as_array()
                .ok_or_else(ChError::parse_error)?
                .clone();
            rows.push(cells);
        }

        Ok(rows)
    }

    /// Execute a two-column series query and map it to [`SeriesPoint`]s.
    pub async fn query_series(
        &self,
        sql: &str,
        params: &[(&str, &str)],
    ) -> Result<Vec<SeriesPoint>, ChError> {
        let rows = self.query(sql, params).await?;
        let mut points = Vec::with_capacity(rows.len());
        for row in rows {
            if row.len() < 2 {
                continue;
            }
            let t = row[0]
                .as_str()
                .map(String::from)
                .unwrap_or_else(|| row[0].to_string());
            let v = value_to_f64_opt(&row[1]);
            points.push(SeriesPoint { t, v });
        }
        Ok(points)
    }

    fn build_query_url(&self, params: &[(&str, &str)]) -> String {
        let mut url = format!("{}?database={}", self.base_url, self.database);
        for (name, value) in params {
            url.push_str(&format!(
                "&param_{}={}",
                urlencoding::encode(name),
                urlencoding::encode(value)
            ));
        }
        url
    }
}

pub fn value_to_f64_opt(v: &serde_json::Value) -> Option<f64> {
    if v.is_null() {
        return None;
    }
    if let Some(n) = v.as_f64() {
        return Some(n);
    }
    if let Some(n) = v.as_i64() {
        return Some(n as f64);
    }
    if let Some(n) = v.as_u64() {
        return Some(n as f64);
    }
    if let Some(s) = v.as_str() {
        return s.parse::<f64>().ok();
    }
    None
}
