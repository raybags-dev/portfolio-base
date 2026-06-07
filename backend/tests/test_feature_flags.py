async def test_public_flags_present(client):
    resp = await client.get("/api/v1/feature-flags/public")
    assert resp.status_code == 200
    flags = resp.json()
    assert "ENABLE_CRAWLERS" in flags
    assert isinstance(flags["ENABLE_CRAWLERS"], bool)


async def test_list_flags_requires_admin(client):
    assert (await client.get("/api/v1/feature-flags")).status_code == 401


async def test_toggle_flag(client, auth_headers):
    before = (await client.get("/api/v1/feature-flags/public")).json()["ENABLE_CRAWLERS"]
    resp = await client.post(
        "/api/v1/feature-flags/ENABLE_CRAWLERS/toggle", headers=auth_headers
    )
    assert resp.status_code == 200
    assert resp.json()["enabled"] is (not before)
    # toggle back to keep tests order-independent
    await client.post("/api/v1/feature-flags/ENABLE_CRAWLERS/toggle", headers=auth_headers)


async def test_update_flag_config(client, auth_headers):
    resp = await client.put(
        "/api/v1/feature-flags/ENABLE_AI",
        headers=auth_headers,
        json={"enabled": True, "config": {"model": "gpt-4o"}},
    )
    assert resp.status_code == 200
    assert resp.json()["config"]["model"] == "gpt-4o"
