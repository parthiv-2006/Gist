# app/main.py
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from app.routes.simplify import router

load_dotenv()  # Load .env if present (local dev only)

app = FastAPI(
    title="Gist API",
    description="Plain-language explanation service for the Gist browser extension.",
    version="0.1.0",
)

# CORS — allow the Chrome Extension's origin.
# In production (Render), set ALLOWED_ORIGINS=chrome-extension://YOUR_EXTENSION_ID
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
