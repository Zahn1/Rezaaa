"""REZAA backend — FastAPI application."""
from __future__ import annotations

import json
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from . import config
from .agents.coordinator import Coordinator
from .automation.engine import AutomationEngine
from .memory.engine import VectorMemory
from .security.audit import AuditLogger
from .security.permissions import PermissionDenied, PermissionGate

app = FastAPI(title="REZAA Core", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

audit = AuditLogger(config.AUDIT_LOG_PATH)
gate = PermissionGate(audit)
memory = VectorMemory()
coordinator = Coordinator(gate, memory)
automation = AutomationEngine(gate)

audit.log("BOOT", "rezaa-core", "OK", f"memory backend={memory.backend}")


@app.exception_handler(PermissionDenied)
async def _denied(_, exc: PermissionDenied):
    from fastapi.responses import JSONResponse

    return JSONResponse(status_code=403, content={"error": str(exc)})


# ---- models -----------------------------------------------------------------
class ChatRequest(BaseModel):
    message: str
    agent: Optional[str] = None


class MemoryAdd(BaseModel):
    text: str
    metadata: dict = {}


class AutomationRequest(BaseModel):
    action: str
    target: str


class ConfirmRequest(BaseModel):
    token: str
    answer: str


class ModeRequest(BaseModel):
    read_only: bool


# ---- chat (SSE streaming) -----------------------------------------------------
@app.post("/api/chat")
async def chat(req: ChatRequest):
    async def event_stream():
        try:
            async for event in coordinator.handle(req.message, req.agent):
                yield f"data: {json.dumps(event)}\n\n"
        except Exception as exc:  # surface errors on the stream, don't drop it
            yield f"data: {json.dumps({'type': 'error', 'error': str(exc)})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


# ---- agents -------------------------------------------------------------------
@app.get("/api/agents")
def agents():
    return {"coordinator": coordinator.name, "agents": coordinator.roster()}


# ---- memory -------------------------------------------------------------------
@app.post("/api/memory")
def memory_add(req: MemoryAdd):
    try:
        item_id = memory.add(req.text, req.metadata)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    audit.log("MEMORY_ADD", item_id, "OK", req.text[:120])
    return {"id": item_id}


@app.get("/api/memory")
def memory_list(q: Optional[str] = None):
    if q:
        return {"results": memory.query(q)}
    return {"results": memory.list_all()}


@app.delete("/api/memory/{item_id}")
def memory_delete(item_id: str):
    deleted = memory.delete(item_id)
    audit.log("MEMORY_DELETE", item_id, "OK" if deleted else "NOT_FOUND")
    return {"deleted": deleted}


# ---- automation (preview -> confirm -> execute) --------------------------------
@app.post("/api/automation/propose")
def automation_propose(req: AutomationRequest):
    return automation.propose(req.action, req.target)


@app.post("/api/automation/confirm")
def automation_confirm(req: ConfirmRequest):
    return automation.execute(req.token, req.answer)


# ---- system -------------------------------------------------------------------
@app.get("/api/system")
def system_status():
    return {
        "name": "REZAA",
        "tagline": "Intelligence Beyond Interaction",
        "read_only": gate.read_only,
        "memory_backend": memory.backend,
        "provider": coordinator.provider.name,
        "model": getattr(coordinator.provider, "model", None),
        "agents": len(coordinator.agents),
    }


@app.post("/api/system/mode")
def system_mode(req: ModeRequest):
    gate.read_only = req.read_only
    audit.log("MODE_CHANGE", "read_only", "OK", str(req.read_only))
    return {"read_only": gate.read_only}


@app.get("/api/audit")
def audit_log(limit: int = 100):
    return {"entries": audit.recent(limit)}


@app.get("/healthz")
def healthz():
    return {"ok": True}
