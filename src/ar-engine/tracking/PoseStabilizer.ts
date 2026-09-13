import type { BodySide, PoseFrame } from '../contracts';
import {
  PoseSmoother,
  type PoseSmootherOptions,
} from '../filtering/PoseSmoother';
import {
  evaluatePoseConfidence,
  type PoseConfidence,
  type PoseConfidenceOptions,
} from './confidence';
import {
  TrackingStateMachine,
  type PoseTrackingState,
  type TrackingStateMachineOptions,
} from './TrackingStateMachine';

export interface StabilizedPose {
  frame: PoseFrame | null;
  confidence: PoseConfidence;
  state: PoseTrackingState;
  opacity: number;
}

export interface PoseStabilizerOptions {
  smoother?: Partial<PoseSmootherOptions>;
  confidence?: Partial<PoseConfidenceOptions>;
  stateMachine?: Partial<TrackingStateMachineOptions>;
  sideLockThreshold?: number;
  usableConfidence?: number;
  lostFadeDurationMs?: number;
  selectedSide?: BodySide | null;
}

export class PoseStabilizer {
  private readonly smoother: PoseSmoother;
  private readonly stateMachine: TrackingStateMachine;
  private readonly confidenceOptions: Partial<PoseConfidenceOptions>;
  private readonly sideLockThreshold: number;
  private readonly usableConfidence: number;
  private readonly lostFadeDurationMs: number;
  private selectedSide: BodySide | null = null;
  private lastStableFrame: PoseFrame | null = null;

  constructor(options: PoseStabilizerOptions = {}) {
    this.smoother = new PoseSmoother(options.smoother);
    this.stateMachine = new TrackingStateMachine(options.stateMachine);
    this.confidenceOptions = options.confidence ?? {};
    this.sideLockThreshold = options.sideLockThreshold ?? 0.62;
    this.usableConfidence = options.usableConfidence ?? 0.35;
    this.lostFadeDurationMs = options.lostFadeDurationMs ?? 900;
    this.selectedSide = options.selectedSide ?? null;
  }

  get side(): BodySide | null {
    return this.selectedSide;
  }

  selectSide(side: BodySide): void {
    if (side === this.selectedSide) return;
    this.selectedSide = side;
    this.resetTracking();
  }

  process(frame: PoseFrame, nowMs: number): StabilizedPose {
    let confidence = evaluatePoseConfidence(
      frame,
      nowMs,
      this.selectedSide,
      this.confidenceOptions,
    );
    if (
      this.selectedSide === null &&
      confidence.side !== null &&
      confidence.value >= this.sideLockThreshold
    ) {
      this.selectedSide = confidence.side;
      confidence = evaluatePoseConfidence(
        frame,
        nowMs,
        this.selectedSide,
        this.confidenceOptions,
      );
    }

    const state = this.stateMachine.update(confidence.value, nowMs);
    const candidate =
      confidence.value > this.usableConfidence
        ? this.smoother.smooth(frame)
        : null;

    if (state === 'tracking') {
      if (candidate) this.lastStableFrame = candidate;
      return {
        frame: this.lastStableFrame,
        confidence,
        state,
        opacity: this.lastStableFrame ? 1 : 0,
      };
    }

    if (state === 'trackingLost') {
      const lostAtMs = this.stateMachine.lostSinceMs ?? nowMs;
      const opacity = clamp01(1 - (nowMs - lostAtMs) / this.lostFadeDurationMs);
      return {
        frame: this.lastStableFrame,
        confidence,
        state,
        opacity: this.lastStableFrame ? opacity : 0,
      };
    }

    return {
      frame: candidate,
      confidence,
      state,
      opacity: candidate ? clamp01(confidence.value) : 0,
    };
  }

  reset(): void {
    this.resetTracking();
  }

  private resetTracking(): void {
    this.smoother.reset();
    this.stateMachine.reset();
    this.lastStableFrame = null;
  }
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
