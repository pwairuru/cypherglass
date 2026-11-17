import re

from pydantic import BaseModel, Field, field_validator

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _check_email(v: str | None) -> str | None:
    if v is not None and not EMAIL_RE.match(v):
        raise ValueError("invalid email format")
    return v


class LoginIn(BaseModel):
    username: str = Field(min_length=1, max_length=320)
    password: str = Field(min_length=1, max_length=128)


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class RegisterIn(BaseModel):
    username: str = Field(min_length=3, max_length=32, pattern=r"^[a-zA-Z0-9_\-]+$")
    # NOTE: EmailStr avoided — email-validator package not installed and no
    # pip access in this env; explicit regex check below instead.
    email: str | None = Field(default=None, max_length=320)
    password: str = Field(min_length=8, max_length=128)

    @field_validator("email")
    @classmethod
    def _validate_email(cls, v: str | None) -> str | None:
        return _check_email(v)


class MeOut(BaseModel):
    id: str
    username: str
    email: str | None = None
    display_name: str | None = None
    npub: str | None = None
    avatar_url: str | None = None
    is_admin: bool = False
    providers: list[str] = []


class MeUpdate(BaseModel):
    display_name: str | None = Field(default=None, max_length=64)
    avatar_url: str | None = Field(default=None, max_length=2048)
    email: str | None = Field(default=None, max_length=320)

    @field_validator("email")
    @classmethod
    def _validate_email(cls, v: str | None) -> str | None:
        return _check_email(v)

    @field_validator("avatar_url")
    @classmethod
    def _validate_avatar(cls, v: str | None) -> str | None:
        if v is None:
            return v
        vv = v.strip()
        if vv == "":
            return None
        if not (vv.startswith("https://") or vv.startswith("http://") or vv.startswith("/")):
            raise ValueError("avatar_url must be https://, http://, or site-relative /path")
        if vv.lower().startswith("javascript:") or vv.lower().startswith("data:"):
            raise ValueError("avatar_url scheme not allowed")
        return vv

    @field_validator("display_name")
    @classmethod
    def _strip_display(cls, v: str | None) -> str | None:
        if v is None:
            return v
        vv = v.strip()
        return vv or None


class ChangePasswordIn(BaseModel):
    old_password: str
    new_password: str = Field(min_length=8, max_length=128)


class UserOut(BaseModel):
    id: str
    username: str
    email: str | None = None
    display_name: str | None = None
    npub: str | None = None
    is_active: bool = True
    is_admin: bool = False


class AdminUserUpdate(BaseModel):
    is_active: bool | None = None
    is_admin: bool | None = None
    display_name: str | None = Field(default=None, max_length=64)
