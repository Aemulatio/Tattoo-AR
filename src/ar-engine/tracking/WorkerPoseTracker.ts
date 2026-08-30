import type { PoseFrame, PoseTracker, TrackerConfig } from '../contracts';
import type { WorkerRequest, WorkerResponse } from './worker/messages';

export class WorkerPoseTracker implements PoseTracker {
  private readonly worker = new Worker(
    new URL('./worker/pose.worker.ts', import.meta.url),
    { type: 'module' },
  );
  private readonly listeners = new Set<(frame: PoseFrame) => void>();
  private pending: { bitmap: ImageBitmap; timestampMs: number } | null = null;
  private busy = false;
  private ready: Promise<void> | null = null;

  constructor() {
    this.worker.addEventListener('message', this.onMessage);
  }

  initialize(config: TrackerConfig): Promise<void> {
    if (this.ready) return this.ready;
    this.ready = new Promise((resolve, reject) => {
      const onReady = (event: MessageEvent<WorkerResponse>) => {
        if (event.data.type === 'ready') {
          this.worker.removeEventListener('message', onReady);
          resolve();
        }
        if (event.data.type === 'error') {
          this.worker.removeEventListener('message', onReady);
          reject(new Error(event.data.message));
        }
      };
      this.worker.addEventListener('message', onReady);
      this.send({ type: 'initialize', config });
    });
    return this.ready;
  }

  submit(bitmap: ImageBitmap, timestampMs: number): void {
    if (this.busy) {
      this.pending?.bitmap.close();
      this.pending = { bitmap, timestampMs };
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
    this.pending?.bitmap.close();
    this.pending = null;
    this.worker.removeEventListener('message', this.onMessage);
    this.worker.terminate();
    this.listeners.clear();
  }

  private readonly onMessage = (event: MessageEvent<WorkerResponse>) => {
    const message = event.data;
    if (message.type === 'pose')
      this.listeners.forEach((listener) => listener(message.frame));
    if (message.type === 'error')
      console.error(`Pose worker: ${message.message}`);
    if (message.type === 'pose' || message.type === 'error') {
      this.busy = false;
      const next = this.pending;
      this.pending = null;
      if (next) this.submit(next.bitmap, next.timestampMs);
    }
  };

  private send(message: WorkerRequest, transfer: Transferable[] = []): void {
    this.worker.postMessage(message, transfer);
  }
}
