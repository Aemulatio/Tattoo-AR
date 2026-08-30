import type { PoseFrame, PoseTracker, TrackerConfig } from '../contracts';
import type { WorkerRequest, WorkerResponse } from './worker/messages';
import { LatestFrameQueue } from './LatestFrameQueue';
import { StaleResultGate } from './StaleResultGate';

export class WorkerPoseTracker implements PoseTracker {
  private readonly worker = new Worker(
    new URL('./worker/pose.worker.ts', import.meta.url),
    { type: 'module' },
  );
  private readonly listeners = new Set<(frame: PoseFrame) => void>();
  private readonly pending = new LatestFrameQueue<ImageBitmap>();
  private pendingTimestampMs = 0;
  private busy = false;
  private ready: Promise<void> | null = null;
  private cancelInitialization: ((reason: Error) => void) | null = null;
  private readonly resultGate = new StaleResultGate();

  constructor() {
    this.worker.addEventListener('message', this.onMessage);
  }

  initialize(config: TrackerConfig): Promise<void> {
    if (this.ready) return this.ready;
    this.ready = new Promise((resolve, reject) => {
      const cleanup = () => {
        this.worker.removeEventListener('message', onReady);
        this.worker.removeEventListener('error', onWorkerError);
        this.worker.removeEventListener('messageerror', onMessageError);
        this.cancelInitialization = null;
      };
      const fail = (error: Error) => {
        cleanup();
        reject(error);
      };
      this.cancelInitialization = fail;
      const onReady = (event: MessageEvent<WorkerResponse>) => {
        if (event.data.type === 'ready') {
          cleanup();
          resolve();
        }
        if (event.data.type === 'error') {
          fail(new Error(event.data.message));
        }
      };
      const onWorkerError = (event: ErrorEvent) => {
        fail(new Error(event.message || 'Pose worker failed to load'));
      };
      const onMessageError = () => {
        fail(new Error('Pose worker sent an unreadable message'));
      };
      this.worker.addEventListener('message', onReady);
      this.worker.addEventListener('error', onWorkerError);
      this.worker.addEventListener('messageerror', onMessageError);
      try {
        this.send({ type: 'initialize', config });
      } catch (error) {
        fail(
          error instanceof Error
            ? error
            : new Error('Could not initialize pose worker'),
        );
      }
    });
    return this.ready;
  }

  submit(bitmap: ImageBitmap, timestampMs: number): void {
    if (this.busy) {
      this.pending.replace(bitmap);
      this.pendingTimestampMs = timestampMs;
      return;
    }
    this.busy = true;
    this.send({ type: 'frame', bitmap, timestampMs }, [bitmap]);
  }

  subscribe(listener: (frame: PoseFrame) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async dispose(): Promise<void> {
    this.cancelInitialization?.(
      new Error('Pose worker was disposed during initialization'),
    );
    this.cancelInitialization = null;
    this.pending.clear();
    this.worker.removeEventListener('message', this.onMessage);
    this.worker.terminate();
    this.listeners.clear();
  }

  private readonly onMessage = (event: MessageEvent<WorkerResponse>) => {
    const message = event.data;
    if (
      message.type === 'pose' &&
      this.resultGate.accept(message.frame.timestampMs)
    )
      this.listeners.forEach((listener) => listener(message.frame));
    if (message.type === 'error')
      console.error(`Pose worker: ${message.message}`);
    if (message.type === 'pose' || message.type === 'error') {
      this.busy = false;
      const next = this.pending.take();
      if (next) this.submit(next, this.pendingTimestampMs);
    }
  };

  private send(message: WorkerRequest, transfer: Transferable[] = []): void {
    this.worker.postMessage(message, transfer);
  }
}
