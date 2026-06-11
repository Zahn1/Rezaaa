"""Audit logging: every action REZAA takes is recorded, append-only.

Format on disk is JSONL; the classic `TIME | ACTION | TARGET | STATUS`
table view is derived from it.
"""
from __future__ import annotations

import json
import threading
from collections import deque
from datetime import datetime, timezone
from pathlib import Path


class AuditLogger:
    def __init__(self, path: Path, ring_size: int = 500):
        self.path = path
        self._lock = threading.Lock()
        self._ring: deque[dict] = deque(maxlen=ring_size)
        self._load_tail()

    def _load_tail(self) -> None:
        if not self.path.exists():
            return
        try:
            lines = self.path.read_text().splitlines()[-self._ring.maxlen :]
            for line in lines:
                if line.strip():
                    self._ring.append(json.loads(line))
        except Exception:
            pass  # a corrupt tail must never block startup

    def log(self, action: str, target: str = "-", status: str = "OK", detail: str = "") -> dict:
        entry = {
            "time": datetime.now(timezone.utc).isoformat(),
            "action": action,
            "target": target,
            "status": status,
            "detail": detail[:500],
        }
        with self._lock:
            self._ring.append(entry)
            with open(self.path, "a") as f:
                f.write(json.dumps(entry) + "\n")
        return entry

    def recent(self, limit: int = 100) -> list[dict]:
        with self._lock:
            return list(self._ring)[-limit:]

    def as_table(self, limit: int = 100) -> str:
        rows = ["TIME | ACTION | TARGET | STATUS"]
        for e in self.recent(limit):
            rows.append(f"{e['time']} | {e['action']} | {e['target']} | {e['status']}")
        return "\n".join(rows)
