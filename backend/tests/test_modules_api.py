"""Module routes are mounted but gated by their feature flag (404 when off)."""


async def test_crawlers_hidden_when_flag_off(client):
    # ENABLE_CRAWLERS defaults to off → routes return 404.
    assert (await client.get("/api/v1/crawlers/jobs")).status_code == 404


async def test_crawlers_appear_when_flag_on(client, auth_headers):
    await client.put(
        "/api/v1/feature-flags/ENABLE_CRAWLERS",
        headers=auth_headers,
        json={"enabled": True},
    )
    resp = await client.get("/api/v1/crawlers/jobs")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)
    # turn back off to keep tests independent
    await client.put(
        "/api/v1/feature-flags/ENABLE_CRAWLERS",
        headers=auth_headers,
        json={"enabled": False},
    )


async def test_agents_gated(client, auth_headers):
    assert (await client.get("/api/v1/agents/workflows")).status_code == 404
    await client.put(
        "/api/v1/feature-flags/ENABLE_AGENTIC_AI",
        headers=auth_headers,
        json={"enabled": True},
    )
    resp = await client.get("/api/v1/agents/workflows")
    assert resp.status_code == 200
    assert "crawl" in resp.json()
    await client.put(
        "/api/v1/feature-flags/ENABLE_AGENTIC_AI",
        headers=auth_headers,
        json={"enabled": False},
    )


async def test_agent_run_persists_task(client, auth_headers):
    await client.put(
        "/api/v1/feature-flags/ENABLE_AGENTIC_AI",
        headers=auth_headers,
        json={"enabled": True},
    )
    run = await client.post(
        "/api/v1/agents/run",
        headers=auth_headers,
        json={"workflow": "insight", "input": {"topic": "crypto", "points": [1, 2]}},
    )
    assert run.status_code == 200, run.text
    body = run.json()
    assert body["validated"] is True
    task_id = body["task_id"]

    got = await client.get(f"/api/v1/agents/tasks/{task_id}", headers=auth_headers)
    assert got.status_code == 200
    assert got.json()["status"] == "done"

    await client.put(
        "/api/v1/feature-flags/ENABLE_AGENTIC_AI",
        headers=auth_headers,
        json={"enabled": False},
    )
