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
