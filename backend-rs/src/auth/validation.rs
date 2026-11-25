use regex::Regex;
use serde::Deserialize;
use std::sync::LazyLock;

static USERNAME_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^[a-zA-Z0-9_-]+$").expect("username regex"));
static EMAIL_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^[^@\s]+@[^@\s]+\.[^@\s]+$").expect("email regex"));

#[derive(Debug, Deserialize)]
pub struct LoginIn {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Deserialize)]
pub struct RegisterIn {
    pub username: String,
    pub email: Option<String>,
    pub password: String,
}

#[derive(Debug, Deserialize)]
pub struct MeUpdate {
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
    pub email: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ChangePasswordIn {
    pub old_password: String,
    pub new_password: String,
}

#[derive(Debug, Deserialize)]
pub struct AdminUserUpdate {
    pub is_active: Option<bool>,
    pub is_admin: Option<bool>,
    pub display_name: Option<String>,
}

pub fn validate_username(username: &str) -> Result<(), &'static str> {
    if username.len() < 3 || username.len() > 32 {
        return Err("username must be 3-32 characters");
    }
    if !USERNAME_RE.is_match(username) {
        return Err("username may only contain letters, numbers, underscores and hyphens");
    }
    Ok(())
}

pub fn validate_password(password: &str) -> Result<(), &'static str> {
    if password.len() < 8 || password.len() > 128 {
        return Err("password must be 8-128 characters");
    }
    Ok(())
}

pub fn validate_email(email: &str) -> Result<(), &'static str> {
    if email.len() > 320 {
        return Err("email must be at most 320 characters");
    }
    if !EMAIL_RE.is_match(email) {
        return Err("invalid email format");
    }
    Ok(())
}

pub fn validate_display_name(name: &str) -> Result<String, &'static str> {
    if name.len() > 64 {
        return Err("display_name must be at most 64 characters");
    }
    let trimmed = name.trim();
    if trimmed.is_empty() {
        Ok(String::new())
    } else {
        Ok(trimmed.to_string())
    }
}

pub fn validate_avatar_url(url: &str) -> Result<String, &'static str> {
    if url.len() > 2048 {
        return Err("avatar_url must be at most 2048 characters");
    }
    let trimmed = url.trim();
    if trimmed.is_empty() {
        return Ok(String::new());
    }
    let lower = trimmed.to_lowercase();
    if lower.starts_with("javascript:") || lower.starts_with("data:") {
        return Err("avatar_url scheme not allowed");
    }
    if !(trimmed.starts_with("https://")
        || trimmed.starts_with("http://")
        || trimmed.starts_with('/'))
    {
        return Err("avatar_url must be https://, http://, or site-relative /path");
    }
    Ok(trimmed.to_string())
}

impl RegisterIn {
    pub fn validate(&self) -> Result<(), &'static str> {
        validate_username(&self.username)?;
        validate_password(&self.password)?;
        if let Some(email) = &self.email {
            validate_email(email)?;
        }
        Ok(())
    }
}

impl LoginIn {
    pub fn validate(&self) -> Result<(), &'static str> {
        if self.username.is_empty() || self.username.len() > 320 {
            return Err("username must be 1-320 characters");
        }
        if self.password.is_empty() || self.password.len() > 128 {
            return Err("password must be 1-128 characters");
        }
        Ok(())
    }
}

impl MeUpdate {
    pub fn validate(&self) -> Result<(), &'static str> {
        if let Some(email) = &self.email {
            validate_email(email)?;
        }
        if let Some(avatar_url) = &self.avatar_url {
            validate_avatar_url(avatar_url)?;
        }
        if let Some(display_name) = &self.display_name {
            validate_display_name(display_name)?;
        }
        Ok(())
    }
}

impl ChangePasswordIn {
    pub fn validate(&self) -> Result<(), &'static str> {
        validate_password(&self.new_password)
    }
}

impl AdminUserUpdate {
    pub fn validate(&self) -> Result<(), &'static str> {
        if let Some(display_name) = &self.display_name {
            validate_display_name(display_name)?;
        }
        Ok(())
    }
}
