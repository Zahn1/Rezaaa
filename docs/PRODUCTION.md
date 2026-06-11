# REZAA Production Guide

## Deployment

```sh
ANTHROPIC_API_KEY=sk-ant-... docker compose up --build -d
```

- `rezaa-core` (FastAPI) listens on :8000 with a healthcheck on `/healthz`;
  the UI proxies `/api/*` to it, so only :3000 needs public exposure.
- Persist the `rezaa-data` volume — it holds the audit log and Chroma store.
- Put both services behind TLS (Caddy/Traefik/nginx). The mic and Web Speech
  APIs require a secure context (HTTPS or localhost).

## Scaling & reliability

- The backend is stateless apart from `data/`; run replicas behind a load
  balancer with a shared Chroma server (`chromadb` HTTP client) if needed.
- SSE streams are short-lived (one per command); no sticky sessions required.
- Set `REZAA_MODEL=claude-sonnet-4-6` for high-volume deployments where Opus
  latency/cost is unnecessary, or `claude-haiku-4-5` for the fast path.

## Performance targets & tuning

| Target | Lever |
|---|---|
| 60 FPS UI | particle count (4500 default), pixel-ratio cap, bloom strength |
| <1 s voice latency | streamed SSE tokens; TTS starts on full reply — switch to sentence-chunked TTS for lower perceived latency |
| <500 ms memory retrieval | builtin store is in-process; for Chroma keep it co-located |

## Monitoring

- `GET /api/system` — provider, mode, agent count (probe it).
- `GET /api/audit` — action stream; alert on `DENIED` spikes.
- Frontend FPS counter (bottom-right) for GPU regressions.

## Checklist before going live

- [ ] HTTPS in front of both services
- [ ] `REZAA_READ_ONLY=1` (default) until automation is reviewed
- [ ] Audit log shipped to external storage
- [ ] API key in a secrets manager
- [ ] CI green: backend pytest, frontend typecheck + build, Docker build
