"""
tests/test_library.py
Tests for GET /library and the categorize_text utility.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.services.categorize import categorize_text


# ---------------------------------------------------------------------------
# categorize_text unit tests
# ---------------------------------------------------------------------------

def test_categorize_code():
    assert categorize_text("def my_func(): return True") == "Code"


def test_categorize_legal():
    assert categorize_text("Whereas the plaintiff is liable pursuant to the statute") == "Legal"


def test_categorize_medical():
    assert categorize_text("The patient requires a diagnosis and clinical treatment plan") == "Medical"


def test_categorize_finance():
    assert categorize_text("The company reported strong revenue and growing profit margins this quarter") == "Finance"


def test_categorize_science():
    assert categorize_text("The hypothesis was validated through empirical experiment and statistical analysis") == "Science"


def test_categorize_general_fallback():
    assert categorize_text("Hello world, this is just some text") == "General"


def test_categorize_empty_string():
    assert categorize_text("") == "General"


# ---------------------------------------------------------------------------
# GET /library route tests
# ---------------------------------------------------------------------------

async def test_library_returns_503_when_db_not_connected(client):
    """When MongoDB is not configured, /library returns 503."""
    with patch("app.routes.library.get_db", return_value=None):
        response = await client.get("/library")
    assert response.status_code == 503
    assert response.json()["code"] == "DB_UNAVAILABLE"


async def test_library_returns_items_list(client):
    """When DB is connected, /library returns items from the collection."""
    from datetime import datetime, timezone

    fake_doc = {
        "_id": "abc123",
        "original_text": "Some highlighted text",
        "explanation": "A plain-language summary",
        "mode": "standard",
        "url": "https://example.com",
        "category": "General",
        "created_at": datetime(2024, 1, 1, tzinfo=timezone.utc),
    }

    mock_cursor = MagicMock()
    mock_cursor.sort.return_value = mock_cursor
    mock_cursor.limit.return_value = mock_cursor
    mock_cursor.to_list = AsyncMock(return_value=[fake_doc])

    mock_collection = MagicMock()
    mock_collection.find.return_value = mock_cursor

    mock_db = MagicMock()
    mock_db.__getitem__ = MagicMock(return_value=mock_collection)

    with patch("app.routes.library.get_db", return_value=mock_db):
        response = await client.get("/library")

    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert len(data["items"]) == 1
    item = data["items"][0]
    assert item["original_text"] == "Some highlighted text"
    assert item["category"] == "General"
    # created_at should be serialized as an ISO string
    assert "2024-01-01" in item["created_at"]


async def test_library_returns_empty_list_when_no_gists(client):
    """When the collection is empty, items list is []."""
    mock_cursor = MagicMock()
    mock_cursor.sort.return_value = mock_cursor
    mock_cursor.limit.return_value = mock_cursor
    mock_cursor.to_list = AsyncMock(return_value=[])

    mock_collection = MagicMock()
    mock_collection.find.return_value = mock_cursor

    mock_db = MagicMock()
    mock_db.__getitem__ = MagicMock(return_value=mock_collection)

    with patch("app.routes.library.get_db", return_value=mock_db):
        response = await client.get("/library")

    assert response.status_code == 200
    assert response.json() == {"items": []}


async def test_library_returns_tags_field_in_items(client):
    """GET /library includes tags array on each item."""
    from datetime import datetime, timezone

    fake_doc = {
        "_id": "abc123",
        "original_text": "async def fetch(): ...",
        "explanation": "An async Python function",
        "mode": "standard",
        "url": "https://example.com",
        "category": "Code",
        "tags": ["async-await", "python"],
        "created_at": datetime(2024, 6, 1, tzinfo=timezone.utc),
    }

    mock_cursor = MagicMock()
    mock_cursor.sort.return_value = mock_cursor
    mock_cursor.limit.return_value = mock_cursor
    mock_cursor.to_list = AsyncMock(return_value=[fake_doc])

    mock_collection = MagicMock()
    mock_collection.find.return_value = mock_cursor

    mock_db = MagicMock()
    mock_db.__getitem__ = MagicMock(return_value=mock_collection)

    with patch("app.routes.library.get_db", return_value=mock_db):
        response = await client.get("/library")

    assert response.status_code == 200
    item = response.json()["items"][0]
    assert item["tags"] == ["async-await", "python"]


async def test_library_items_default_empty_tags_when_missing(client):
    """GET /library returns tags=[] for older docs that have no tags field."""
    from datetime import datetime, timezone

    fake_doc = {
        "_id": "old1",
        "original_text": "old gist",
        "explanation": "legacy",
        "mode": "standard",
        "url": "https://example.com",
        "category": "General",
        # No "tags" field — simulating a pre-tags document
        "created_at": datetime(2023, 1, 1, tzinfo=timezone.utc),
    }

    mock_cursor = MagicMock()
    mock_cursor.sort.return_value = mock_cursor
    mock_cursor.limit.return_value = mock_cursor
    mock_cursor.to_list = AsyncMock(return_value=[fake_doc])

    mock_collection = MagicMock()
    mock_collection.find.return_value = mock_cursor

    mock_db = MagicMock()
    mock_db.__getitem__ = MagicMock(return_value=mock_collection)

    with patch("app.routes.library.get_db", return_value=mock_db):
        response = await client.get("/library")

    assert response.status_code == 200
    item = response.json()["items"][0]
    assert item["tags"] == []


async def test_save_gist_stores_tags(client):
    """POST /library/save calls generate_tags and stores result in doc."""
    mock_collection = MagicMock()
    mock_collection.insert_one = AsyncMock(return_value=MagicMock(inserted_id="xyz"))

    mock_db = MagicMock()
    mock_db.__getitem__ = MagicMock(return_value=mock_collection)

    with (
        patch("app.routes.library.get_db", return_value=mock_db),
        patch("app.routes.library.categorize_text", return_value="Code"),
        patch("app.routes.library.embed_text", new_callable=AsyncMock, return_value=[0.1] * 768),
        patch("app.routes.library.generate_tags", new_callable=AsyncMock, return_value=["async-await", "python"]),
    ):
        response = await client.post(
            "/library/save",
            json={
                "original_text": "async def fetch(): ...",
                "explanation": "Async fetch function",
                "mode": "standard",
                "url": "https://example.com",
            },
        )

    assert response.status_code == 200
    assert response.json()["success"] is True

    # Verify the document passed to insert_one contains tags
    call_args = mock_collection.insert_one.call_args[0][0]
    assert call_args["tags"] == ["async-await", "python"]


async def test_get_library_tags_endpoint(client):
    """GET /library/tags returns aggregated tag counts sorted by frequency."""
    fake_agg = [
        {"tag": "python", "count": 5},
        {"tag": "async-await", "count": 3},
        {"tag": "react-hooks", "count": 1},
    ]

    mock_cursor = MagicMock()
    mock_cursor.to_list = AsyncMock(return_value=fake_agg)

    mock_collection = MagicMock()
    mock_collection.aggregate.return_value = mock_cursor

    mock_db = MagicMock()
    mock_db.__getitem__ = MagicMock(return_value=mock_collection)

    with patch("app.routes.library.get_db", return_value=mock_db):
        response = await client.get("/library/tags")

    assert response.status_code == 200
    data = response.json()
    assert "tags" in data
    assert data["tags"][0]["tag"] == "python"
    assert data["tags"][0]["count"] == 5


async def test_get_library_tags_returns_503_when_db_unavailable(client):
    """GET /library/tags returns 503 when DB is not connected."""
    with patch("app.routes.library.get_db", return_value=None):
        response = await client.get("/library/tags")
    assert response.status_code == 503
    assert response.json()["code"] == "DB_UNAVAILABLE"


# ---------------------------------------------------------------------------
# generate_tags unit tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_generate_tags_mock_mode():
    """generate_tags returns mock tags when MOCK_LLM is enabled."""
    import os
    from app.services.gemini import generate_tags

    with patch.dict(os.environ, {"MOCK_LLM": "true"}):
        # Re-import to pick up mock flag — or just test the mock path directly
        from unittest.mock import patch as _patch
        with _patch("app.services.gemini._MOCK_LLM", True):
            tags = await generate_tags("some text", "some explanation")
    assert tags == ["mock", "tags"]


@pytest.mark.asyncio
async def test_generate_tags_returns_empty_on_error():
    """generate_tags returns [] if Gemini raises an exception."""
    from app.services.gemini import generate_tags
    import os

    with (
        patch.dict(os.environ, {"GEMINI_API_KEY": "fake-key", "MOCK_LLM": "false"}),
        patch("app.services.gemini._MOCK_LLM", False),
        patch("app.services.gemini.genai.Client") as mock_client,
    ):
        mock_client.return_value.models.generate_content.side_effect = RuntimeError("API down")
        tags = await generate_tags("text", "explanation")
    assert tags == []
