from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://cypher:cypher@localhost:5432/cypher"
    clickhouse_host: str = "localhost"
    clickhouse_port: int = 8123
    clickhouse_user: str = "bitcoin"
    clickhouse_password: str = "bitcoin_clickhouse"
    clickhouse_database: str = "bitcoin"
    valkey_url: str = "valkey://localhost:6379/0"
    redis_url: str = "redis://localhost:6379/0"
    jwt_secret: str = "changeme-dev-secret"
    jwt_expire_min: int = 60
    google_client_id: str = ""
    google_client_secret: str = ""
    github_client_id: str = ""
    github_client_secret: str = ""
    oauth_redirect_base: str = "http://localhost:8000"


settings = Settings()
