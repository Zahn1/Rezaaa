# REZAA — Intelligence Beyond Interaction

A personal AI operating system with a cinematic holographic interface: a living
3D energy core, orbital data rings, an audio-reactive particle field, voice and
clap activation, a multi-agent intelligence layer, vector memory, and a
safety-first automation engine.

REZAA is not a chatbot. It is a digital intelligence environment.

```
frontend/   Next.js + Three.js holographic UI (WebGL shaders, bloom, HUD)
backend/    FastAPI core: coordinator + 6 agents, Claude API, memory, audit
docs/       Architecture, security, production guides
```

## Quickstart

**Backend** (Python 3.11+):

```sh
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
export ANTHROPIC_API_KEY=sk-ant-...   # optional; offline echo mode without it
.venv/bin/uvicorn app.main:app --port 8000
```

**Frontend** (Node 20+):

```sh
cd frontend
npm install
npm run dev   # http://localhost:3000
```

Or everything at once: `docker compose up --build`.

### Choosing a brain

REZAA picks its intelligence provider automatically (`REZAA_PROVIDER=auto`):

1. **Claude** (cloud) — if `ANTHROPIC_API_KEY` is set. Model: `REZAA_MODEL`
   (default `claude-opus-4-8`).
2. **Ollama** (local mode) — if a server answers at `OLLAMA_HOST`
   (default `http://localhost:11434`). Model: `OLLAMA_MODEL` (default
   `llama3.2`). Fully offline, no key needed:

   ```sh
   brew install ollama
   ollama serve &
   ollama pull llama3.2
   # restart the backend — /api/system will report provider: ollama
   ```

3. **Echo** — credential-free stub so the UI always works.

Force one explicitly with `REZAA_PROVIDER=anthropic|ollama|echo`. In Docker,
the compose file points `OLLAMA_HOST` at `host.docker.internal:11434` so a
host-side Ollama is reachable from the container.

## Using REZAA

| Input | Effect |
|---|---|
| Type a command | Routed by the coordinator to the best agent, streamed back |
| “Rezaa” / “Hey Rezaa” | Voice wake → listening mode (click **Mic** once to grant audio) |
| 1 clap | Wake + 3D shockwave |
| 2 claps | Voice mode |
| 3 claps | Command mode (restricted) |

Core states are mirrored in the hologram: idle (slow glow), listening
(pulsing), thinking (turbulent, particles flow inward), speaking (rhythmic
bursts, particles expand), executing (data-flow), alert (red flicker).

## Safety model (always on)

- **Read-only default** — mutations are refused until explicitly disabled via
  `POST /api/system/mode`.
- **Confirmation gate** — every destructive action returns a preview + token;
  it only runs after the user answers `YES`.
- **Audit log** — every action is appended to `backend/data/audit.jsonl`
  (`TIME | ACTION | TARGET | STATUS`).
- **System isolation** — keychain, passwords, SSH keys, banking and credential
  paths are hard-blocked at the permission gate and in memory storage.

## Tests

```sh
cd backend && .venv/bin/pytest     # security, memory, coordinator, API
cd frontend && npm run typecheck   # strict TS over the whole UI
```

See `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, and `docs/PRODUCTION.md`.
