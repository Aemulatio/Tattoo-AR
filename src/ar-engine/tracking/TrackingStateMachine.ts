export type PoseTrackingState = 'acquiring' | 'tracking' | 'trackingLost';

export interface TrackingStateMachineOptions {
  goodThreshold: number;
  badThreshold: number;
  goodFramesToTrack: number;
  badFramesToLose: number;
  goodFramesToRecover: number;
  recoveryTimeoutMs: number;
}

const defaultOptions: TrackingStateMachineOptions = {
  goodThreshold: 0.62,
  badThreshold: 0.35,
  goodFramesToTrack: 4,
  badFramesToLose: 3,
  goodFramesToRecover: 3,
  recoveryTimeoutMs: 1800,
};

export class TrackingStateMachine {
  private readonly options: TrackingStateMachineOptions;
  private currentState: PoseTrackingState = 'acquiring';
  private consecutiveGoodFrames = 0;
  private consecutiveBadFrames = 0;
  private lostAtMs: number | null = null;

  constructor(options: Partial<TrackingStateMachineOptions> = {}) {
    this.options = { ...defaultOptions, ...options };
    if (this.options.badThreshold >= this.options.goodThreshold) {
      throw new Error('Tracking badThreshold must be lower than goodThreshold');
    }
  }

  get state(): PoseTrackingState {
    return this.currentState;
  }

  get lostSinceMs(): number | null {
    return this.lostAtMs;
  }

  update(confidence: number, timestampMs: number): PoseTrackingState {
    if (
      this.currentState === 'trackingLost' &&
      this.lostAtMs !== null &&
      timestampMs - this.lostAtMs >= this.options.recoveryTimeoutMs
    ) {
      this.transitionTo('acquiring');
      return this.currentState;
    }

    if (this.currentState === 'acquiring') {
      this.consecutiveGoodFrames =
        confidence >= this.options.goodThreshold
          ? this.consecutiveGoodFrames + 1
          : 0;
      if (this.consecutiveGoodFrames >= this.options.goodFramesToTrack) {
        this.transitionTo('tracking');
      }
      return this.currentState;
    }

    if (this.currentState === 'tracking') {
      this.consecutiveBadFrames =
        confidence <= this.options.badThreshold
          ? this.consecutiveBadFrames + 1
          : 0;
      if (this.consecutiveBadFrames >= this.options.badFramesToLose) {
        this.transitionTo('trackingLost', timestampMs);
      }
      return this.currentState;
    }

    this.consecutiveGoodFrames =
      confidence >= this.options.goodThreshold
        ? this.consecutiveGoodFrames + 1
        : 0;
    if (this.consecutiveGoodFrames >= this.options.goodFramesToRecover) {
      this.transitionTo('tracking');
    }
    return this.currentState;
  }

  reset(): void {
    this.currentState = 'acquiring';
    this.consecutiveGoodFrames = 0;
    this.consecutiveBadFrames = 0;
    this.lostAtMs = null;
  }

  private transitionTo(
    state: PoseTrackingState,
    timestampMs: number | null = null,
  ): void {
    this.currentState = state;
    this.consecutiveGoodFrames = 0;
    this.consecutiveBadFrames = 0;
    this.lostAtMs = state === 'trackingLost' ? timestampMs : null;
  }
}
