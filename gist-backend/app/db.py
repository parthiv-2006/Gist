# app/db.py
"""
MongoDB connection manager using Motor (async driver).

The DB connection is optional — if MONGODB_URI is not set (or unreachable),
the app starts normally and library persistence is silently disabled.
"""
import os
import logging
from typing import Optional

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

logger = logging.getLogger(__name__)

_client: Optional[AsyncIOMotorClient] = None
_db: Optional[AsyncIOMotorDatabase] = None


def get_db() -> Optional[AsyncIOMotorDatabase]:
    """Return the active database handle, or None if not connected."""
    return _db


async def connect_db() -> None:
    """Establish the MongoDB connection at application startup."""
    global _client, _db
    uri = os.environ.get("MONGODB_URI")
    if not uri:
        logger.warning("MONGODB_URI not set — library persistence is disabled")
        return
    try:
        _client = AsyncIOMotorClient(uri, serverSelectionTimeoutMS=5000)
        # Ping to verify the connection is live before accepting traffic.
        await _client.admin.command("ping")
        _db = _client["gist"]
        # Ensure the collection is indexed for fast sorted retrieval.
        await _db["gists"].create_index([("created_at", -1)])
        logger.info("Connected to MongoDB (database: gist)")
    except Exception as exc:
        logger.warning("MongoDB connection failed — library persistence disabled: %s", exc)
        _client = None
        _db = None


async def disconnect_db() -> None:
    """Close the MongoDB connection at application shutdown."""
    global _client, _db
    if _client:
        _client.close()
        _client = None
        _db = None
