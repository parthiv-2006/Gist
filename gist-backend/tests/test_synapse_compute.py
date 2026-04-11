"""
tests/test_synapse_compute.py
Unit tests for app/services/synapse.py — pure numpy, no mocks needed.
"""
import numpy as np
import pytest
from app.services.synapse import (
    project_pca_2d,
    kmeans_cluster,
    choose_k,
    compute_edges,
    CANVAS_SIZE,
    EDGE_THRESHOLD,
    EDGES_PER_NODE_MAX,
)


class TestChooseK:
    def test_single_point(self):
        assert choose_k(1) == 1

    def test_small_n_clamped_to_min(self):
        assert choose_k(4) == 4   # sqrt(4)=2, clamped to min 4
        assert choose_k(9) == 4   # sqrt(9)=3, clamped to min 4

    def test_mid_range(self):
        assert choose_k(100) == 10   # sqrt(100)=10

    def test_large_clamped_to_max(self):
        assert choose_k(300) == 12   # sqrt(300)~17.3, clamped to max 12


class TestProjectPca2d:
    def test_output_shape(self):
        rng = np.random.default_rng(0)
        emb = rng.normal(size=(20, 16)).astype(np.float32)
        pts = project_pca_2d(emb)
        assert pts.shape == (20, 2)

    def test_output_range(self):
        rng = np.random.default_rng(0)
        emb = rng.normal(size=(20, 16)).astype(np.float32)
        pts = project_pca_2d(emb)
        assert float(pts.min()) >= 0.0
        assert float(pts.max()) <= CANVAS_SIZE

    def test_deterministic(self):
        rng = np.random.default_rng(0)
        emb = rng.normal(size=(10, 8)).astype(np.float32)
        a = project_pca_2d(emb)
        b = project_pca_2d(emb)
        np.testing.assert_allclose(a, b)

    def test_single_point_returns_centre(self):
        emb = np.ones((1, 4), dtype=np.float32)
        pts = project_pca_2d(emb)
        assert pts.shape == (1, 2)
        np.testing.assert_allclose(pts[0], [CANVAS_SIZE / 2, CANVAS_SIZE / 2])

    def test_identical_points_no_crash(self):
        # All embeddings identical → zero variance → should not raise
        emb = np.ones((5, 8), dtype=np.float32)
        pts = project_pca_2d(emb)
        assert pts.shape == (5, 2)


class TestKmeansCluster:
    def test_assigns_every_point(self):
        rng = np.random.default_rng(0)
        pts = (rng.normal(size=(30, 2)) * 100).astype(np.float64)
        labels = kmeans_cluster(pts, k=4)
        assert labels.shape == (30,)
        assert set(labels.tolist()).issubset({0, 1, 2, 3})

    def test_k_capped_at_n(self):
        pts = np.array([[1.0, 0.0], [2.0, 0.0]], dtype=np.float64)
        labels = kmeans_cluster(pts, k=10)
        # k is capped to n=2, so only 2 distinct labels
        assert len(set(labels.tolist())) <= 2

    def test_deterministic(self):
        rng = np.random.default_rng(1)
        pts = rng.normal(size=(20, 2)).astype(np.float64)
        a = kmeans_cluster(pts, k=4)
        b = kmeans_cluster(pts, k=4)
        np.testing.assert_array_equal(a, b)

    def test_separated_clusters(self):
        # Two well-separated blobs — k=2 should separate them cleanly
        group_a = np.zeros((10, 2)) + np.array([0.0, 0.0])
        group_b = np.zeros((10, 2)) + np.array([1000.0, 1000.0])
        pts = np.vstack([group_a, group_b]).astype(np.float64)
        labels = kmeans_cluster(pts, k=2)
        # All points in group_a should share one label, group_b the other
        assert len(set(labels[:10].tolist())) == 1
        assert len(set(labels[10:].tolist())) == 1
        assert labels[0] != labels[10]


class TestComputeEdges:
    def test_similar_nodes_connected(self):
        a = np.array([1.0, 0.0, 0.0], dtype=np.float32)
        b = np.array([0.99, 0.1, 0.0], dtype=np.float32)
        c = np.array([0.0, 0.0, 1.0], dtype=np.float32)
        emb = np.stack([a, b, c])
        edges = compute_edges(emb)
        pairs = {(min(i, j), max(i, j)) for i, j, _ in edges}
        assert (0, 1) in pairs        # a~b above threshold
        assert (0, 2) not in pairs    # a⊥c below threshold
        assert (1, 2) not in pairs    # b⊥c below threshold

    def test_caps_per_node(self):
        # 10 identical unit vectors → every pair qualifies.
        # Each node emits at most EDGES_PER_NODE_MAX outgoing edges (the per-node cap).
        # Total unique edges ≤ n * EDGES_PER_NODE_MAX (dedup will reduce it further).
        emb = np.ones((10, 5), dtype=np.float32)
        edges = compute_edges(emb)
        assert len(edges) <= 10 * EDGES_PER_NODE_MAX

    def test_no_self_loops(self):
        emb = np.eye(5, dtype=np.float32)
        edges = compute_edges(emb)
        for i, j, _ in edges:
            assert i != j

    def test_each_edge_appears_once(self):
        rng = np.random.default_rng(0)
        emb = rng.normal(size=(15, 8)).astype(np.float32)
        # Normalise so many pairs exceed threshold
        norms = np.linalg.norm(emb, axis=1, keepdims=True)
        emb = emb / norms
        edges = compute_edges(emb)
        pairs = [(min(i, j), max(i, j)) for i, j, _ in edges]
        assert len(pairs) == len(set(pairs)), "Duplicate edges found"

    def test_single_node_returns_empty(self):
        emb = np.ones((1, 4), dtype=np.float32)
        assert compute_edges(emb) == []

    def test_weights_in_valid_range(self):
        rng = np.random.default_rng(42)
        emb = rng.normal(size=(20, 16)).astype(np.float32)
        edges = compute_edges(emb)
        for _, _, w in edges:
            assert EDGE_THRESHOLD <= w <= 1.0 + 1e-6
