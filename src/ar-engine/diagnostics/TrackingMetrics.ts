import type { PoseFrame } from '../contracts';

export interface TrackingMetricsSnapshot {
  inferenceMs: number;
  resultsPerSecond: number;
  droppedFrames: number;
}

export class TrackingMetrics {
  private inferenceMs = 0;
  private resultCount = 0;
  private windowStartedMs = performance.now();
  private resultsPerSecond = 0;
  private droppedFrames = 0;
  recordResult(frame: PoseFrame): TrackingMetricsSnapshot {
    this.inferenceMs = frame.inferenceMs;
    this.resultCount += 1;
    const elapsed = performance.now() - this.windowStartedMs;
    if (elapsed >= 1000) {
      this.resultsPerSecond = (this.resultCount * 1000) / elapsed;
      this.resultCount = 0;
      this.windowStartedMs = performance.now();
    }
    return this.snapshot();
  }
  recordDrop(): void {
    this.droppedFrames += 1;
  }
  snapshot(): TrackingMetricsSnapshot {
    return {
      inferenceMs: this.inferenceMs,
      resultsPerSecond: this.resultsPerSecond,
      droppedFrames: this.droppedFrames,
    };
  }
}
