"""REZAA core coordinator: routes a task to the best agent and streams the
response, enriching the prompt with relevant memories (RAG)."""
from __future__ import annotations

from typing import AsyncIterator

from ..llm import LLMProvider, build_provider
from ..memory.engine import VectorMemory
from ..security.permissions import PermissionGate
from .base import BaseAgent
from .registry import AGENT_CLASSES


class Coordinator:
    name = "rezaa-core"

    def __init__(self, gate: PermissionGate, memory: VectorMemory,
                 provider: LLMProvider | None = None):
        self.gate = gate
        self.memory = memory
        self.provider = provider or build_provider()
        self.agents: dict[str, BaseAgent] = {
            cls.name: cls(gate, self.provider) for cls in AGENT_CLASSES
        }

    def route(self, task: str) -> BaseAgent | None:
        """Keyword routing; falls back to the coordinator itself (None)."""
        low = task.lower()
        best, best_score = None, 0
        for agent in self.agents.values():
            score = sum(1 for kw in agent.keywords if kw in low)
            if score > best_score:
                best, best_score = agent, score
        return best

    async def handle(self, task: str, agent_name: str | None = None) -> AsyncIterator[dict]:
        """Yields {'type': 'meta'|'token'|'done', ...} events."""
        agent = self.agents.get(agent_name) if agent_name else self.route(task)
        memories = self.memory.query(task, n=4)
        context = "\n".join(f"- {m['text']}" for m in memories) if memories else ""

        yield {"type": "meta", "agent": agent.name if agent else self.name,
               "memories_used": len(memories)}

        if agent is not None:
            async for chunk in agent.run(task, context):
                yield {"type": "token", "text": chunk}
        else:
            self.gate.audit.log("CHAT", self.name, "OK", task[:120])
            system = (
                "You are REZAA, a personal AI operating system with the tagline "
                "'Intelligence Beyond Interaction'. You are concise, calm, and precise — "
                "a mission-control intelligence, not a chatbot. "
                "Never request or reveal passwords, keychain data, banking data, or "
                "system credentials. Destructive actions require explicit user confirmation."
            )
            messages: list[dict] = []
            if context:
                messages.append({"role": "user",
                                 "content": f"<relevant_memories>\n{context}\n</relevant_memories>"})
                messages.append({"role": "assistant", "content": "Memories loaded."})
            messages.append({"role": "user", "content": task})
            async for chunk in self.provider.stream(system, messages):
                yield {"type": "token", "text": chunk}

        yield {"type": "done"}

    def roster(self) -> list[dict]:
        return [a.info() for a in self.agents.values()]
