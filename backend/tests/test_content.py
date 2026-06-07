async def test_bootstrap_payload(client):
    resp = await client.get("/api/v1/public/bootstrap")
    assert resp.status_code == 200
    body = resp.json()
    for key in (
        "site_configuration",
        "theme",
        "hero",
        "about",
        "social_links",
        "projects",
        "skills",
        "feature_flags",
        "microservices",
    ):
        assert key in body, f"missing {key}"
    assert body["theme"]["default_mode"] == "dark"


async def test_update_hero_requires_admin(client):
    resp = await client.put("/api/v1/content/hero", json={"title": "Hacked"})
    assert resp.status_code == 401


async def test_update_hero_as_admin(client, auth_headers):
    resp = await client.put(
        "/api/v1/content/hero",
        headers=auth_headers,
        json={"title": "Data Engineer", "parallax_speed": 0.6},
    )
    assert resp.status_code == 200
    assert resp.json()["title"] == "Data Engineer"
    assert resp.json()["parallax_speed"] == 0.6


async def test_theme_update_reflects_in_bootstrap(client, auth_headers):
    await client.put(
        "/api/v1/content/theme",
        headers=auth_headers,
        json={"primary_color": "#ff0066"},
    )
    body = (await client.get("/api/v1/public/bootstrap")).json()
    assert body["theme"]["primary_color"] == "#ff0066"
