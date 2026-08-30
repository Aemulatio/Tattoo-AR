/**
 * MediaPipe VIDEO graphs require strictly increasing timestamps. Unlike a
 * video element's mediaTime, this timeline survives camera-stream changes.
 */
export class MonotonicTimestamp {
  private lastMs = -Infinity;

  next(nowMs: number): number {
    this.lastMs = Math.max(nowMs, this.lastMs + 0.001);
    return this.lastMs;
  }
}
