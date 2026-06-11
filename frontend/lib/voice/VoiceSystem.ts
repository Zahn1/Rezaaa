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
  onError?: (error: string) => void;
  onReady?: () => void;
}

// Recognizers rarely transcribe "Rezaa" literally — accept close variants
// (reza, rezaa, resa, risa, rissa…) on word boundaries.
export const WAKE_RE = /\b(hey\s+|ok\s+|hi\s+)?r[aei]+[sz]+s?a+h?\b/i;

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
        this.cb.onTranscript(text, final); // show what we're hearing pre-wake too
        if (WAKE_RE.test(text)) this.wake();
        return;
      }
      this.cb.onTranscript(text, final);
      if (final && text) {
        const cleaned = text.replace(WAKE_RE, "").trim();
        if (cleaned) this.cb.onCommand(cleaned);
        this.resetWakeWindow();
      }
    };
    this.recognition.onerror = (event: any) => {
      // 'no-speech' fires constantly in quiet rooms and 'aborted' on restarts
      if (event.error !== "no-speech" && event.error !== "aborted") {
        this.cb.onError?.(event.error);
      }
    };
    this.recognition.onend = () => {
      if (!this.stopped) {
        // Chrome ends recognition after silence; restart on a tick so we
        // don't throw "already started"
        setTimeout(() => {
          if (this.stopped) return;
          try {
            this.recognition.start();
          } catch { /* already started */ }
        }, 250);
      }
    };
    try {
      this.recognition.start();
      this.cb.onReady?.();
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
