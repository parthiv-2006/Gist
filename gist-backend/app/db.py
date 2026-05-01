# app/db.py
"""
MongoDB connection manager using Motor (async driver).

The DB connection is optional — if MONGODB_URI is not set (or unreachable),
the app starts normally and library persistence is silently disabled.
"""
import asyncio
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
    """Establish the MongoDB connection at application startup.

    Uses three layers of timeout protection so the FastAPI lifespan can never
    block indefinitely when Atlas is unreachable:
      1. Motor client-level timeouts (serverSelection / connect / socket).
      2. asyncio.wait_for() wrapping the ping call (hard 10 s wall-clock limit).
      3. asyncio.wait_for() wrapping index creation (hard 5 s limit).
    If any timeout fires the server still starts normally; library endpoints
    return 503 gracefully until a restart succeeds.
    """
    global _client, _db, _connection_error
    uri = os.environ.get("MONGODB_URI")
    if not uri:
        logger.warning("MONGODB_URI not set — library persistence is disabled")
        _connection_error = "MONGODB_URI not set"
        return
    try:
        _client = AsyncIOMotorClient(
            uri,
            # Motor/driver-level timeouts (milliseconds)
            serverSelectionTimeoutMS=5_000,
            connectTimeoutMS=5_000,
            socketTimeoutMS=10_000,
            tlsCAFile=certifi.where(),
        )
        # Hard asyncio timeout — prevents the lifespan from blocking the server
        # indefinitely when Atlas is unreachable (DNS stall, TLS handshake, etc.)
        await asyncio.wait_for(_client.admin.command("ping"), timeout=10.0)
        _db = _client["gist"]
        await asyncio.wait_for(
            _db["gists"].create_index([("created_at", -1)]),
            timeout=5.0,
        )
        _connection_error = None
        logger.info("Connected to MongoDB (database: gist)")
    except asyncio.TimeoutError:
        _connection_error = "Connection timed out after 10 s"
        logger.warning(
            "MongoDB connection timed out — library persistence disabled. "
            "Check that your IP is whitelisted in MongoDB Atlas Network Access."
        )
        if _client:
            _client.close()
        _client = None
        _db = None
    except Exception as exc:
        _connection_error = str(exc)
        logger.warning("MongoDB connection failed — library persistence disabled: %s", exc)
        if _client:
            _client.close()
        _client = None
        _db = None


async def disconnect_db() -> None:
    """Close the MongoDB connection at application shutdown."""
    global _client, _db
    if _client:
        _client.close()
        _client = None
        _db = None
