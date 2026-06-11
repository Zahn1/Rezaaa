"""Agent base class. Each agent is permission-controlled: it declares the
capabilities it may use, and everything it does flows through the gate."""
from __future__ import annotations

from typing import AsyncIterator

from ..llm import LLMProvider, build_provider
from ..security.permissions import PermissionGate


class BaseAgent:
    name: str = "agent"
    description: str = ""
    capabilities: set[str] = set()
    system_prompt: str = "You are a helpful agent."
    keywords: tuple[str, ...] = ()

    def __init__(self, gate: PermissionGate, provider: LLMProvider | None = None):
        self.gate = gate
        self.provider = provider or build_provider()
        self.status = "idle"

    async def run(self, task: str, context: str = "") -> AsyncIterator[str]:
        self.status = "running"
        self.gate.audit.log("AGENT_RUN", self.name, "OK", task[:120])
        system = (
            f"You are {self.name}, part of REZAA, a personal AI operating system. "
            f"{self.system_prompt}\n"
            "Safety rules: never request or reveal passwords, keychain data, "
            "banking data, or system credentials. Destructive actions must be "
            "proposed as previews, never executed directly."
        )
        messages: list[dict] = []
        if context:
            messages.append({"role": "user", "content": f"<context>\n{context}\n</context>"})
            messages.append({"role": "assistant", "content": "Context noted."})
        messages.append({"role": "user", "content": task})
        try:
            async for chunk in self.provider.stream(system, messages):
                yield chunk
        finally:
            self.status = "idle"

    def info(self) -> dict:
        return {
            "name": self.name,
            "description": self.description,
            "capabilities": sorted(self.capabilities),
            "status": self.status,
        }
