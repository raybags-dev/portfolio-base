"""Tests for sections, media upload/serve, and the contact form (offline)."""

import re


# ---- sections ----
async def test_sections_seeded(client):
    resp = await client.get("/api/v1/sections")
    assert resp.status_code == 200
    keys = {s["key"] for s in resp.json()}
    assert {"hero", "about", "projects", "certifications", "contact"} <= keys


async def test_toggle_section(client, auth_headers):
    resp = await client.put(
        "/api/v1/sections/certifications",
        headers=auth_headers,
        json={"enabled": False},
    )
    assert resp.status_code == 200
    assert resp.json()["enabled"] is False
    # restore
    await client.put("/api/v1/sections/certifications", headers=auth_headers,
                     json={"enabled": True})


async def test_cannot_delete_core_section(client, auth_headers):
    resp = await client.delete("/api/v1/sections/hero", headers=auth_headers)
    assert resp.status_code == 400


async def test_sections_in_bootstrap(client):
    body = (await client.get("/api/v1/public/bootstrap")).json()
    assert "sections" in body
    assert any(s["key"] == "experience" for s in body["sections"])


# ---- media ----
PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108020000009077"
    "53de0000000c4944415408d76360000002000154a24f8e0000000049454e44ae426082"
)


async def test_media_upload_and_serve(client, auth_headers):
    resp = await client.post(
        "/api/v1/media",
        headers=auth_headers,
        files={"file": ("pic.png", PNG, "image/png")},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["url"].endswith(f"/api/v1/media/{body['id']}")
    assert body["content_type"] == "image/png"

    served = await client.get(f"/api/v1/media/{body['id']}")
    assert served.status_code == 200
    assert served.headers["content-type"] == "image/png"
    assert served.content == PNG


async def test_media_rejects_unsupported_type(client, auth_headers):
    resp = await client.post(
        "/api/v1/media",
        headers=auth_headers,
        files={"file": ("x.exe", b"MZ", "application/x-msdownload")},
    )
    assert resp.status_code == 415


async def test_media_upload_requires_admin(client):
    resp = await client.post(
        "/api/v1/media", files={"file": ("p.png", PNG, "image/png")}
    )
    assert resp.status_code == 401


# ---- contact ----
async def _solve(question: str) -> int:
    a, b = map(int, re.findall(r"\d+", question))
    return a + b


async def test_contact_challenge_and_submit(client):
    ch = (await client.get("/api/v1/contact/challenge")).json()
    answer = await _solve(ch["question"])
    resp = await client.post(
        "/api/v1/contact",
        json={
            "name": "Visitor", "email": "v@example.com", "message": "Hi there!",
            "challenge_token": ch["token"], "challenge_answer": answer,
        },
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["ok"] is True


async def test_contact_wrong_answer_rejected(client):
    ch = (await client.get("/api/v1/contact/challenge")).json()
    answer = await _solve(ch["question"])
    resp = await client.post(
        "/api/v1/contact",
        json={
            "name": "Bot", "email": "b@example.com", "message": "spam",
            "challenge_token": ch["token"], "challenge_answer": answer + 1,
        },
    )
    assert resp.status_code == 400


async def test_contact_honeypot_blocks(client):
    ch = (await client.get("/api/v1/contact/challenge")).json()
    answer = await _solve(ch["question"])
    resp = await client.post(
        "/api/v1/contact",
        json={
            "name": "Bot", "email": "b@example.com", "message": "spam",
            "challenge_token": ch["token"], "challenge_answer": answer,
            "website": "http://spam.example",
        },
    )
    assert resp.status_code == 400


async def test_contact_messages_admin_only(client, auth_headers):
    assert (await client.get("/api/v1/contact/messages")).status_code == 401
    resp = await client.get("/api/v1/contact/messages", headers=auth_headers)
    assert resp.status_code == 200
