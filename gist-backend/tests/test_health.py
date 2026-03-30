"""
tests/test_health.py
Health check endpoint tests.
"""
import pytest


async def test_health_endpoint_returns_200(client):
    """The /health endpoint must always return HTTP 200."""
    response = await client.get("/health")
    assert response.status_code == 200


async def test_health_endpoint_returns_ok_status(client):
    """The /health response body must be {"status": "ok"}."""
    response = await client.get("/health")
    assert response.json() == {"status": "ok"}
