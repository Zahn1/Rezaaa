"use client";
/**
 * RezaaController — wires the subsystems together:
 * AudioEngine -> ClapDetector + scene audio uniforms
 * VoiceSystem -> wake word / STT -> coordinator chat -> TTS
 * Command bar -> same chat pipeline.
 */
import { streamChat } from "./api";
import { useRezaa } from "./state";
import { AudioEngine } from "./audio/AudioEngine";
import { ClapDetector } from "./audio/ClapDetector";
import { VoiceSystem } from "./voice/VoiceSystem";
import type { HoloScene } from "../three/HoloScene";

class RezaaController {
  audio = new AudioEngine();
  claps = new ClapDetector();
  voice: VoiceSystem | null = null;
  private scene: HoloScene | null = null;
  private busy = false;

  attachScene(scene: HoloScene) {
    this.scene = scene;
  }

  detachScene() {
    this.scene = null;
  }

  setCoreVisualState(state: Parameters<HoloScene["setState"]>[0]) {
    this.scene?.setState(state);
  }

  async enableAudio(): Promise<boolean> {
    const store = useRezaa.getState();
    const ok = await this.audio.start();
    if (!ok) {
      store.pushLog("Microphone access denied — visual mode only", "system");
      return false;
    }
    store.setMicEnabled(true);
    store.pushLog("Audio systems online", "system");

    this.audio.onFrame = (level, raw) => {
      this.scene?.setAudioLevel(level);
      this.claps.feed(raw);
    };
    this.claps.onPeak = () => {
      this.scene?.shockwave();
      useRezaa.getState().fireShockwave();
    };
    this.claps.onClaps = (n) => this.handleClaps(n);

    this.voice = new VoiceSystem({
      onWake: () => {
        useRezaa.getState().setCoreState("listening");
        useRezaa.getState().pushLog("Wake word detected", "system");
      },
      onTranscript: (text) => useRezaa.getState().setTranscript(text),
      onCommand: (text) => this.sendCommand(text, true),
      onSpeakStart: () => useRezaa.getState().setCoreState("speaking"),
      onSpeakEnd: () => useRezaa.getState().setCoreState("idle"),
      onUnsupported: () =>
        useRezaa.getState().pushLog(
          "SpeechRecognition unsupported in this browser — use Chrome, or the Wake button + typing",
          "system",
        ),
      onError: (err) => {
        const hints: Record<string, string> = {
          network: "speech service unreachable (Chrome STT needs internet)",
          "not-allowed": "microphone blocked for speech — check the address-bar mic icon",
          "service-not-allowed": "speech service disabled in this browser",
          "audio-capture": "no usable microphone found",
        };
        useRezaa.getState().pushLog(`Voice error: ${hints[err] ?? err}`, "system");
      },
      onReady: () =>
        useRezaa.getState().pushLog("Voice engine online — say “Hey Rezaa”", "system"),
    });
    this.voice.start();
    return true;
  }

  /** Manual wake — guaranteed path even if the wake word isn't caught. */
  wake() {
    if (this.voice) this.voice.wake();
    else useRezaa.getState().pushLog("Enable the mic first", "system");
  }

  private handleClaps(n: number) {
    const store = useRezaa.getState();
    if (n === 1) {
      store.pushLog("Clap x1 — wake", "system");
      this.voice?.wake();
    } else if (n === 2) {
      store.pushLog("Clap x2 — voice mode", "system");
      store.setCoreState("listening");
      this.voice?.wake();
    } else {
      store.pushLog("Clap x3 — command mode (restricted)", "system");
      store.setCoreState("executing");
      setTimeout(() => {
        if (useRezaa.getState().coreState === "executing")
          useRezaa.getState().setCoreState("idle");
      }, 2500);
    }
  }

  async sendCommand(text: string, spoken = false) {
    if (this.busy || !text.trim()) return;
    this.busy = true;
    const store = useRezaa.getState();
    store.pushLog(text, "user");
    store.setCoreState("thinking");
    this.voice?.stopSpeaking(); // a new command interrupts any ongoing reply

    let ttsBuffer = "";
    let spokeAnything = false;
    const flushSentences = (force = false) => {
      if (!spoken || !this.voice) return;
      for (;;) {
        const idx = ttsBuffer.search(/[.!?](\s|$)/);
        if (idx === -1) break;
        const sentence = ttsBuffer.slice(0, idx + 1);
        ttsBuffer = ttsBuffer.slice(idx + 1);
        this.voice.speakChunk(sentence);
        spokeAnything = true;
      }
      if (force && ttsBuffer.trim()) {
        this.voice.speakChunk(ttsBuffer);
        ttsBuffer = "";
        spokeAnything = true;
      }
    };

    store.beginStream();
    try {
      await streamChat(text, (e) => {
        if (e.type === "meta" && e.agent) {
          store.setActiveAgent(e.agent);
          store.pushLog(`Routing to agent: ${e.agent}`, "system");
        } else if (e.type === "token" && e.text) {
          useRezaa.getState().appendStream(e.text);
          ttsBuffer += e.text;
          flushSentences(); // speak each finished sentence immediately
        } else if (e.type === "error") {
          store.setCoreState("alert");
          store.pushLog(`Core error: ${e.error}`, "system");
        }
      });
    } catch {
      store.endStream();
      store.setCoreState("alert");
      store.pushLog("Backend unreachable — is the REZAA core running on :8000?", "system");
      setTimeout(() => useRezaa.getState().setCoreState("idle"), 2000);
      this.busy = false;
      return;
    }
    store.endStream();
    flushSentences(true);

    // spoken replies return to idle via onSpeakEnd; silent ones do it here
    if (!spokeAnything && useRezaa.getState().coreState === "thinking") {
      store.setCoreState("idle");
    }
    store.setActiveAgent(null);
    this.busy = false;
  }

  shutdown() {
    this.voice?.stop();
    this.audio.stop();
  }
}

export const controller = new RezaaController();
