import type { PoseFrame, PoseTracker, TrackerConfig } from '../contracts';

export type PoseTrackerExecutionMode = 'worker' | 'main-thread';

export class FallbackPoseTracker implements PoseTracker {
  private readonly listeners = new Set<(frame: PoseFrame) => void>();
  private activeTracker: PoseTracker | null = null;
  private candidateTracker: PoseTracker | null = null;
  private activeUnsubscribe: () => void = () => {};
  private ready: Promise<void> | null = null;
  private disposed = false;
  private selectedMode: PoseTrackerExecutionMode | null = null;
  private workerFailure: unknown = null;
  private readonly createWorkerTracker: (() => PoseTracker) | null;
  private readonly createMainThreadTracker: () => PoseTracker;

  constructor(
    createWorkerTracker: (() => PoseTracker) | null,
    createMainThreadTracker: () => PoseTracker,
  ) {
    this.createWorkerTracker = createWorkerTracker;
    this.createMainThreadTracker = createMainThreadTracker;
  }

  get executionMode(): PoseTrackerExecutionMode | null {
    return this.selectedMode;
  }

  get fallbackReason(): unknown {
    return this.workerFailure;
  }

  initialize(config: TrackerConfig): Promise<void> {
    if (this.disposed) {
      return Promise.reject(new Error('Pose tracker has been disposed'));
    }
    this.ready ??= this.initializeWithFallback(config);
    return this.ready;
  }

  submit(frame: ImageBitmap, timestampMs: number): void {
    if (!this.activeTracker) {
      frame.close();
      return;
    }
    this.activeTracker.submit(frame, timestampMs);
  }

  subscribe(listener: (frame: PoseFrame) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.activeUnsubscribe();
    this.listeners.clear();

    const tracker = this.activeTracker ?? this.candidateTracker;
    this.activeTracker = null;
    this.candidateTracker = null;
    if (tracker) await tracker.dispose();
  }

  private async initializeWithFallback(config: TrackerConfig): Promise<void> {
    if (this.createWorkerTracker) {
      let workerTracker: PoseTracker | null = null;
      try {
        workerTracker = this.createWorkerTracker();
        this.candidateTracker = workerTracker;
        await workerTracker.initialize(config);
        this.ensureNotDisposed();
        this.activate(workerTracker, 'worker');
        return;
      } catch (error) {
        this.workerFailure = error;
        if (workerTracker && !this.disposed)
          await disposeQuietly(workerTracker);
        this.candidateTracker = null;
        this.ensureNotDisposed();
      }
    }

    let fallbackTracker: PoseTracker | null = null;
    try {
      fallbackTracker = this.createMainThreadTracker();
      this.candidateTracker = fallbackTracker;
      await fallbackTracker.initialize(config);
      this.ensureNotDisposed();
      this.activate(fallbackTracker, 'main-thread');
    } catch (error) {
      if (fallbackTracker && !this.disposed)
        await disposeQuietly(fallbackTracker);
      this.candidateTracker = null;
      this.ensureNotDisposed();
      throw this.withWorkerFailure(error);
    }
  }

  private activate(tracker: PoseTracker, mode: PoseTrackerExecutionMode): void {
    this.candidateTracker = null;
    this.activeTracker = tracker;
    this.selectedMode = mode;
    this.activeUnsubscribe = tracker.subscribe((frame) => {
      this.listeners.forEach((listener) => listener(frame));
    });
  }

  private ensureNotDisposed(): void {
    if (this.disposed) throw new Error('Pose tracker has been disposed');
  }

  private withWorkerFailure(fallbackError: unknown): Error {
    if (!this.workerFailure) return asError(fallbackError);
    return new Error(
      `Worker tracker failed (${errorMessage(this.workerFailure)}); main-thread fallback failed (${errorMessage(fallbackError)})`,
      { cause: fallbackError },
    );
  }
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(errorMessage(error));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function disposeQuietly(tracker: PoseTracker): Promise<void> {
  try {
    await tracker.dispose();
  } catch {
    // Initialization errors are more actionable than secondary cleanup errors.
  }
}
