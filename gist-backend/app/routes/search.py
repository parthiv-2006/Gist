# app/routes/search.py
"""
POST /library/ask — Semantic RAG search over saved gists.

Search strategy:
  1. Try MongoDB Atlas $vectorSearch (requires a 'vector_index' on the embedding field).
  2. Fall back to in-process cosine similarity via numpy when Atlas Search is unavailable.
"""
import logging

import numpy as np
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app.db import get_db
from app.limiter import limiter
from app.services.gemini import embed_text, stream_explanation

logger = logging.getLogger(__name__)

router = APIRouter()

_TOP_K = 5
_SCORE_THRESHOLD = 0.3  # ignore very low-confidence cosine matches


async def semantic_search(db, query_embedding: list[float], top_k: int = _TOP_K) -> list[dict]:
    """
    Return up to *top_k* gists ordered by semantic similarity to *query_embedding*.
    Tries MongoDB Atlas $vectorSearch first; falls back to numpy cosine similarity.
    Each returned dict has a 'score' key added (float, higher = more relevant).
    """
    # ── Atlas Vector Search (primary) ──────────────────────────────────────────
    try:
        pipeline = [
            {
                "$vectorSearch": {
                    "index": "vector_index",
                    "path": "embedding",
                    "queryVector": query_embedding,
                    "numCandidates": top_k * 10,
                    "limit": top_k,
                }
            },
            {
                "$project": {
                    "_id": 0,
                    "original_text": 1,
                    "explanation": 1,
                    "mode": 1,
                    "url": 1,
                    "category": 1,
                    "created_at": 1,
                    "score": {"$meta": "vectorSearchScore"},
                }
            },
        ]
        results = await db["gists"].aggregate(pipeline).to_list(length=top_k)
        for doc in results:
            if "created_at" in doc and hasattr(doc["created_at"], "isoformat"):
                doc["created_at"] = doc["created_at"].isoformat()
        return results
    except Exception as exc:
        logger.info("Atlas $vectorSearch unavailable (%s) — using cosine fallback", type(exc).__name__)

    # ── Cosine similarity fallback (numpy) ─────────────────────────────────────
    cursor = db["gists"].find(
        {"embedding": {"$exists": True}},
        {
            "_id": 0,
            "original_text": 1,
            "explanation": 1,
            "mode": 1,
            "url": 1,
            "category": 1,
            "created_at": 1,
            "embedding": 1,
        },
    )
    docs = await cursor.to_list(length=500)
    if not docs:
        return []

    q = np.array(query_embedding, dtype=np.float32)
    q_norm = np.linalg.norm(q)
    if q_norm == 0:
        return []

    scored: list[tuple[float, dict]] = []
    for doc in docs:
        emb = np.array(doc["embedding"], dtype=np.float32)
        score = float(np.dot(q, emb) / (q_norm * np.linalg.norm(emb) + 1e-9))
        if score >= _SCORE_THRESHOLD:
            scored.append((score, doc))

    scored.sort(key=lambda x: x[0], reverse=True)

    results = []
    for score, doc in scored[:top_k]:
        doc.pop("embedding", None)
        if "created_at" in doc and hasattr(doc["created_at"], "isoformat"):
            doc["created_at"] = doc["created_at"].isoformat()
        doc["score"] = score
        results.append(doc)
    return results


@router.post("/library/ask")
@limiter.limit("20/minute")
async def ask_library(request: Request):
    """
    Perform a semantic RAG query over the user's saved gist library.

    Body: { "query": "string" }
    Response: { "answer": "string", "sources": [GistItem, ...] }
    """
    try:
        body = await request.json()
    except Exception:
        return JSONResponse(status_code=400, content={"error": "Invalid request body.", "code": "INVALID_BODY"})

    query: str = (body.get("query") or "").strip()
    if not query:
        return JSONResponse(status_code=400, content={"error": "query is required.", "code": "EMPTY_QUERY"})
    if len(query) > 500:
        return JSONResponse(status_code=400, content={"error": "Query too long (max 500 chars).", "code": "QUERY_TOO_LONG"})

    db = get_db()
    if db is None:
        return JSONResponse(
            status_code=503,
            content={"error": "Library unavailable — database not connected.", "code": "DB_UNAVAILABLE"},
        )

    user_api_key = request.headers.get("X-Gemini-Api-Key") or None

    # 1. Embed the user's query.
    try:
        query_embedding = await embed_text(query, user_api_key)
    except Exception as exc:
        err_detail = str(exc)
        logger.warning("embed_text failed for ask query: %s", err_detail)
        return JSONResponse(
            status_code=503,
            content={
                "error": f"Search unavailable — could not embed query: {err_detail}",
                "code": "LLM_UNAVAILABLE",
            },
        )

    # 2. Find the most semantically similar gists.
    sources = await semantic_search(db, query_embedding)

    if not sources:
        return {
            "answer": (
                "I couldn't find anything relevant in your library yet. "
                "Gist more content to build up your personal knowledge base!"
            ),
            "sources": [],
        }

    # 3. Build RAG context and generate an answer with Gemini.
    context_parts = []
    for i, s in enumerate(sources, 1):
        context_parts.append(
            f"[Note {i}] ({s.get('category', 'General')}, {s.get('mode', 'standard')} mode)\n"
            f"Source: {s['original_text'][:400]}\n"
            f"Gist: {s['explanation']}"
        )
    context = "\n\n".join(context_parts)

    rag_prompt = (
        "You are an assistant helping a user query their personal knowledge base of saved notes.\n\n"
        f"Saved notes:\n{context}\n\n"
        f"User question: {query}\n\n"
        "Answer the question based only on the notes above. "
        "Be concise (2-4 sentences). "
        "Reference which note(s) your answer draws from (e.g. 'According to Note 1...')."
    )

    chunks: list[str] = []
    try:
        async for chunk in stream_explanation(
            selected_text=None,
            page_context="",
            complexity_level="standard",
            messages=[{"role": "user", "content": rag_prompt}],
            api_key=user_api_key,
        ):
            chunks.append(chunk)
    except Exception as exc:
        logger.warning("stream_explanation failed for ask query: %s", exc)
        return JSONResponse(
            status_code=503,
            content={"error": "Could not generate answer — LLM unavailable.", "code": "LLM_UNAVAILABLE"},
        )

    return {"answer": "".join(chunks), "sources": sources}
