import pytest

from app.agents.coordinator import Coordinator
from app.llm import EchoProvider
from app.memory.engine import VectorMemory
from app.security.audit import AuditLogger
from app.security.permissions import PermissionGate


@pytest.fixture
def coordinator(tmp_path):
    gate = PermissionGate(AuditLogger(tmp_path / "audit.jsonl"))
    return Coordinator(gate, VectorMemory(), EchoProvider())


def test_routing(coordinator):
    assert coordinator.route("debug this function for me").name == "developer"
    assert coordinator.route("research the best vector databases").name == "research"
    assert coordinator.route("plan my week with milestones").name == "planner"
    assert coordinator.route("hello there") is None


@pytest.mark.asyncio
async def test_handle_streams_events(coordinator):
    events = [e async for e in coordinator.handle("write code to sort a list")]
    assert events[0]["type"] == "meta" and events[0]["agent"] == "developer"
    assert any(e["type"] == "token" for e in events)
    assert events[-1]["type"] == "done"


def test_roster(coordinator):
    names = {a["name"] for a in coordinator.roster()}
    assert {"research", "developer", "analyst", "automation", "planner", "memory"} <= names
