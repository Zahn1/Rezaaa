"""Permission gate enforcing REZAA's safety rules.

- READ-ONLY by default: anything that mutates state needs explicit confirmation.
- Confirmation gate: destructive actions return a token; the user must POST
  the token back with answer YES within the TTL.
- System isolation: credential stores and sensitive paths are always denied.
"""
from __future__ import annotations

import secrets
import time
from dataclasses import dataclass, field
from pathlib import Path

from .. import config
from .audit import AuditLogger


class PermissionDenied(Exception):
    pass


@dataclass
class PendingAction:
    token: str
    action: str
    target: str
    preview: str
    created_at: float = field(default_factory=time.time)

    def expired(self, ttl: int) -> bool:
        return time.time() - self.created_at > ttl


class PermissionGate:
    READ_ACTIONS = {"read_file", "list_dir", "memory_query", "agent_run", "chat"}

    def __init__(self, audit: AuditLogger):
        self.audit = audit
        self.read_only = config.READ_ONLY_DEFAULT
        self._pending: dict[str, PendingAction] = {}

    # ---- isolation -------------------------------------------------------
    def check_isolation(self, target: str) -> None:
        low = target.lower()
        for pattern in config.FORBIDDEN_PATTERNS:
            if pattern.lower() in low:
                self.audit.log("ISOLATION_BLOCK", target, "DENIED", f"matched '{pattern}'")
                raise PermissionDenied(f"Access to '{target}' is forbidden (system isolation).")

    def check_read_path(self, path: str) -> Path:
        self.check_isolation(path)
        resolved = Path(path).expanduser().resolve()
        for allowed in config.ALLOWED_READ_PATHS:
            try:
                resolved.relative_to(Path(allowed).expanduser().resolve())
                return resolved
            except ValueError:
                continue
        self.audit.log("READ_BLOCK", path, "DENIED", "outside allowed paths")
        raise PermissionDenied(f"'{path}' is outside REZAA's allowed read paths.")

    # ---- confirmation gate -----------------------------------------------
    def request_action(self, action: str, target: str, preview: str) -> dict:
        """Read actions pass through; mutating actions get a confirmation token."""
        self.check_isolation(target)
        if action in self.READ_ACTIONS:
            self.audit.log(action.upper(), target, "OK", "read action auto-approved")
            return {"approved": True, "action": action, "target": target}

        token = secrets.token_urlsafe(16)
        self._pending[token] = PendingAction(token, action, target, preview)
        self.audit.log(action.upper(), target, "PENDING", "awaiting confirmation")
        return {
            "approved": False,
            "confirmation_required": True,
            "token": token,
            "prompt": f"Confirm execution: {action} -> {target} (YES/NO)",
            "preview": preview,
        }

    def confirm(self, token: str, answer: str) -> PendingAction:
        self._gc()
        pending = self._pending.pop(token, None)
        if pending is None:
            raise PermissionDenied("Unknown or expired confirmation token.")
        if answer.strip().upper() != "YES":
            self.audit.log(pending.action.upper(), pending.target, "REJECTED", "user said no")
            raise PermissionDenied("Action rejected by user.")
        if self.read_only:
            self.audit.log(pending.action.upper(), pending.target, "DENIED", "read-only mode")
            raise PermissionDenied("REZAA is in read-only mode. Disable it to execute changes.")
        self.audit.log(pending.action.upper(), pending.target, "CONFIRMED")
        return pending

    def _gc(self) -> None:
        ttl = config.CONFIRMATION_TTL_SECONDS
        for token in [t for t, p in self._pending.items() if p.expired(ttl)]:
            p = self._pending.pop(token)
            self.audit.log(p.action.upper(), p.target, "EXPIRED")
