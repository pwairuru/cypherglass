import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, JSON, UniqueConstraint
from sqlmodel import Field, SQLModel


def _now() -> datetime:
    return datetime.now(timezone.utc)


class User(SQLModel, table=True):
    __tablename__ = "users"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    username: str = Field(unique=True, index=True)
    email: str | None = Field(default=None, unique=True, index=True)
    display_name: str | None = None
    npub: str | None = Field(default=None, unique=True, index=True)
    avatar_url: str | None = None
    password_hash: str = ""
    is_active: bool = True
    is_admin: bool = False
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)


class SocialAuth(SQLModel, table=True):
    __tablename__ = "social_auth"
    __table_args__ = (UniqueConstraint("provider", "uid", name="uq_provider_uid"),)
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="users.id", index=True)
    provider: str = Field(index=True)
    uid: str = Field(index=True)
    extra_data: dict = Field(default_factory=dict, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=_now)
