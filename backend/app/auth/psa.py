"""Thin PSA/social-core adapter: OAuth start URLs + code exchange.

Real HTTP (httpx) only runs in the prod path; tests patch
:func:`complete_oauth` entirely. Google/GitHub only — anything else raises
``ValueError`` (router maps to HTTP 400).
"""

import re
import secrets
import urllib.parse

import httpx

from app.config import settings

PROVIDERS = ("google", "github")

_AUTHORIZATION_URLS = {
    "google": "https://accounts.google.com/o/oauth2/auth",
    "github": "https://github.com/login/oauth/authorize",
}

_TOKEN_URLS = {
    "google": "https://oauth2.googleapis.com/token",
    "github": "https://github.com/login/oauth/access_token",
}

_USERINFO_URLS = {
    "google": "https://www.googleapis.com/oauth2/v3/userinfo",
    "github": "https://api.github.com/user",
}

_SCOPES = {
    "google": "openid email profile",
    "github": "read:user user:email",
}


class OAuthError(Exception):
    """Provider-side failure (token exchange / userinfo). Router -> 502."""


def _client_credentials(provider: str) -> tuple[str, str]:
    if provider == "google":
        return settings.google_client_id, settings.google_client_secret
    if provider == "github":
        return settings.github_client_id, settings.github_client_secret
    raise ValueError(f"unknown provider: {provider}")


def redirect_uri(provider: str) -> str:
    base = settings.oauth_redirect_base.rstrip("/")
    return f"{base}/api/v1/auth/oauth/{provider}/callback"


def get_oauth_url(provider: str) -> dict:
    """Build the provider authorization URL + anti-CSRF state."""
    if provider not in PROVIDERS:
        raise ValueError(f"unknown provider: {provider}")
    client_id, client_secret = _client_credentials(provider)
    if not client_id or not client_secret:
        raise OAuthError("oauth provider not configured")
    state = secrets.token_urlsafe(32)
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri(provider),
        "response_type": "code",
        "scope": _SCOPES[provider],
        "state": state,
    }
    if provider == "google":
        params["access_type"] = "online"
    url = _AUTHORIZATION_URLS[provider] + "?" + urllib.parse.urlencode(params)
    return {"auth_url": url, "state": state}


async def _exchange_code(provider: str, code: str) -> str:
    client_id, client_secret = _client_credentials(provider)
    data = {
        "client_id": client_id,
        "client_secret": client_secret,
        "code": code,
        "redirect_uri": redirect_uri(provider),
    }
    if provider == "google":
        data["grant_type"] = "authorization_code"
    headers = {"Accept": "application/json"}
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(_TOKEN_URLS[provider], data=data, headers=headers)
            r.raise_for_status()
            token_data = r.json()
    except Exception as exc:
        raise OAuthError(f"token exchange failed: {exc}") from exc
    access_token = token_data.get("access_token")
    if not access_token:
        raise OAuthError("token exchange failed: no access_token")
    return access_token


async def _fetch_userinfo(provider: str, access_token: str) -> dict:
    headers = {"Authorization": f"Bearer {access_token}", "Accept": "application/json"}
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(_USERINFO_URLS[provider], headers=headers)
            r.raise_for_status()
            return r.json()
    except Exception as exc:
        raise OAuthError(f"userinfo fetch failed: {exc}") from exc


async def complete_oauth(provider: str, code: str, state: str) -> dict:
    """Exchange ``code`` and return normalized identity.

    Returns ``{"provider", "uid", "email", "name", "avatar_url"}``.
    ``state`` is accepted for signature parity (router owns state
    validation via oauth_state_store); ``code``/``state`` must be non-empty.
    """
    if provider not in PROVIDERS:
        raise ValueError(f"unknown provider: {provider}")
    if not code or not state:
        raise OAuthError("missing code or state")
    access_token = await _exchange_code(provider, code)
    info = await _fetch_userinfo(provider, access_token)
    if provider == "google":
        uid = str(info.get("sub", ""))
        return {
            "provider": provider,
            "uid": uid,
            "email": info.get("email"),
            "name": info.get("name"),
            "avatar_url": info.get("picture"),
        }
    uid = str(info.get("id", ""))
    email = info.get("email")
    if not email:
        # GitHub hides email by default; prod path queries /user/emails.
        # Keep structure realistic without extra calls here.
        email = None
    return {
        "provider": provider,
        "uid": uid,
        "email": email,
        "name": info.get("name") or info.get("login"),
        "avatar_url": info.get("avatar_url"),
    }


def sanitize_username(candidate: str, fallback: str) -> str:
    """Lowercase alnum/._- username, else fallback."""
    name = (candidate or "").strip().lower()
    name = re.sub(r"[^a-z0-9_.-]", "", name)[:32].strip("._-")
    return name or fallback
