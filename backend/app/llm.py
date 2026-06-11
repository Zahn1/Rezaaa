"""LLM provider layer.

Primary provider is the Anthropic API (Claude). When no API key is
configured, an offline echo provider keeps the whole system runnable for
development and tests.
"""
from __future__ import annotations

from typing import AsyncIterator

from . import config


class LLMProvider:
    name = "base"

    async def stream(self, system: str, messages: list[dict]) -> AsyncIterator[str]:
        raise NotImplementedError
        yield  # pragma: no cover

    async def complete(self, system: str, messages: list[dict]) -> str:
        chunks = [c async for c in self.stream(system, messages)]
        return "".join(chunks)


class AnthropicProvider(LLMProvider):
    name = "anthropic"

    def __init__(self, model: str = config.REZAA_MODEL):
        from anthropic import AsyncAnthropic

        self.client = AsyncAnthropic()
        self.model = model

    async def stream(self, system: str, messages: list[dict]) -> AsyncIterator[str]:
        async with self.client.messages.stream(
            model=self.model,
            max_tokens=16000,
            thinking={"type": "adaptive"},
            system=[{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
            messages=messages,
        ) as stream:
            async for text in stream.text_stream:
                yield text


class OllamaProvider(LLMProvider):
    """Local mode: streams from an Ollama server (no cloud, no API key)."""

    name = "ollama"

    def __init__(self, model: str = config.OLLAMA_MODEL, host: str = config.OLLAMA_HOST):
        self.model = model
        self.host = host

    async def stream(self, system: str, messages: list[dict]) -> AsyncIterator[str]:
        import json

        import httpx

        payload = {
            "model": self.model,
            "stream": True,
            "messages": [{"role": "system", "content": system}, *messages],
        }
        timeout = httpx.Timeout(300.0, connect=5.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            async with client.stream("POST", f"{self.host}/api/chat", json=payload) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if not line.strip():
                        continue
                    data = json.loads(line)
                    chunk = data.get("message", {}).get("content", "")
                    if chunk:
                        yield chunk
                    if data.get("done"):
                        break


def ollama_available(host: str = config.OLLAMA_HOST) -> bool:
    try:
        import httpx

        return httpx.get(f"{host}/api/tags", timeout=1.5).status_code == 200
    except Exception:
        return False


class EchoProvider(LLMProvider):
    """Offline fallback so REZAA boots without credentials."""

    name = "echo"

    async def stream(self, system: str, messages: list[dict]) -> AsyncIterator[str]:
        last = next(
            (m["content"] for m in reversed(messages) if m["role"] == "user"), ""
        )
        if isinstance(last, list):
            last = " ".join(b.get("text", "") for b in last if isinstance(b, dict))
        reply = (
            "[REZAA offline mode] No ANTHROPIC_API_KEY configured. "
            f"You said: {last!r}. Set the key to enable full intelligence."
        )
        for i in range(0, len(reply), 24):
            yield reply[i : i + 24]


def build_provider(model: str | None = None) -> LLMProvider:
    choice = config.REZAA_PROVIDER
    if choice == "anthropic" and config.ANTHROPIC_API_KEY:
        return AnthropicProvider(model or config.REZAA_MODEL)
    if choice == "ollama":
        return OllamaProvider(model or config.OLLAMA_MODEL)
    if choice == "echo":
        return EchoProvider()
    # auto: best available brain wins
    if config.ANTHROPIC_API_KEY:
        return AnthropicProvider(model or config.REZAA_MODEL)
    if ollama_available():
        return OllamaProvider(model or config.OLLAMA_MODEL)
    return EchoProvider()
