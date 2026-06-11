"use client";
import { create } from "zustand";

export type CoreState =
  | "idle"
  | "listening"
  | "thinking"
  | "speaking"
  | "executing"
  | "alert";

export interface LogLine {
  id: number;
  time: string;
  text: string;
  kind: "user" | "rezaa" | "system";
}

interface RezaaStore {
  coreState: CoreState;
  setCoreState: (s: CoreState) => void;

  // live audio levels written by the AudioEngine (read by the 3D scene per frame)
  audio: { level: number; bands: Float32Array };

  micEnabled: boolean;
  setMicEnabled: (v: boolean) => void;

  activeAgent: string | null;
  setActiveAgent: (a: string | null) => void;

  transcript: string;
  setTranscript: (t: string) => void;

  logs: LogLine[];
  pushLog: (text: string, kind: LogLine["kind"]) => void;

  // streaming reply support: tokens append to one live log line
  streamingId: number | null;
  beginStream: () => void;
  appendStream: (text: string) => void;
  endStream: () => void;

  shockwaveAt: number; // timestamp; the scene watches this to fire a pulse
  fireShockwave: () => void;
}

let logId = 0;

export const useRezaa = create<RezaaStore>((set) => ({
  coreState: "idle",
  setCoreState: (coreState) => set({ coreState }),

  audio: { level: 0, bands: new Float32Array(32) },

  micEnabled: false,
  setMicEnabled: (micEnabled) => set({ micEnabled }),

  activeAgent: null,
  setActiveAgent: (activeAgent) => set({ activeAgent }),

  transcript: "",
  setTranscript: (transcript) => set({ transcript }),

  logs: [],
  pushLog: (text, kind) =>
    set((s) => ({
      logs: [
        ...s.logs.slice(-80),
        { id: logId++, time: new Date().toLocaleTimeString(), text, kind },
      ],
    })),

  streamingId: null,
  beginStream: () => {
    const id = logId++;
    set((s) => ({
      streamingId: id,
      logs: [
        ...s.logs.slice(-80),
        { id, time: new Date().toLocaleTimeString(), text: "", kind: "rezaa" },
      ],
    }));
  },
  appendStream: (text) =>
    set((s) =>
      s.streamingId === null
        ? s
        : {
            logs: s.logs.map((l) =>
              l.id === s.streamingId ? { ...l, text: l.text + text } : l,
            ),
          },
    ),
  endStream: () =>
    set((s) => ({
      streamingId: null,
      // drop the line entirely if nothing ever streamed
      logs: s.logs.filter((l) => l.id !== s.streamingId || l.text !== ""),
    })),

  shockwaveAt: 0,
  fireShockwave: () => set({ shockwaveAt: performance.now() }),
}));
