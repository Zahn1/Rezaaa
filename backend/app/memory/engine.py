"""Vector memory engine.

Uses ChromaDB when installed; otherwise falls back to a dependency-free
hashing-trick vector store so REZAA works out of the box. Memory is
query-based, user-deletable, and never stores entries matching the
isolation blocklist.
"""
from __future__ import annotations

import hashlib
import math
import re
import threading
import uuid
from dataclasses import dataclass, field

from .. import config

_DIM = 512
_TOKEN = re.compile(r"[a-z0-9]+")


def _embed(text: str) -> list[float]:
    """Hashing-trick bag-of-ngrams embedding (offline fallback)."""
    vec = [0.0] * _DIM
    tokens = _TOKEN.findall(text.lower())
    grams = tokens + [" ".join(p) for p in zip(tokens, tokens[1:])]
    for g in grams:
        h = int.from_bytes(hashlib.blake2b(g.encode(), digest_size=8).digest(), "big")
        vec[h % _DIM] += 1.0 if (h >> 63) else -1.0
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / norm for v in vec]


def _cosine(a: list[float], b: list[float]) -> float:
    return sum(x * y for x, y in zip(a, b))


@dataclass
class MemoryItem:
    id: str
    text: str
    metadata: dict = field(default_factory=dict)
    vector: list[float] = field(default_factory=list)


class VectorMemory:
    def __init__(self):
        self._lock = threading.Lock()
        self._items: dict[str, MemoryItem] = {}
        self._chroma = None
        try:
            import chromadb  # type: ignore

            client = chromadb.PersistentClient(path=str(config.DATA_DIR / "chroma"))
            self._chroma = client.get_or_create_collection(config.MEMORY_COLLECTION)
        except Exception:
            self._chroma = None  # fallback store

    @property
    def backend(self) -> str:
        return "chromadb" if self._chroma is not None else "builtin"

    def _check_sensitive(self, text: str) -> None:
        low = text.lower()
        for pattern in config.FORBIDDEN_PATTERNS:
            if pattern.lower() in low:
                raise ValueError("Refusing to store sensitive content in memory.")

    def add(self, text: str, metadata: dict | None = None) -> str:
        self._check_sensitive(text)
        item_id = str(uuid.uuid4())
        metadata = metadata or {}
        if self._chroma is not None:
            self._chroma.add(ids=[item_id], documents=[text], metadatas=[metadata or {"_": "1"}])
        else:
            with self._lock:
                self._items[item_id] = MemoryItem(item_id, text, metadata, _embed(text))
        return item_id

    def query(self, text: str, n: int = config.MEMORY_MAX_RESULTS) -> list[dict]:
        if self._chroma is not None:
            res = self._chroma.query(query_texts=[text], n_results=n)
            return [
                {"id": i, "text": d, "metadata": m or {}}
                for i, d, m in zip(res["ids"][0], res["documents"][0], res["metadatas"][0])
            ]
        qv = _embed(text)
        with self._lock:
            scored = sorted(
                self._items.values(), key=lambda it: _cosine(qv, it.vector), reverse=True
            )[:n]
        return [
            {"id": it.id, "text": it.text, "metadata": it.metadata, "score": _cosine(qv, it.vector)}
            for it in scored
        ]

    def delete(self, item_id: str) -> bool:
        if self._chroma is not None:
            self._chroma.delete(ids=[item_id])
            return True
        with self._lock:
            return self._items.pop(item_id, None) is not None

    def list_all(self, limit: int = 200) -> list[dict]:
        if self._chroma is not None:
            res = self._chroma.get(limit=limit)
            return [
                {"id": i, "text": d, "metadata": m or {}}
                for i, d, m in zip(res["ids"], res["documents"], res["metadatas"])
            ]
        with self._lock:
            return [
                {"id": it.id, "text": it.text, "metadata": it.metadata}
                for it in list(self._items.values())[:limit]
            ]
