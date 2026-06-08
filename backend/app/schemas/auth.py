"""Auth request/response schemas."""

from __future__ import annotations

from pydantic import BaseModel, EmailStr, Field, model_validator


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)
    confirm_password: str

    @model_validator(mode="after")
    def _match(self) -> PasswordChange:
        if self.new_password != self.confirm_password:
            raise ValueError("New password and confirmation do not match")
        return self


class ProfileUpdate(BaseModel):
    full_name: str | None = None
    email: EmailStr | None = None


class EmergencyReset(BaseModel):
    """Out-of-band credential reset using CUSTOM_AUTH_TOKEN."""

    token: str
    email: EmailStr
    new_password: str = Field(min_length=8)
    confirm_password: str

    @model_validator(mode="after")
    def _match(self) -> EmergencyReset:
        if self.new_password != self.confirm_password:
            raise ValueError("New password and confirmation do not match")
        return self
