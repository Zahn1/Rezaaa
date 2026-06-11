"""Safe-mode automation engine.

Every action follows the same lifecycle:
  propose(action) -> preview + confirmation token -> confirm(YES) -> execute

Only a small, vetted set of actions exists. File reads are limited to the
allowed-path whitelist; credential-adjacent targets are always rejected by
the permission gate before anything runs.
"""
from __future__ import annotations

import shutil
import subprocess
import sys

from ..security.permissions import PermissionDenied, PermissionGate


class AutomationEngine:
    def __init__(self, gate: PermissionGate):
        self.gate = gate

    # ---- proposals ---------------------------------------------------------
    def propose(self, action: str, target: str) -> dict:
        previews = {
            "open_app": f"Will launch application '{target}' in the foreground.",
            "browser_task": f"Will open the default browser at '{target}'. No clicks or form input.",
        }
        if action == "read_file":
            path = self.gate.check_read_path(target)
            text = path.read_text(errors="replace")[:4000]
            self.gate.audit.log("READ_FILE", str(path), "OK")
            return {"approved": True, "action": action, "target": str(path), "content": text}
        if action not in previews:
            raise PermissionDenied(f"Unknown automation action '{action}'.")
        return self.gate.request_action(action, target, previews[action])

    # ---- execution (post-confirmation) --------------------------------------
    def execute(self, token: str, answer: str) -> dict:
        pending = self.gate.confirm(token, answer)
        handler = getattr(self, f"_do_{pending.action}", None)
        if handler is None:
            raise PermissionDenied(f"No executor for '{pending.action}'.")
        result = handler(pending.target)
        self.gate.audit.log(pending.action.upper(), pending.target, "EXECUTED", str(result)[:200])
        return {"executed": True, "action": pending.action, "target": pending.target,
                "result": result}

    def _do_open_app(self, target: str) -> str:
        if sys.platform == "darwin":
            subprocess.run(["open", "-a", target], check=True, timeout=15)
            return f"Launched {target}"
        if shutil.which(target):
            subprocess.Popen([target])
            return f"Launched {target}"
        raise PermissionDenied(f"Application '{target}' not found.")

    def _do_browser_task(self, target: str) -> str:
        if not target.startswith(("http://", "https://")):
            raise PermissionDenied("Browser tasks require an http(s) URL.")
        import webbrowser

        webbrowser.open(target)
        return f"Opened {target}"
