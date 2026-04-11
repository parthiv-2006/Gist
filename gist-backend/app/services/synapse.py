# app/services/synapse.py
"""
Pure-function compute module for Synapse knowledge graph.
No FastAPI, no Mongo, no Gemini network calls — only numpy.
All functions are deterministic given identical inputs.
"""
import numpy as np

MAX_GISTS           = 300
EDGE_THRESHOLD      = 0.72
EDGES_PER_NODE_MAX  = 3
CANVAS_SIZE         = 1000   # PCA output scaled to [0, CANVAS_SIZE] × [0, CANVAS_SIZE]


def choose_k(n: int) -> int:
    """Heuristic cluster count: max(4, min(12, round(sqrt(n)))). Returns 1 if n <= 1."""
    if n <= 1:
        return 1
    return max(4, min(12, round(n ** 0.5)))


def project_pca_2d(embeddings: np.ndarray) -> np.ndarray:
    """
    Project (N, D) float32 embeddings to (N, 2) via PCA, scaled to [0, CANVAS_SIZE].

    Uses numpy SVD on the centered matrix — fully deterministic, no random state.
    Handles N <= 1 by returning a single point at the canvas centre.
    """
    n = embeddings.shape[0]
    if n <= 1:
        return np.array([[CANVAS_SIZE / 2, CANVAS_SIZE / 2]], dtype=np.float32)

    # Centre the data
    centred = embeddings - embeddings.mean(axis=0, keepdims=True)

    # Economy SVD: Vt rows are principal components (D, D) → we only need first 2
    # Use full_matrices=False for memory efficiency on 768-dim vectors
    try:
        _, _, Vt = np.linalg.svd(centred, full_matrices=False)
        components = Vt[:2]          # (2, D)
    except np.linalg.LinAlgError:
        # Fallback: random-ish but still deterministic via norm
        components = centred[:2] / (np.linalg.norm(centred[:2], axis=1, keepdims=True) + 1e-9)

    projected = centred @ components.T  # (N, 2)

    # Min-max scale each axis independently to [0, CANVAS_SIZE]
    mins = projected.min(axis=0)
    maxs = projected.max(axis=0)
    ranges = maxs - mins
    ranges[ranges < 1e-9] = 1.0       # avoid division by zero for degenerate axes

    scaled = (projected - mins) / ranges * CANVAS_SIZE
    return scaled.astype(np.float32)


def kmeans_cluster(points_2d: np.ndarray, k: int, seed: int = 42) -> np.ndarray:
    """
    Assign each 2D point to one of k clusters via Lloyd's algorithm.

    Deterministic via seeded RNG. Converges in at most 50 iterations.
    Returns (N,) int32 array of cluster indices in [0, k).
    """
    n = points_2d.shape[0]
    k = min(k, n)  # can't have more clusters than points

    rng = np.random.default_rng(seed)
    # Pick k distinct initial centroids from the data points
    init_idxs = rng.choice(n, size=k, replace=False)
    centroids = points_2d[init_idxs].copy().astype(np.float64)

    pts = points_2d.astype(np.float64)
    assignments = np.zeros(n, dtype=np.int32)

    for _ in range(50):
        # Assign step — squared Euclidean distance to each centroid
        diffs = pts[:, np.newaxis, :] - centroids[np.newaxis, :, :]  # (N, k, 2)
        dists = (diffs ** 2).sum(axis=2)                              # (N, k)
        new_assignments = dists.argmin(axis=1).astype(np.int32)

        if np.array_equal(new_assignments, assignments):
            break
        assignments = new_assignments

        # Update centroids
        for c in range(k):
            mask = assignments == c
            if mask.any():
                centroids[c] = pts[mask].mean(axis=0)

    return assignments


def compute_edges(embeddings: np.ndarray) -> list[tuple[int, int, float]]:
    """
    Build graph edges from cosine similarity matrix.

    For each node, keep at most EDGES_PER_NODE_MAX neighbours
    with cosine similarity >= EDGE_THRESHOLD. Each undirected edge
    appears exactly once (source < target).

    Returns list of (source_idx, target_idx, weight) tuples.
    """
    n = embeddings.shape[0]
    if n < 2:
        return []

    # L2-normalise for cosine similarity
    norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
    norms[norms < 1e-9] = 1.0
    normed = embeddings / norms  # (N, D)

    # Full cosine similarity matrix (N, N) — fine for N <= 300
    sim = (normed @ normed.T).astype(np.float32)
    np.fill_diagonal(sim, 0.0)  # exclude self-loops

    edges: list[tuple[int, int, float]] = []
    seen: set[tuple[int, int]] = set()

    for i in range(n):
        row = sim[i]
        candidates = np.where(row >= EDGE_THRESHOLD)[0]
        if len(candidates) == 0:
            continue

        # Sort by similarity descending, take top EDGES_PER_NODE_MAX
        top = candidates[np.argsort(-row[candidates])[:EDGES_PER_NODE_MAX]]

        for j in top.tolist():
            key = (min(i, j), max(i, j))
            if key not in seen:
                seen.add(key)
                edges.append((key[0], key[1], float(sim[i, j])))

    return edges
