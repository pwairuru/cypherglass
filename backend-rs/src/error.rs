/// Generic API error carried through service layers.
///
/// Routers convert this into an HTTP response; for unit tests the status and
/// message can be inspected directly.
#[derive(Debug, Clone)]
pub struct ApiError {
    pub status: u16,
    pub message: String,
}

impl ApiError {
    pub fn bad_request(message: impl Into<String>) -> Self {
        Self {
            status: 400,
            message: message.into(),
        }
    }

    pub fn unauthorized(message: impl Into<String>) -> Self {
        Self {
            status: 401,
            message: message.into(),
        }
    }

    pub fn forbidden(message: impl Into<String>) -> Self {
        Self {
            status: 403,
            message: message.into(),
        }
    }

    pub fn not_found(message: impl Into<String>) -> Self {
        Self {
            status: 404,
            message: message.into(),
        }
    }

    pub fn conflict(message: impl Into<String>) -> Self {
        Self {
            status: 409,
            message: message.into(),
        }
    }

    pub fn unprocessable(message: impl Into<String>) -> Self {
        Self {
            status: 422,
            message: message.into(),
        }
    }

    pub fn bad_gateway(message: impl Into<String>) -> Self {
        Self {
            status: 502,
            message: message.into(),
        }
    }

    pub fn service_unavailable(message: impl Into<String>) -> Self {
        Self {
            status: 503,
            message: message.into(),
        }
    }
}

impl std::fmt::Display for ApiError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "HTTP {}: {}", self.status, self.message)
    }
}

impl std::error::Error for ApiError {}
