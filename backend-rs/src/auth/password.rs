use sha2::{Digest, Sha256};

/// Hash a plaintext password with bcrypt.
pub fn hash_password(password: &str) -> String {
    bcrypt::hash(password, bcrypt::DEFAULT_COST).expect("bcrypt hashing should not fail")
}

/// Verify a plaintext password against a bcrypt hash.
pub fn verify_password(password: &str, hash: &str) -> bool {
    bcrypt::verify(password, hash).unwrap_or(false)
}

/// Token version bound to the password hash: changing the password revokes
/// previously issued JWTs that carry a `ver` claim.
pub fn password_ver(password_hash: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(password_hash.as_bytes());
    hex::encode(hasher.finalize())[..16].to_string()
}
