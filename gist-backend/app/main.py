# app/main.py
import logging
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

logger = logging.getLogger(__name__)

from app.limiter import limiter
from app.routes.simplify import router as simplify_router
from app.routes.library import router as library_router
from app.routes.search import router as search_router
from app.routes.autogist import router as autogist_router
from app.routes.nested import router as nested_router
from app.routes.visualize import router as visualize_router
from app.routes.synapse import router as synapse_router
from app.routes.recall import router as recall_router
from app.db import connect_db, disconnect_db, get_db_status
from app.services.gemini import embed_text

load_dotenv()  # Load .env if present (local dev only)

_DEBUG = os.environ.get("DEBUG", "").lower() in ("1", "true", "yes")
_MOCK_LLM = os.environ.get("MOCK_LLM", "").lower() in ("1", "true", "yes")

# Warn at startup if critical env vars are missing (errors will surface per-request otherwise)
if not _MOCK_LLM and not os.environ.get("GEMINI_API_KEY"):
    logger.warning("GEMINI_API_KEY is not set — all LLM endpoints will fail")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_db()
    yield
    await disconnect_db()


app = FastAPI(
    title="Gist API",
    description="Plain-language explanation service for the Gist browser extension.",
    version="0.1.0",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ─── Security Headers Middleware ──────────────────────────────────────────────

@app.middleware("http")
async def add_security_headers(request: Request, call_next) -> Response:
    """
    Append baseline security headers to every response.
    - X-Content-Type-Options: prevents MIME-type sniffing attacks.
    - X-Frame-Options: disallows the API from being embedded in an iframe.
    - Referrer-Policy: suppresses the Referer header on cross-origin requests.
    """
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
    return response

# ─── CORS ─────────────────────────────────────────────────────────────────────

# In production (Render), set ALLOWED_ORIGINS=chrome-extension://YOUR_EXTENSION_ID
# For local development the .env file sets ALLOWED_ORIGINS=chrome-extension://...
# Fallback to "*" only so the local server starts without a .env file.
allowed_origins_raw = os.environ.get("ALLOWED_ORIGINS", "*")
allowed_origins = [o.strip() for o in allowed_origins_raw.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,
    allow_methods=["POST", "GET", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Accept", "X-Gemini-Api-Key"],
)

app.include_router(simplify_router)
app.include_router(library_router)
app.include_router(search_router)
app.include_router(autogist_router)
app.include_router(nested_router)
app.include_router(visualize_router)
app.include_router(synapse_router)
app.include_router(recall_router)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.error("Unhandled exception on %s %s: %s", request.method, request.url.path, exc, exc_info=_DEBUG)
    return JSONResponse(
        status_code=500,
        content={"error": "An unexpected server error occurred.", "code": "INTERNAL_ERROR"},
    )


@app.get("/health")
async def health():
    """
    Health check endpoint.
    Ping this on extension install (chrome.runtime.onInstalled) to warm up
    Render's free tier and avoid the 30s cold-start delay.
    """
    return {"status": "ok", "db": get_db_status()}


@app.get("/health/embedding")
async def health_embedding():
    """Diagnostic: attempt a real embed_text call and report success or the exact error."""
    try:
        vec = await embed_text("test")
        return {"status": "ok", "dim": len(vec), "sample": vec[:3]}
    except Exception as exc:
        return {"status": "error", "error": str(exc), "type": type(exc).__name__}
