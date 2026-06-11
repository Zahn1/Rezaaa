"use client";
/**
 * ClapDetector — counts sharp amplitude transients within a window.
 *   1 clap  -> wake
 *   2 claps -> voice mode
 *   3 claps -> command mode (restricted)
 */
export class ClapDetector {
  private lastPeakAt = 0;
  private count = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  /** raw spike threshold (0..1) and minimum gap between peaks */
  threshold = 0.55;
  minGapMs = 120;
  windowMs = 900;

  onClaps?: (count: number) => void;
  onPeak?: () => void; // fired per clap, for instant shockwave feedback

  feed(raw: number) {
    const now = performance.now();
    if (raw < this.threshold || now - this.lastPeakAt < this.minGapMs) return;
    this.lastPeakAt = now;
    this.count++;
    this.onPeak?.();
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      const n = Math.min(this.count, 3);
      this.count = 0;
      this.onClaps?.(n);
    }, this.windowMs);
  }
}
