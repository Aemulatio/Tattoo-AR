import type { PoseFrame } from '../contracts';
import type { PoseTrackingState } from '../tracking/TrackingStateMachine';

export interface TrackingMetricsSnapshot {
  inferenceMs: number;
  resultsPerSecond: number;
  rendersPerSecond: number;
  droppedFrames: number;
  confidence: number;
  poseAgeMs: number;
  trackingState: PoseTrackingState;
}

export class TrackingMetrics {
  private inferenceMs = 0;
  private resultCount = 0;
  private resultWindowStartedMs: number;
  private resultsPerSecond = 0;
  private renderCount = 0;
  private renderWindowStartedMs: number;
  private rendersPerSecond = 0;
  private droppedFrames = 0;
  private confidence = 0;
  private poseAgeMs = 0;
  private trackingState: PoseTrackingState = 'acquiring';

  constructor(startedAtMs = performance.now()) {
    this.resultWindowStartedMs = startedAtMs;
    this.renderWindowStartedMs = startedAtMs;
  }

  recordResult(
    frame: PoseFrame,
    nowMs = performance.now(),
  ): TrackingMetricsSnapshot {
    this.inferenceMs = frame.inferenceMs;
    this.resultCount += 1;
    const elapsed = nowMs - this.resultWindowStartedMs;
    if (elapsed >= 1000) {
      this.resultsPerSecond = (this.resultCount * 1000) / elapsed;
      this.resultCount = 0;
      this.resultWindowStartedMs = nowMs;
    }
    return this.snapshot();
  }

  recordRender(nowMs = performance.now()): void {
    this.renderCount += 1;
    const elapsed = nowMs - this.renderWindowStartedMs;
    if (elapsed >= 1000) {
      this.rendersPerSecond = (this.renderCount * 1000) / elapsed;
      this.renderCount = 0;
      this.renderWindowStartedMs = nowMs;
    }
  }

  recordTracking(
    confidence: number,
    poseAgeMs: number,
    state: PoseTrackingState,
  ): void {
    this.confidence = confidence;
    this.poseAgeMs = poseAgeMs;
    this.trackingState = state;
  }

  recordDrop(): void {
    this.droppedFrames += 1;
  }

  snapshot(): TrackingMetricsSnapshot {
    return {
      inferenceMs: this.inferenceMs,
      resultsPerSecond: this.resultsPerSecond,
      rendersPerSecond: this.rendersPerSecond,
      droppedFrames: this.droppedFrames,
      confidence: this.confidence,
      poseAgeMs: this.poseAgeMs,
      trackingState: this.trackingState,
    };
  }
}
