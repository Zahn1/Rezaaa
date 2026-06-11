import pytest

from app.security.audit import AuditLogger
from app.security.permissions import PermissionDenied, PermissionGate


@pytest.fixture
def gate(tmp_path):
    return PermissionGate(AuditLogger(tmp_path / "audit.jsonl"))


def test_isolation_blocks_credentials(gate):
    for target in ["~/Library/Keychains", "/etc/passwd", "my passwords.txt", "~/.ssh/id_rsa"]:
        with pytest.raises(PermissionDenied):
            gate.check_isolation(target)


def test_read_actions_auto_approved(gate):
    res = gate.request_action("memory_query", "weather", "")
    assert res["approved"] is True


def test_mutating_action_requires_confirmation(gate):
    res = gate.request_action("open_app", "Notes", "Will launch Notes")
    assert res["approved"] is False
    assert "token" in res and "YES/NO" in res["prompt"]


def test_confirmation_no_rejects(gate):
    res = gate.request_action("open_app", "Notes", "preview")
    with pytest.raises(PermissionDenied):
        gate.confirm(res["token"], "NO")


def test_read_only_mode_blocks_even_confirmed_actions(gate):
    gate.read_only = True
    res = gate.request_action("open_app", "Notes", "preview")
    with pytest.raises(PermissionDenied, match="read-only"):
        gate.confirm(res["token"], "YES")


def test_confirmed_action_passes_when_writable(gate):
    gate.read_only = False
    res = gate.request_action("open_app", "Notes", "preview")
    pending = gate.confirm(res["token"], "YES")
    assert pending.action == "open_app" and pending.target == "Notes"


def test_unknown_token_rejected(gate):
    with pytest.raises(PermissionDenied):
        gate.confirm("bogus", "YES")


def test_audit_table_format(gate):
    gate.audit.log("TEST", "target", "OK")
    table = gate.audit.as_table()
    assert table.splitlines()[0] == "TIME | ACTION | TARGET | STATUS"
    assert "TEST | target | OK" in table
