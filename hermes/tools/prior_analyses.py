"""Index and search past investigations via Qdrant semantic search.

Called in two places:
  - hermes.db.history.complete_investigation() — indexes each finished investigation
  - hermes.agent.nodes.decompose_question() — retrieves relevant past findings

Disable via: HERMES_PRIOR_ANALYSES=false
"""
from __future__ import annotations

import os

INVESTIGATIONS_COLLECTION = "hermes_investigations"
_ENABLED = os.getenv("HERMES_PRIOR_ANALYSES", "true").lower() != "false"
_MIN_SCORE = 0.65       # minimum score for context injection
_CACHE_SCORE = 0.80     # minimum score to short-circuit and return prior result directly


# ── Indexing ──────────────────────────────────────────────────────────────────

def index_investigation(
    inv_id: str,
    question: str,
    headline: str,
    key_findings: list[str],
) -> None:
    """Embed and upsert one completed investigation. Best-effort — never raises."""
    if not _ENABLED:
        return
    try:
        _index(inv_id, question, headline, key_findings)
    except Exception:
        pass


def _index(inv_id: str, question: str, headline: str, key_findings: list[str]) -> None:
    from hermes.semantic.embedder import embed_one
    from hermes.semantic.vector_store import ensure_collection, upsert

    # Embed a rich summary so the search surface covers multiple angles
    text = "\n".join([question, headline] + key_findings[:5])
    vector = embed_one(text)

    ensure_collection(INVESTIGATIONS_COLLECTION)
    upsert(INVESTIGATIONS_COLLECTION, [{
        "id": inv_id,
        "vector": vector,
        "payload": {
            "inv_id": inv_id,
            "question": question,
            "headline": headline,
            "key_findings": key_findings[:5],
        },
    }])


# ── Cache hit check ──────────────────────────────────────────────────────────

def find_similar_investigation(question: str) -> tuple[str, float] | None:
    """
    Return (inv_id, score) if a past investigation is similar enough to short-circuit.
    Returns None if Qdrant is unavailable, disabled, or no hit above _CACHE_SCORE.
    """
    if not _ENABLED:
        return None
    try:
        return _find_similar(question)
    except Exception:
        return None


def _find_similar(question: str) -> tuple[str, float] | None:
    from hermes.semantic.embedder import embed_one
    from hermes.semantic.vector_store import search

    vector = embed_one(question)
    hits = search(INVESTIGATIONS_COLLECTION, vector, top_k=1)
    if not hits:
        return None
    best = hits[0]
    if best["score"] < _CACHE_SCORE:
        return None
    return best["payload"]["inv_id"], best["score"]


# ── Search ────────────────────────────────────────────────────────────────────

def search_prior_investigations(question: str, top_k: int = 3) -> list[str]:
    """
    Return formatted summaries of past investigations relevant to the current question.
    Returns an empty list if none found, score too low, or Qdrant is unavailable.
    """
    if not _ENABLED:
        return []
    try:
        return _search(question, top_k)
    except Exception:
        return []


def _search(question: str, top_k: int) -> list[str]:
    from hermes.semantic.embedder import embed_one
    from hermes.semantic.vector_store import search

    vector = embed_one(question)
    hits = search(INVESTIGATIONS_COLLECTION, vector, top_k=top_k)

    results: list[str] = []
    for hit in hits:
        if hit["score"] < _MIN_SCORE:
            continue
        p = hit["payload"]
        findings_lines = "\n".join(f"  - {f}" for f in p.get("key_findings") or [])
        summary = f"Q: {p['question']}\nConclusion: {p['headline']}"
        if findings_lines:
            summary += f"\nKey findings:\n{findings_lines}"
        results.append(summary)

    return results
