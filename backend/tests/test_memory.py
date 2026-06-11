import pytest

from app.memory.engine import VectorMemory


@pytest.fixture
def mem():
    return VectorMemory()


def test_add_query_roundtrip(mem):
    mem.add("The user prefers dark holographic interfaces")
    mem.add("Project Apollo deadline is Friday")
    results = mem.query("what interface style does the user like?")
    assert results
    assert "holographic" in results[0]["text"]


def test_delete(mem):
    item_id = mem.add("temporary fact")
    assert mem.delete(item_id) is True


def test_sensitive_content_refused(mem):
    with pytest.raises(ValueError):
        mem.add("my banking password is hunter2")
