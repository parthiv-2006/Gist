# app/db.py
"""
MongoDB connection manager using Motor (async driver).

The DB connection is optional — if MONGODB_URI is not set (or unreachable),
the app starts normally and library persistence is silently disabled.
"""
import os
import logging
from typing import Optional

import certifi
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

logger = logging.getLogger(__name__)

_client: Optional[AsyncIOMotorClient] = None
_db: Optional[AsyncIOMotorDatabase] = None
_connection_error: Optional[str] = None


def get_db() -> Optional[AsyncIOMotorDatabase]:
    """Return the active database handle, or None if not connected."""
    return _db


def get_db_status() -> dict:
    """Return connection status and error for health checks."""
    if _db is not None:
        return {"connected": True}
    if _connection_error:
        return {"connected": False, "error": _connection_error}
    return {"connected": False, "error": "MONGODB_URI not set"}


async def connect_db() -> None:
    """Establish the MongoDB connection at application startup."""
    global _client, _db, _connection_error
    uri = os.environ.get("MONGODB_URI")
    if not uri:
        logger.warning("MONGODB_URI not set — library persistence is disabled")
        _connection_error = "MONGODB_URI not set"
        return
    try:
        _client = AsyncIOMotorClient(uri, serverSelectionTimeoutMS=5000, tlsCAFile=certifi.where())
        await _client.admin.command("ping")
        _db = _client["gist"]
        await _db["gists"].create_index([("created_at", -1)])
        _connection_error = None
        logger.info("Connected to MongoDB (database: gist)")
    except Exception as exc:
        _connection_error = str(exc)
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
