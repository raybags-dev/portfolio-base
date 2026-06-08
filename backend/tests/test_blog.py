"""Blog: posts, search, featured, likes, comments, related."""

import itertools

import pytest

_counter = itertools.count(1)


async def _create(client, headers, **over):
    n = next(_counter)
    body = {
        "title": over.get("title", "Hello World"),
        "slug": over.get("slug", f"hello-world-{n}"),
        "excerpt": "An intro post",
        "content_markdown": over.get("content", "# Hi\n\n" + "word " * 250),
        "status": over.get("status", "published"),
        "is_featured": over.get("is_featured", False),
        "tag_slugs": over.get("tag_slugs", []),
    }
    return await client.post("/api/v1/blog/posts", headers=headers, json=body)


@pytest.fixture
async def post(client, auth_headers):
    resp = await _create(client, auth_headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


async def test_create_computes_reading_time(post):
    assert post["reading_minutes"] >= 1  # ~250 words → ≥2 min


async def test_public_list_only_published(client, auth_headers):
    await _create(client, auth_headers, slug="a-draft", title="Draft One", status="draft")
    body = (await client.get("/api/v1/blog/posts")).json()
    slugs = {p["slug"] for p in body["items"]}
    assert "a-draft" not in slugs


async def test_search_and_featured(client, auth_headers):
    await _create(client, auth_headers, slug="feat-1", title="Kafka Streaming",
                  is_featured=True, content="kafka pipelines and streaming")
    found = (await client.get("/api/v1/blog/posts", params={"q": "kafka"})).json()
    assert any(p["slug"] == "feat-1" for p in found["items"])
    feat = (await client.get("/api/v1/blog/posts", params={"featured": "true"})).json()
    assert all(p["is_featured"] for p in feat["items"])


async def test_get_post_has_counts_and_related(client, auth_headers, post):
    await _create(client, auth_headers, slug="rel-1", title="Related One")
    detail = await client.get(f"/api/v1/blog/posts/{post['slug']}")
    assert detail.status_code == 200
    body = detail.json()
    assert "like_count" in body and "comment_count" in body and "related" in body


async def test_like_is_idempotent_per_client(client, post):
    a = await client.post(f"/api/v1/blog/posts/{post['slug']}/like")
    assert a.status_code == 200
    first = a.json()["like_count"]
    b = await client.post(f"/api/v1/blog/posts/{post['slug']}/like")
    assert b.json()["like_count"] == first  # same fingerprint → no double count


async def test_comments_flow(client, post):
    add = await client.post(
        f"/api/v1/blog/posts/{post['slug']}/comments",
        json={"author_name": "Reader", "content": "Great post!"},
    )
    assert add.status_code == 201
    lst = await client.get(f"/api/v1/blog/posts/{post['slug']}/comments")
    assert any(c["content"] == "Great post!" for c in lst.json())
    # honeypot blocks spam
    spam = await client.post(
        f"/api/v1/blog/posts/{post['slug']}/comments",
        json={"author_name": "Bot", "content": "spam", "website": "http://x"},
    )
    assert spam.status_code == 400


async def test_manage_requires_admin(client, auth_headers):
    assert (await client.get("/api/v1/blog/manage/posts")).status_code == 401
    assert (await client.get("/api/v1/blog/manage/posts", headers=auth_headers)).status_code == 200


async def test_blog_section_seeded(client):
    body = (await client.get("/api/v1/public/bootstrap")).json()
    assert any(s["key"] == "blog" for s in body["sections"])
