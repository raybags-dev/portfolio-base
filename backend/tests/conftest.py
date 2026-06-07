"""Pytest fixtures: isolated SQLite DB, seeded app, and HTTP client."""

from __future__ import annotations

import os
import tempfile

# Configure env BEFORE importing app modules (settings is cached at import).
_db_fd, _db_path = tempfile.mkstemp(suffix=".db")
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{_db_path}"
os.environ["ENVIRONMENT"] = "test"
os.environ["SECRET_KEY"] = "test-secret-key-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
os.environ["FIRST_ADMIN_EMAIL"] = "admin@example.com"
os.environ["FIRST_ADMIN_PASSWORD"] = "TestPass!123"

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.core.database import engine, init_models
from app.main import app
from app.seed import seed


@pytest_asyncio.fixture(scope="session", autouse=True)
async def _setup_db():
    await init_models()
    await seed()
    yield
    await engine.dispose()
    try:
        os.close(_db_fd)
        os.unlink(_db_path)
    except OSError:
        pass


@pytest_asyncio.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture
async def admin_token(client: AsyncClient) -> str:
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "admin@example.com", "password": "TestPass!123"},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


@pytest.fixture
def auth_headers(admin_token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {admin_token}"}
