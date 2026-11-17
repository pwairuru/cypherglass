use jsonwebtoken::{DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// JWT claims issued by this service.
#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,
    pub exp: usize,
    pub iat: usize,
    pub iss: String,
    pub jti: String,
    pub uid: Option<String>,
    pub ver: Option<String>,
}

const ISSUER: &str = "cypherglass";
const ALGORITHM: jsonwebtoken::Algorithm = jsonwebtoken::Algorithm::HS256;

/// Create a new HS256 JWT valid for `expire_min` minutes.
pub fn create_token(
    secret: &str,
    sub: &str,
    uid: Option<&str>,
    ver: Option<&str>,
    expire_min: u64,
) -> String {
    let now = jsonwebtoken::get_current_timestamp() as usize;
    let exp = now + (expire_min as usize) * 60;
    let claims = Claims {
        sub: sub.to_string(),
        exp,
        iat: now,
        iss: ISSUER.to_string(),
        jti: Uuid::new_v4().to_string(),
        uid: uid.map(|s| s.to_string()),
        ver: ver.map(|s| s.to_string()),
    };
    jsonwebtoken::encode(
        &Header::new(ALGORITHM),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .expect("JWT encoding should not fail")
}

/// Decode and strictly validate a bearer token.
pub fn decode_token(secret: &str, token: &str) -> Result<Claims, jsonwebtoken::errors::Error> {
    let mut validation = Validation::new(ALGORITHM);
    validation.set_issuer(&[ISSUER]);
    validation.required_spec_claims = ["exp", "iss", "sub"]
        .iter()
        .map(|s| s.to_string())
        .collect();
    validation.leeway = 0;

    jsonwebtoken::decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &validation,
    )
    .map(|data| data.claims)
}
