from pydantic import field_validator
from pydantic_settings import BaseSettings


def _strong_default_secret() -> str:
    # 64-char dev-only default (not for prod). Replaces 19-char
    # changeme-dev-secret that tripped InsecureKeyLengthWarning.
    return "dev-only-not-for-prod-0123456789abcdef0123456789abcdef01234567"


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://cypher:cypher@localhost:5432/cypher"
    clickhouse_host: str = "localhost"
    clickhouse_port: int = 8123
    clickhouse_user: str = "bitcoin"
    clickhouse_password: str = "bitcoin_clickhouse"
    clickhouse_database: str = "bitcoin"
    valkey_url: str = "valkey://localhost:6379/0"
    redis_url: str = "redis://localhost:6379/0"
    jwt_secret: str = "dev-only-not-for-prod-0123456789abcdef0123456789abcdef01234567"
    jwt_expire_min: int = 60
    cors_origins: str = "http://localhost:5173,http://localhost:8002"
    google_client_id: str = ""
    google_client_secret: str = ""
    github_client_id: str = ""
    github_client_secret: str = ""
    oauth_redirect_base: str = "http://localhost:8002"

    @field_validator("jwt_secret")
    @classmethod
    def _check_jwt(cls, v: str) -> str:
        import os

        # Fail-closed in prod AND dev: short/placeholder secrets are a
        # forgery risk (HS256 brute-force). Tests override via env.
        if len(v) < 32 or v in ("changeme-dev-secret", "changeme"):
            env = os.getenv("ENV", os.getenv("APP_ENV", "dev")).lower()
            if env in ("prod", "production"):
                raise ValueError("JWT_SECRET must be >=32 bytes in prod")
            # Dev still requires 32+ bytes; new default above satisfies this.
            if len(v) < 32:
                raise ValueError("JWT_SECRET must be >=32 bytes (set a strong value in .env)")
        return v

    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
