# app/routes/synapse.py
"""
GET  /synapse/graph   — return cached graph (or 404 if none computed yet)
POST /synapse/compute — run full pipeline and persist to synapse_cache collection
"""
import asyncio
import logging
import math
from datetime import datetime, timezone

import numpy as np
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app.db import get_db
from app.services.gemini import generate_cluster_label
from app.services.synapse import (
    MAX_GISTS,
    project_pca_2d,
    kmeans_cluster,
    choose_k,
    compute_edges,
)

logger = logging.getLogger(__name__)
router = APIRouter()

# ── Rate-limit state (per-process, resets on restart) ─────────────────────────
_rate_limit_lock = asyncio.Lock()
_last_compute_at: datetime | None = None
_RATE_LIMIT_SECONDS = 60

# ── Staleness thresholds ───────────────────────────────────────────────────────
_STALENESS_DAYS       = 7
_STALENESS_NEW_GISTS  = 5


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _label_or_fallback(cid: int, excerpts: list[str], api_key: str | None = None) -> str:
    """Generate a cluster label, falling back to 'Topic N' on any failure."""
    try:
        label = await generate_cluster_label(excerpts, api_key)
        return label or f"Topic {cid + 1}"
    except Exception as exc:
        logger.warning("Cluster label failed for cluster %s: %s", cid, exc)
        return f"Topic {cid + 1}"


def _serialize_meta(meta: dict) -> dict:
    """Ensure computed_at is ISO string for JSON serialisation."""
    out = dict(meta)
    if isinstance(out.get("computed_at"), datetime):
        out["computed_at"] = out["computed_at"].isoformat()
    return out


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/synapse/graph")
async def get_graph():
    """
    Return the cached Synapse graph.

    200: { graph, stale, meta }
    404: { error, code: "NO_CACHE" }
    503: { error, code: "DB_UNAVAILABLE" }
    """
    db = get_db()
    if db is None:
        return JSONResponse(
            status_code=503,
            content={"error": "Library unavailable — database not connected.", "code": "DB_UNAVAILABLE"},
        )

    cache = await db["synapse_cache"].find_one({"_id": "current"})
    if not cache:
        return JSONResponse(
            status_code=404,
            content={"error": "No Synapse graph computed yet.", "code": "NO_CACHE"},
        )

    # Determine staleness
    try:
        current_count = await db["gists"].count_documents({"embedding": {"$exists": True}})
        cached_count = cache.get("meta", {}).get("indexed_count", 0)
        new_since = current_count - cached_count
        computed_at = cache.get("computed_at")
        if isinstance(computed_at, datetime):
            age_days = (datetime.now(timezone.utc) - computed_at.replace(tzinfo=timezone.utc)).days
        else:
            age_days = 0
        stale = new_since >= _STALENESS_NEW_GISTS or age_days >= _STALENESS_DAYS
    except Exception as exc:
        logger.warning("Staleness check failed (defaulting to not stale): %s", exc)
        stale = False

    return {
        "graph": cache["graph"],
        "stale": stale,
        "meta": _serialize_meta(cache.get("meta", {})),
    }


@router.post("/synapse/compute")
async def compute_graph(request: Request):
    """
    Run the full Synapse pipeline and persist the result.
    Rate-limited to 1 call per 60 s per process.

    200: { graph, meta }
    429: { error, code: "RATE_LIMITED", retry_after }
    503: { error, code: "DB_UNAVAILABLE" | "INSUFFICIENT_DATA" | "COMPUTE_ERROR" }
    """
    global _last_compute_at
    user_api_key = request.headers.get("X-Gemini-Api-Key") or None

    # Narrow lock: guards only the rate-limit check + slot reservation.
    # Reserving _last_compute_at up front ensures concurrent callers get 429
    # immediately rather than queuing behind the entire pipeline.
    now = datetime.now(timezone.utc)
    async with _rate_limit_lock:
        if _last_compute_at is not None:
            elapsed = (now - _last_compute_at).total_seconds()
            if elapsed < _RATE_LIMIT_SECONDS:
                retry_after = math.ceil(_RATE_LIMIT_SECONDS - elapsed)
                return JSONResponse(
                    status_code=429,
                    content={
                        "error": "Synapse recompute is rate limited.",
                        "code": "RATE_LIMITED",
                        "retry_after": retry_after,
                    },
                )
        # Reserve slot — failures still consume the 60 s window (intentional)
        _last_compute_at = now

    db = get_db()
    if db is None:
        return JSONResponse(
            status_code=503,
            content={"error": "Library unavailable — database not connected.", "code": "DB_UNAVAILABLE"},
        )

    try:
            # 1. Load gists with embeddings (newest first, capped at MAX_GISTS)
            cursor = (
                db["gists"]
                .find(
                    {"embedding": {"$exists": True}},
                    {
                        "_id": 1,
                        "original_text": 1,
                        "explanation": 1,
                        "category": 1,
                        "mode": 1,
                        "url": 1,
                        "created_at": 1,
                        "embedding": 1,
                    },
                )
                .sort("created_at", -1)
                .limit(MAX_GISTS)
            )
            docs = await cursor.to_list(length=MAX_GISTS)

            total_with_emb = await db["gists"].count_documents({"embedding": {"$exists": True}})
            total_all      = await db["gists"].count_documents({})
            missing_emb    = total_all - total_with_emb

            # 2. Guard: need at least 4 gists
            if len(docs) < 4:
                msg = (
                    f"Need at least 4 gists with embeddings — "
                    f"found {len(docs)} of {total_all} saved gists have embeddings. "
                    f"Save more gists and try again."
                ) if total_all > 0 else "Save at least 4 gists first, then build the graph."
                return JSONResponse(
                    status_code=503,
                    content={
                        "error": msg,
                        "code": "INSUFFICIENT_DATA",
                        "indexed_count": len(docs),
                        "total_count": total_all,
                    },
                )

            # 3. CPU-bound pipeline — run in executor to avoid blocking the event loop
            embeddings = np.array([d["embedding"] for d in docs], dtype=np.float32)

            def _pipeline():
                positions   = project_pca_2d(embeddings)
                k           = choose_k(len(docs))
                cluster_ids = kmeans_cluster(positions, k)
                edges       = compute_edges(embeddings)
                return positions, cluster_ids, k, edges

            loop = asyncio.get_running_loop()
            positions, cluster_ids, k, edges = await loop.run_in_executor(None, _pipeline)

            # 4. Label clusters in parallel via Gemini
            label_tasks = []
            for cid in range(k):
                member_idxs = [i for i, c in enumerate(cluster_ids) if c == cid]
                excerpts    = [docs[i]["original_text"][:200] for i in member_idxs[:8]]
                label_tasks.append(_label_or_fallback(cid, excerpts, user_api_key))

            labels = await asyncio.gather(*label_tasks)

            # 5. Assemble clusters
            clusters = []
            for cid in range(k):
                member_idxs = [i for i, c in enumerate(cluster_ids) if c == cid]
                cx = float(positions[member_idxs, 0].mean()) if member_idxs else 500.0
                cy = float(positions[member_idxs, 1].mean()) if member_idxs else 500.0
                clusters.append({
                    "id":       cid,
                    "label":    labels[cid],
                    "size":     len(member_idxs),
                    "centroid": {"x": cx, "y": cy},
                })

            # 6. Assemble nodes
            def _iso(val) -> str:
                if hasattr(val, "isoformat"):
                    return val.isoformat()
                return str(val)

            nodes = [
                {
                    "id":         str(doc["_id"]),
                    "x":          float(positions[i][0]),
                    "y":          float(positions[i][1]),
                    "cluster_id": int(cluster_ids[i]),
                    "category":   doc.get("category", "General"),
                    "mode":       doc.get("mode", "standard"),
                    "title":      doc.get("original_text", "")[:80],
                    "snippet":    doc.get("explanation", "")[:160],
                    "created_at": _iso(doc.get("created_at", "")),
                    "url":        doc.get("url", ""),
                }
                for i, doc in enumerate(docs)
            ]

            # 7. Assemble edges
            edges_payload = [
                {
                    "source": str(docs[i]["_id"]),
                    "target": str(docs[j]["_id"]),
                    "weight": float(w),
                }
                for i, j, w in edges
            ]

            graph = {
                "nodes":    nodes,
                "edges":    edges_payload,
                "clusters": clusters,
                "canvas":   {"width": 1000, "height": 1000},
            }

            meta = {
                "computed_at":       now.isoformat(),
                "indexed_count":     total_with_emb,
                "rendered_count":    len(docs),
                "missing_embeddings": missing_emb,
                "cluster_count":     k,
                "edge_count":        len(edges_payload),
            }

            # 8. Persist cache (upsert)
            await db["synapse_cache"].update_one(
                {"_id": "current"},
                {"$set": {"graph": graph, "meta": meta, "computed_at": now}},
                upsert=True,
            )

            return {"graph": graph, "meta": meta}

    except Exception as exc:
        logger.error("Synapse compute failed: %s", exc, exc_info=True)
        return JSONResponse(
            status_code=503,
            content={"error": "Synapse compute failed — please try again.", "code": "COMPUTE_ERROR"},
        )
