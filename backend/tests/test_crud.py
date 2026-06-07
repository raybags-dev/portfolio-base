async def test_skill_crud_lifecycle(client, auth_headers):
    # create
    resp = await client.post(
        "/api/v1/skills",
        headers=auth_headers,
        json={"name": "Rust", "category": "Languages", "proficiency": 70},
    )
    assert resp.status_code == 201, resp.text
    skill_id = resp.json()["id"]

    # public read (list)
    listing = await client.get("/api/v1/skills")
    assert listing.status_code == 200
    assert any(s["id"] == skill_id for s in listing.json()["items"])

    # update
    upd = await client.put(
        f"/api/v1/skills/{skill_id}",
        headers=auth_headers,
        json={"proficiency": 75},
    )
    assert upd.status_code == 200
    assert upd.json()["proficiency"] == 75

    # write requires auth
    assert (await client.post("/api/v1/skills", json={"name": "X"})).status_code == 401

    # delete
    assert (
        await client.delete(f"/api/v1/skills/{skill_id}", headers=auth_headers)
    ).status_code == 204
    assert (await client.get(f"/api/v1/skills/{skill_id}")).status_code == 404


async def test_project_create_and_fetch(client, auth_headers):
    resp = await client.post(
        "/api/v1/projects",
        headers=auth_headers,
        json={
            "title": "Weather ETL",
            "slug": "weather-etl",
            "summary": "Collect, transform, forecast.",
            "tech_tags": ["Polars", "DuckDB"],
        },
    )
    assert resp.status_code == 201, resp.text
    pid = resp.json()["id"]
    got = await client.get(f"/api/v1/projects/{pid}")
    assert got.status_code == 200
    assert got.json()["slug"] == "weather-etl"
    assert got.json()["tech_tags"] == ["Polars", "DuckDB"]


async def test_microservices_visible_in_bootstrap_when_flag_on(client, auth_headers):
    # enable retail flag -> retail microservice should appear in bootstrap
    await client.put(
        "/api/v1/feature-flags/ENABLE_RETAIL",
        headers=auth_headers,
        json={"enabled": True},
    )
    body = (await client.get("/api/v1/public/bootstrap")).json()
    keys = {m["key"] for m in body["microservices"]}
    assert "retail" in keys
