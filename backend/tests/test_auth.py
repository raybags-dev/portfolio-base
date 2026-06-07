async def test_login_success(client):
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "admin@example.com", "password": "TestPass!123"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["access_token"] and body["refresh_token"]


async def test_login_wrong_password(client):
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "admin@example.com", "password": "nope"},
    )
    assert resp.status_code == 401


async def test_me_requires_auth(client):
    assert (await client.get("/api/v1/auth/me")).status_code == 401


async def test_me_returns_permissions(client, auth_headers):
    resp = await client.get("/api/v1/auth/me", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["email"] == "admin@example.com"
    assert body["is_superuser"] is True


async def test_refresh(client):
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": "admin@example.com", "password": "TestPass!123"},
    )
    refresh = login.json()["refresh_token"]
    resp = await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh})
    assert resp.status_code == 200
    assert resp.json()["access_token"]
