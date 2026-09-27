from pydantic import BaseModel, Field


class LoginIn(BaseModel):
    username: str
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class RegisterIn(BaseModel):
    username: str = Field(min_length=3, max_length=32, pattern=r"^[a-zA-Z0-9_\-]+$")
    # NOTE: EmailStr avoided — email-validator package not installed and no
    # pip access in this env; plain str with minimal format check instead.
    email: str | None = Field(default=None, max_length=320)
    password: str = Field(min_length=8, max_length=128)


class MeOut(BaseModel):
    id: str
    username: str
    email: str | None = None
    display_name: str | None = None
    npub: str | None = None
    avatar_url: str | None = None
    is_admin: bool = False
    providers: list[str] = []
