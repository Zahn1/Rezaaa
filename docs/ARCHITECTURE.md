# REZAA System Architecture

```
┌────────────────────────── Browser ───────────────────────────┐
│  Next.js app (app/page.tsx)                                  │
│  ┌─────────────┐  ┌───────────────────────────────────────┐  │
│  │ HUD panels  │  │ HoloScene (Three.js)                  │  │
│  │ stats/agents│  │  EnergyCore  ShaderMaterial + noise   │  │
│  │ audit/comms │  │  3 OrbitalRings (additive)            │  │
│  │ command bar │  │  ParticleField 4500 pts (GPU shader)  │  │
│  └──────┬──────┘  │  Bloom → HologramPass → FXAA          │  │
│         │         └──────────────▲────────────────────────┘  │
│  ┌──────▼─────────────────────── │ ─────────────┐            │
│  │ RezaaController               │ state+audio  │            │
│  │  AudioEngine → ClapDetector ──┘ uniforms     │            │
│  │  VoiceSystem (wake word / STT / TTS)         │            │
│  └──────┬───────────────────────────────────────┘            │
└─────────┼─────────────────────────────────────────────────---┘
          │ SSE /api/chat, REST /api/*
┌─────────▼──────────────── FastAPI core ──────────────────────┐
│ Coordinator ── routes ──► research / developer / analyst /   │
│      │                    automation / planner / memory      │
│      │ RAG context        (all permission-controlled)        │
│ VectorMemory (Chroma or builtin hashing store)               │
│ PermissionGate ── read-only default, confirm tokens,         │
│      │            isolation blocklist                        │
│ AuditLogger (JSONL, append-only)                             │
│ AutomationEngine (propose → confirm → execute)               │
│ LLM layer: Anthropic Claude (streaming, adaptive thinking)   │
│            EchoProvider offline fallback                     │
└──────────────────────────────────────────────────────────────┘
```

## Core state machine

`idle → listening → thinking → speaking → idle`, with `executing` for
automations and `alert` for errors. The frontend store (`lib/state.ts`) is the
single source of truth; `HoloScene` lerps shader uniforms (glow, turbulence,
pulse rate, rotation, ring speed, particle attract/expand, bloom strength,
color) toward each state's parameter set, so transitions are always smooth.

## Shader system

- **Arc reactor glow** (`CORE_VERTEX/FRAGMENT`): simplex-noise vertex
  displacement (turbulence + audio), fresnel emission, pulsating radial
  energy, noise-based flicker.
- **Particle flow** (`PARTICLE_VERTEX/FRAGMENT`): per-particle seeds drive
  orbital motion entirely on the GPU; uniforms pull particles toward the core
  (thinking), push outward (speaking), displace by voice amplitude, and ring
  an expanding shockwave band on claps.
- **Hologram distortion** (`HOLOGRAM_PASS`): scanlines, global flicker,
  horizontal slice interference, chromatic shift, vignette.

## Audio pipeline

`getUserMedia → AnalyserNode (1024 FFT) → RMS amplitude`
→ smoothed level into shader uniforms each frame
→ raw level into `ClapDetector` (transient counting: 1/2/3 claps)
→ `VoiceSystem` (Web Speech API) handles the wake word and transcription;
`speechSynthesis` speaks replies, with start/end events driving the
speaking state.

## Backend request flow

1. `POST /api/chat` → Coordinator queries vector memory (top-4) for RAG
   context, routes by agent keywords, and streams
   `meta → token* → done` SSE events.
2. Agents call Claude (`claude-opus-4-8`, streaming, adaptive thinking,
   cached system prompt). With no API key, the EchoProvider keeps the whole
   stack functional offline.
3. Automations: `POST /api/automation/propose` returns a preview + token;
   `POST /api/automation/confirm` with `YES` executes — only if read-only
   mode is off, and never against isolation-blocked targets.

## Performance

- All particle motion is computed in the vertex shader — zero per-frame
  CPU geometry updates.
- Pixel ratio capped at 2; FXAA instead of MSAA; additive blending with
  `depthWrite: false` to avoid sorting costs.
- FPS counter surfaces in the HUD (target: 60).
- Memory queries are in-process (<1 ms builtin; Chroma local under 500 ms).
