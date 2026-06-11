"use client";
/**
 * AudioEngine — microphone capture + spectrum analysis.
 * Feeds smoothed amplitude into the holographic scene every frame and
 * raw samples into the ClapDetector.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private data: Uint8Array<ArrayBuffer> = new Uint8Array(0);
  private raf = 0;
  private smoothed = 0;

  level = 0; // 0..1 smoothed amplitude
  onFrame?: (level: number, raw: number) => void;

  async start(): Promise<boolean> {
    if (this.ctx) return true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.ctx = new AudioContext();
      const source = this.ctx.createMediaStreamSource(stream);
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.smoothingTimeConstant = 0.5;
      source.connect(this.analyser);
      this.data = new Uint8Array(this.analyser.frequencyBinCount);
      this.loop();
      return true;
    } catch {
      return false; // mic denied — REZAA stays visual-only
    }
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    if (!this.analyser) return;
    this.analyser.getByteTimeDomainData(this.data);
    let sum = 0;
    for (let i = 0; i < this.data.length; i++) {
      const v = (this.data[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / this.data.length);
    const raw = Math.min(rms * 4, 1);
    this.smoothed += (raw - this.smoothed) * 0.18;
    this.level = this.smoothed;
    this.onFrame?.(this.smoothed, raw);
  };

  stop() {
    cancelAnimationFrame(this.raf);
    this.ctx?.close();
    this.ctx = null;
    this.analyser = null;
  }
}
