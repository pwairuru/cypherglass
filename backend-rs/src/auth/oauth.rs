use crate::AppState;
use regex::Regex;
use std::sync::LazyLock;

static PROVIDERS: &[&str] = &["google", "github"];

static SANITIZE_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"[^a-z0-9_.-]").expect("sanitize regex"));

pub struct Identity {
    pub provider: String,
    pub uid: String,
    pub email: Option<String>,
    pub name: Option<String>,
    pub avatar_url: Option<String>,
}

pub struct OAuthUrlOut {
    pub auth_url: String,
    pub state: String,
}

#[derive(Debug)]
pub enum OAuthError {
    UnknownProvider,
    ProviderNotConfigured,
    ProviderError(String),
}

fn auth_url(provider: &str) -> &str {
    match provider {
        "google" => "https://accounts.google.com/o/oauth2/auth",
        "github" => "https://github.com/login/oauth/authorize",
        _ => "",
    }
}

fn token_url(provider: &str) -> &str {
    match provider {
        "google" => "https://oauth2.googleapis.com/token",
        "github" => "https://github.com/login/oauth/access_token",
        _ => "",
    }
}

fn userinfo_url(provider: &str) -> &str {
    match provider {
        "google" => "https://www.googleapis.com/oauth2/v3/userinfo",
        "github" => "https://api.github.com/user",
        _ => "",
    }
}

fn scope(provider: &str) -> &str {
    match provider {
        "google" => "openid email profile",
        "github" => "read:user user:email",
        _ => "",
    }
}

fn client_credentials(provider: &str, state: &AppState) -> Result<(String, String), OAuthError> {
    match provider {
        "google" => Ok((state.google_client_id.clone(), state.google_client_secret.clone())),
        "github" => Ok((state.github_client_id.clone(), state.github_client_secret.clone())),
        _ => Err(OAuthError::UnknownProvider),
    }
}

fn redirect_uri(provider: &str, state: &AppState) -> String {
    let base = state.oauth_redirect_base.trim_end_matches('/');
    format!("{}/api/v1/auth/oauth/{}/callback", base, provider)
}

fn random_state() -> String {
    let mut bytes = [0u8; 32];
    rand::RngCore::fill_bytes(&mut rand::thread_rng(), &mut bytes);
    hex::encode(bytes)
}

pub fn get_oauth_url(provider: &str, state: &AppState) -> Result<OAuthUrlOut, OAuthError> {
    if !PROVIDERS.contains(&provider) {
        return Err(OAuthError::UnknownProvider);
    }
    let (client_id, client_secret) = client_credentials(provider, state)?;
    if client_id.is_empty() || client_secret.is_empty() {
        return Err(OAuthError::ProviderNotConfigured);
    }
    let oauth_state = random_state();
    let redirect = redirect_uri(provider, state);
    let mut params = vec![
        ("client_id", client_id.as_str()),
        ("redirect_uri", redirect.as_str()),
        ("response_type", "code"),
        ("scope", scope(provider)),
        ("state", oauth_state.as_str()),
    ];
    if provider == "google" {
        params.push(("access_type", "online"));
    }
    let qs = url::form_urlencoded::Serializer::new(String::new())
        .extend_pairs(params)
        .finish();
    let auth_url = format!("{}?{}", auth_url(provider), qs);
    Ok(OAuthUrlOut { auth_url, state: oauth_state })
}

pub async fn complete_oauth(provider: &str, code: &str, state: &AppState) -> Result<Identity, OAuthError> {
    if !PROVIDERS.contains(&provider) {
        return Err(OAuthError::UnknownProvider);
    }
    if code.is_empty() {
        return Err(OAuthError::ProviderError("missing code".into()));
    }
    let (client_id, client_secret) = client_credentials(provider, state)?;
    let access_token = exchange_code(provider, code, &client_id, &client_secret, state).await?;
    let info = fetch_userinfo(provider, &access_token).await?;
    if provider == "google" {
        let uid = info.get("sub").and_then(|v| v.as_str()).unwrap_or("").to_string();
        Ok(Identity {
            provider: provider.to_string(),
            uid,
            email: info.get("email").and_then(|v| v.as_str()).map(|s| s.to_string()),
            name: info.get("name").and_then(|v| v.as_str()).map(|s| s.to_string()),
            avatar_url: info.get("picture").and_then(|v| v.as_str()).map(|s| s.to_string()),
        })
    } else {
        let uid = info.get("id").and_then(|v| {
            if let Some(n) = v.as_i64() {
                Some(n.to_string())
            } else {
                v.as_str().map(|s| s.to_string())
            }
        }).unwrap_or_default();
        let email = info.get("email").and_then(|v| v.as_str()).map(|s| s.to_string());
        let name = info
            .get("name")
            .and_then(|v| v.as_str())
            .or_else(|| info.get("login").and_then(|v| v.as_str()))
            .map(|s| s.to_string());
        let avatar_url = info.get("avatar_url").and_then(|v| v.as_str()).map(|s| s.to_string());
        Ok(Identity {
            provider: provider.to_string(),
            uid,
            email,
            name,
            avatar_url,
        })
    }
}

async fn exchange_code(
    provider: &str,
    code: &str,
    client_id: &str,
    client_secret: &str,
    state: &AppState,
) -> Result<String, OAuthError> {
    let redirect = redirect_uri(provider, state);
    let mut params = vec![
        ("client_id", client_id),
        ("client_secret", client_secret),
        ("code", code),
        ("redirect_uri", redirect.as_str()),
    ];
    if provider == "google" {
        params.push(("grant_type", "authorization_code"));
    }
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| OAuthError::ProviderError(e.to_string()))?;
    let url = token_url(provider);
    let res = client
        .post(url)
        .header("Accept", "application/json")
        .form(&params)
        .send()
        .await
        .map_err(|e| OAuthError::ProviderError(e.to_string()))?;
    if !res.status().is_success() {
        return Err(OAuthError::ProviderError(format!("token exchange status: {}", res.status())));
    }
    let data: serde_json::Value = res
        .json()
        .await
        .map_err(|e| OAuthError::ProviderError(e.to_string()))?;
    data.get("access_token")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| OAuthError::ProviderError("no access_token".into()))
}

async fn fetch_userinfo(provider: &str, access_token: &str) -> Result<serde_json::Value, OAuthError> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| OAuthError::ProviderError(e.to_string()))?;
    let url = userinfo_url(provider);
    let res = client
        .get(url)
        .header("Authorization", format!("Bearer {}", access_token))
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| OAuthError::ProviderError(e.to_string()))?;
    if !res.status().is_success() {
        return Err(OAuthError::ProviderError(format!("userinfo status: {}", res.status())));
    }
    res.json().await.map_err(|e| OAuthError::ProviderError(e.to_string()))
}

pub fn sanitize_username(candidate: &str, fallback: &str) -> String {
    let lowered = candidate.trim().to_lowercase();
    let name = SANITIZE_RE.replace_all(&lowered, "").into_owned();
    let name = name.trim_matches(|c: char| c == '.' || c == '_' || c == '-').to_string();
    let name = if name.len() > 32 { name[..32].to_string() } else { name };
    if name.is_empty() {
        fallback.to_string()
    } else {
        name
    }
}
