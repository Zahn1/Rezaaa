import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health():
    assert client.get("/healthz").json() == {"ok": True}


def test_system_status():
    data = client.get("/api/system").json()
    assert data["name"] == "REZAA"
    assert data["read_only"] is True


def test_agents_listed():
    data = client.get("/api/agents").json()
    assert len(data["agents"]) == 6


def test_memory_crud():
    item = client.post("/api/memory", json={"text": "user likes cyan accents"}).json()
    results = client.get("/api/memory", params={"q": "what accent color"}).json()["results"]
    assert any(r["id"] == item["id"] for r in results)
    assert client.delete(f"/api/memory/{item['id']}").json()["deleted"] is True


def test_automation_requires_confirmation_and_read_only_blocks():
    res = client.post(
        "/api/automation/propose", json={"action": "open_app", "target": "Notes"}
    ).json()
    assert res["confirmation_required"] is True
    blocked = client.post(
        "/api/automation/confirm", json={"token": res["token"], "answer": "YES"}
    )
    assert blocked.status_code == 403  # read-only default mode


def test_isolation_blocks_sensitive_targets():
    res = client.post(
        "/api/automation/propose", json={"action": "read_file", "target": "~/.ssh/id_rsa"}
    )
    assert res.status_code == 403


def test_chat_streams_sse():
    with client.stream("POST", "/api/chat", json={"message": "hello rezaa"}) as resp:
        body = "".join(resp.iter_text())
    assert "data:" in body and '"done"' in body
