# app/main.py
import os
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from app.routes.simplify import router

load_dotenv()  # Load .env if present (local dev only)

app = FastAPI(
    title="Gist API",
    description="Plain-language explanation service for the Gist browser extension.",
    version="0.1.0",
)

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
    allow_credentials=True,
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(router)


@app.get("/health")
async def health():
    """
    Health check endpoint.
    Ping this on extension install (chrome.runtime.onInstalled) to warm up
    Render's free tier and avoid the 30s cold-start delay.
    """
    return {"status": "ok"}
