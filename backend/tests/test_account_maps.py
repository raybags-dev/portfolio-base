"""Account management + Google Maps embed sanitisation."""

NEW = "NewPass!456"
ADMIN = "admin@example.com"
ORIG = "TestPass!123"
TOK = "test-emergency-token-123"  # matches conftest CUSTOM_AUTH_TOKEN


async def _login(client, email, password):
    return await client.post("/api/v1/auth/login",
                             json={"email": email, "password": password})


async def test_change_password_flow(client, auth_headers):
    # wrong current password rejected
    bad = await client.post("/api/v1/auth/change-password", headers=auth_headers,
                            json={"current_password": "nope", "new_password": NEW,
                                  "confirm_password": NEW})
    assert bad.status_code == 400

    # mismatch rejected (422 from schema validator)
    mm = await client.post("/api/v1/auth/change-password", headers=auth_headers,
                           json={"current_password": ORIG, "new_password": NEW,
                                 "confirm_password": "different"})
    assert mm.status_code == 422

    # missing token rejected when CUSTOM_AUTH_TOKEN is configured
    notok = await client.post("/api/v1/auth/change-password", headers=auth_headers,
                              json={"current_password": ORIG, "new_password": NEW,
                                    "confirm_password": NEW})
    assert notok.status_code == 403

    # success (with token)
    ok = await client.post("/api/v1/auth/change-password", headers=auth_headers,
                           json={"current_password": ORIG, "new_password": NEW,
                                 "confirm_password": NEW, "auth_token": TOK})
    assert ok.status_code == 200
    assert (await _login(client, ADMIN, NEW)).status_code == 200
    assert (await _login(client, ADMIN, ORIG)).status_code == 401

    # restore via authenticated change so other tests keep working
    tok = (await _login(client, ADMIN, NEW)).json()["access_token"]
    await client.post("/api/v1/auth/change-password",
                      headers={"Authorization": f"Bearer {tok}"},
                      json={"current_password": NEW, "new_password": ORIG,
                            "confirm_password": ORIG, "auth_token": TOK})
    assert (await _login(client, ADMIN, ORIG)).status_code == 200


async def test_emergency_reset(client):
    # wrong token
    bad = await client.post("/api/v1/auth/emergency-reset",
                            json={"token": "wrong", "email": ADMIN,
                                  "new_password": NEW, "confirm_password": NEW})
    assert bad.status_code == 403

    # correct token resets, then restore
    ok = await client.post("/api/v1/auth/emergency-reset",
                           json={"token": "test-emergency-token-123", "email": ADMIN,
                                 "new_password": NEW, "confirm_password": NEW})
    assert ok.status_code == 200
    assert (await _login(client, ADMIN, NEW)).status_code == 200
    tok = (await _login(client, ADMIN, NEW)).json()["access_token"]
    await client.post("/api/v1/auth/change-password",
                      headers={"Authorization": f"Bearer {tok}"},
                      json={"current_password": NEW, "new_password": ORIG,
                            "confirm_password": ORIG, "auth_token": TOK})


async def test_update_profile_name(client, auth_headers):
    resp = await client.put("/api/v1/auth/me", headers=auth_headers,
                            json={"full_name": "Baguma R."})
    assert resp.status_code == 200
    assert resp.json()["full_name"] == "Baguma R."


# ---- maps embed sanitisation via site-config ----
async def test_map_embed_accepts_iframe(client, auth_headers):
    iframe = '<iframe src="https://www.google.com/maps/embed?pb=ABC123" loading="lazy"></iframe>'
    resp = await client.put("/api/v1/content/site-configuration", headers=auth_headers,
                            json={"map_embed_url": iframe})
    assert resp.status_code == 200
    assert resp.json()["map_embed_url"] == "https://www.google.com/maps/embed?pb=ABC123"


async def test_map_embed_rejects_non_maps(client, auth_headers):
    resp = await client.put("/api/v1/content/site-configuration", headers=auth_headers,
                            json={"map_embed_url": "https://evil.example/x"})
    assert resp.status_code == 422


async def test_map_embed_empty_clears(client, auth_headers):
    resp = await client.put("/api/v1/content/site-configuration", headers=auth_headers,
                            json={"map_embed_url": ""})
    assert resp.status_code == 200
    assert resp.json()["map_embed_url"] is None
