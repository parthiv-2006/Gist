"""
tests/test_synapse_routes.py
Integration tests for GET /synapse/graph and POST /synapse/compute.
All outbound calls (get_db, generate_cluster_label) are patched.
"""
import pytest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import app.routes.synapse as synapse_mod


@pytest.fixture(autouse=True)
def reset_rate_limit():
    """Reset per-process rate-limit state before each test."""
    synapse_mod._last_compute_at = None
    yield


# ── GET /synapse/graph ────────────────────────────────────────────────────────

async def test_graph_503_when_db_unavailable(client):
    with patch("app.routes.synapse.get_db", return_value=None):
        r = await client.get("/synapse/graph")
    assert r.status_code == 503
    assert r.json()["code"] == "DB_UNAVAILABLE"


async def test_graph_404_when_no_cache(client):
    fake_coll = MagicMock()
    fake_coll.find_one = AsyncMock(return_value=None)
    fake_coll.count_documents = AsyncMock(return_value=0)
    fake_db = MagicMock()
    fake_db.__getitem__ = MagicMock(return_value=fake_coll)

    with patch("app.routes.synapse.get_db", return_value=fake_db):
        r = await client.get("/synapse/graph")
    assert r.status_code == 404
    assert r.json()["code"] == "NO_CACHE"


async def test_graph_returns_cached_payload(client):
    cache_doc = {
        "_id": "current",
        "graph": {
            "nodes": [], "edges": [], "clusters": [],
            "canvas": {"width": 1000, "height": 1000},
        },
        "meta": {
            "computed_at": "2024-01-01T00:00:00+00:00",
            "indexed_count": 10,
            "rendered_count": 10,
            "missing_embeddings": 0,
            "cluster_count": 4,
            "edge_count": 0,
        },
        "computed_at": datetime.now(timezone.utc),   # today → age_days = 0
    }
    fake_coll = MagicMock()
    fake_coll.find_one = AsyncMock(return_value=cache_doc)
    fake_coll.count_documents = AsyncMock(return_value=10)  # no new gists
    fake_db = MagicMock()
    fake_db.__getitem__ = MagicMock(return_value=fake_coll)

    with patch("app.routes.synapse.get_db", return_value=fake_db):
        r = await client.get("/synapse/graph")

    assert r.status_code == 200
    body = r.json()
    assert "graph" in body
    assert "meta" in body
    assert body["stale"] is False   # same count, computed today


async def test_graph_stale_when_many_new_gists(client):
    cache_doc = {
        "_id": "current",
        "graph": {"nodes": [], "edges": [], "clusters": [], "canvas": {"width": 1000, "height": 1000}},
        "meta": {"computed_at": "2024-01-01T00:00:00", "indexed_count": 5,
                 "rendered_count": 5, "missing_embeddings": 0, "cluster_count": 4, "edge_count": 0},
        "computed_at": datetime(2024, 1, 1, tzinfo=timezone.utc),
    }
    fake_coll = MagicMock()
    fake_coll.find_one = AsyncMock(return_value=cache_doc)
    fake_coll.count_documents = AsyncMock(return_value=15)  # 10 new gists since cache
    fake_db = MagicMock()
    fake_db.__getitem__ = MagicMock(return_value=fake_coll)

    with patch("app.routes.synapse.get_db", return_value=fake_db):
        r = await client.get("/synapse/graph")

    assert r.status_code == 200
    assert r.json()["stale"] is True


# ── POST /synapse/compute ─────────────────────────────────────────────────────

async def test_compute_503_when_db_unavailable(client):
    with patch("app.routes.synapse.get_db", return_value=None):
        r = await client.post("/synapse/compute")
    assert r.status_code == 503
    assert r.json()["code"] == "DB_UNAVAILABLE"


async def test_compute_503_insufficient_data(client):
    fake_coll = MagicMock()
    fake_coll.find.return_value.sort.return_value.limit.return_value.to_list = AsyncMock(return_value=[])
    fake_coll.count_documents = AsyncMock(return_value=0)
    fake_db = MagicMock()
    fake_db.__getitem__ = MagicMock(return_value=fake_coll)

    with patch("app.routes.synapse.get_db", return_value=fake_db):
        r = await client.post("/synapse/compute")

    assert r.status_code == 503
    assert r.json()["code"] == "INSUFFICIENT_DATA"


def _make_fake_docs(n: int) -> list[dict]:
    """Build n fake gist documents with 16-dim embeddings."""
    return [
        {
            "_id": f"id{i}",
            "original_text": f"Sample text for gist number {i}.",
            "explanation": f"This is explanation {i}.",
            "category": "Science",
            "mode": "standard",
            "url": "https://example.com",
            "created_at": datetime(2024, 1, 1, tzinfo=timezone.utc),
            "embedding": [float((i + j) % 7) / 7.0 for j in range(16)],
        }
        for i in range(n)
    ]


async def test_compute_happy_path(client):
    docs = _make_fake_docs(8)

    fake_coll = MagicMock()
    fake_coll.find.return_value.sort.return_value.limit.return_value.to_list = AsyncMock(return_value=docs)
    fake_coll.count_documents = AsyncMock(return_value=8)
    fake_coll.update_one = AsyncMock()
    fake_db = MagicMock()
    fake_db.__getitem__ = MagicMock(return_value=fake_coll)

    with (
        patch("app.routes.synapse.get_db", return_value=fake_db),
        patch("app.routes.synapse.generate_cluster_label", new_callable=AsyncMock, return_value="Machine Learning"),
    ):
        r = await client.post("/synapse/compute")

    assert r.status_code == 200
    body = r.json()
    assert "graph" in body and "meta" in body
    graph = body["graph"]
    assert len(graph["nodes"]) == 8
    assert all("x" in n and "y" in n for n in graph["nodes"])
    assert isinstance(graph["clusters"], list)
    assert isinstance(graph["edges"], list)
    fake_coll.update_one.assert_awaited_once()


async def test_compute_rate_limited(client):
    synapse_mod._last_compute_at = datetime.now(timezone.utc)

    with patch("app.routes.synapse.get_db", return_value=MagicMock()):
        r = await client.post("/synapse/compute")

    assert r.status_code == 429
    body = r.json()
    assert body["code"] == "RATE_LIMITED"
    assert "retry_after" in body


async def test_compute_label_failure_falls_back(client):
    docs = _make_fake_docs(8)

    fake_coll = MagicMock()
    fake_coll.find.return_value.sort.return_value.limit.return_value.to_list = AsyncMock(return_value=docs)
    fake_coll.count_documents = AsyncMock(return_value=8)
    fake_coll.update_one = AsyncMock()
    fake_db = MagicMock()
    fake_db.__getitem__ = MagicMock(return_value=fake_coll)

    with (
        patch("app.routes.synapse.get_db", return_value=fake_db),
        patch("app.routes.synapse.generate_cluster_label",
              new_callable=AsyncMock, side_effect=RuntimeError("Gemini down")),
    ):
        r = await client.post("/synapse/compute")

    assert r.status_code == 200
    labels = [c["label"] for c in r.json()["graph"]["clusters"]]
    assert all(lbl.startswith("Topic ") for lbl in labels)


async def test_compute_sets_rate_limit_timestamp(client):
    assert synapse_mod._last_compute_at is None

    docs = _make_fake_docs(8)
    fake_coll = MagicMock()
    fake_coll.find.return_value.sort.return_value.limit.return_value.to_list = AsyncMock(return_value=docs)
    fake_coll.count_documents = AsyncMock(return_value=8)
    fake_coll.update_one = AsyncMock()
    fake_db = MagicMock()
    fake_db.__getitem__ = MagicMock(return_value=fake_coll)

    with (
        patch("app.routes.synapse.get_db", return_value=fake_db),
        patch("app.routes.synapse.generate_cluster_label", new_callable=AsyncMock, return_value="AI"),
    ):
        r = await client.post("/synapse/compute")

    assert r.status_code == 200
    assert synapse_mod._last_compute_at is not None
