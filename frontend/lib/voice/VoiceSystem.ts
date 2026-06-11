"use client";
/**
 * VoiceSystem — wake word ("rezaa" / "hey rezaa") via the Web Speech API,
 * speech-to-text capture, and TTS responses synced with the core state.
 */

type SR = typeof window extends never ? never : any;

export interface VoiceCallbacks {
  onWake: () => void;
  onTranscript: (text: string, final: boolean) => void;
  onCommand: (text: string) => void;
  onSpeakStart: () => void;
  onSpeakEnd: () => void;
  onUnsupported: () => void;
}

export class VoiceSystem {
  private recognition: SR | null = null;
  private awake = false;
  private wakeTimeout: ReturnType<typeof setTimeout> | null = null;
  private stopped = true;

  constructor(private cb: VoiceCallbacks) {}

  get supported(): boolean {
    return (
      typeof window !== "undefined" &&
      ("SpeechRecognition" in window || "webkitSpeechRecognition" in window)
    );
  }

  start() {
    if (!this.supported) {
      this.cb.onUnsupported();
      return;
    }
    this.stopped = false;
    const Ctor =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    this.recognition = new Ctor();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = "en-US";

    this.recognition.onresult = (event: any) => {
      const result = event.results[event.results.length - 1];
      const text: string = result[0].transcript.trim();
      const final: boolean = result.isFinal;

      if (!this.awake) {
        if (/\b(hey\s+)?r+e+z+a+a*\b/i.test(text)) this.wake();
        return;
      }
      this.cb.onTranscript(text, final);
      if (final && text) {
        const cleaned = text.replace(/\b(hey\s+)?r+e+z+a+a*\b/i, "").trim();
        if (cleaned) this.cb.onCommand(cleaned);
        this.resetWakeWindow();
      }
    };
    this.recognition.onend = () => {
      if (!this.stopped) {
        try {
          this.recognition.start(); // keep listening forever
        } catch { /* already started */ }
      }
    };
    try {
      this.recognition.start();
    } catch { /* double start */ }
  }

  wake() {
    this.awake = true;
    this.cb.onWake();
    this.resetWakeWindow();
  }

  private resetWakeWindow() {
    if (this.wakeTimeout) clearTimeout(this.wakeTimeout);
    this.wakeTimeout = setTimeout(() => (this.awake = false), 12000);
  }

  private queue = 0;
  private speaking = false;

  /** Queue a sentence chunk; speaking-state callbacks fire once per burst. */
  speakChunk(text: string) {
    if (typeof speechSynthesis === "undefined" || !text.trim()) return;
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 1.04;
    utter.pitch = 0.92;
    this.queue++;
    utter.onstart = () => {
      if (!this.speaking) {
        this.speaking = true;
        this.cb.onSpeakStart();
      }
    };
    const release = () => {
      this.queue = Math.max(0, this.queue - 1);
      if (this.queue === 0 && this.speaking) {
        this.speaking = false;
        this.cb.onSpeakEnd();
      }
    };
    utter.onend = release;
    utter.onerror = release;
    speechSynthesis.speak(utter);
  }

  stopSpeaking() {
    if (typeof speechSynthesis === "undefined") return;
    speechSynthesis.cancel();
    this.queue = 0;
    if (this.speaking) {
      this.speaking = false;
      this.cb.onSpeakEnd();
    }
  }

  speak(text: string) {
    this.stopSpeaking();
    this.speakChunk(text);
  }

  stop() {
    this.stopped = true;
    this.recognition?.stop();
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
  }
}
