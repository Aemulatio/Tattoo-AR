import type { PoseTracker } from '../contracts';
import { MonotonicTimestamp } from './MonotonicTimestamp';

export interface FrameSchedulerOptions {
  onFrameDropped?(): void;
  getTargetFramesPerSecond?(): number;
}

export function startFrameScheduler(
  video: HTMLVideoElement,
  tracker: PoseTracker,
  options: FrameSchedulerOptions = {},
): () => void {
  let active = true;
  const timestamps = new MonotonicTimestamp();
  const cadenceGate = new FrameCadenceGate();
  let busy = false;

  const submitNewestFrame = async (timestampMs: number) => {
    if (!active || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA)
      return;
    const shouldSubmit = cadenceGate.shouldSubmit(
      timestampMs,
      options.getTargetFramesPerSecond?.(),
    );
    if (busy || !shouldSubmit) {
      options.onFrameDropped?.();
      return;
    }
    busy = true;
    try {
      tracker.submit(await createImageBitmap(video), timestampMs);
    } catch {
      // Frames may be unavailable during camera changes; the next frame retries.
    } finally {
      busy = false;
    }
  };

  const tick = (_now: number, _metadata?: VideoFrameCallbackMetadata) => {
    // Video mediaTime resets to zero for a newly selected camera stream.
    // MediaPipe VIDEO graphs require strictly monotonic timestamps instead.
    void submitNewestFrame(timestamps.next(performance.now()));
    if (!active) return;
    if ('requestVideoFrameCallback' in video) {
      video.requestVideoFrameCallback(tick);
    } else {
      requestAnimationFrame((now) => tick(now));
    }
  };

  if ('requestVideoFrameCallback' in video)
    video.requestVideoFrameCallback(tick);
  else requestAnimationFrame((now) => tick(now));
  return () => {
    active = false;
  };
}

export function frameIntervalMs(targetFramesPerSecond = 20): number {
  const finiteTarget = Number.isFinite(targetFramesPerSecond)
    ? targetFramesPerSecond
    : 20;
  return 1000 / Math.min(60, Math.max(1, finiteTarget));
}

export class FrameCadenceGate {
  private previousTimestampMs: number | null = null;
  private availableTimeMs = 0;

  shouldSubmit(timestampMs: number, targetFramesPerSecond = 20): boolean {
    if (!Number.isFinite(timestampMs)) return false;
    const intervalMs = frameIntervalMs(targetFramesPerSecond);
    if (
      this.previousTimestampMs === null ||
      timestampMs < this.previousTimestampMs
    ) {
      this.previousTimestampMs = timestampMs;
      this.availableTimeMs = intervalMs;
    } else {
      this.availableTimeMs = Math.min(
        intervalMs * 2,
        this.availableTimeMs + timestampMs - this.previousTimestampMs,
      );
      this.previousTimestampMs = timestampMs;
    }
    if (this.availableTimeMs + Number.EPSILON < intervalMs) return false;
    this.availableTimeMs = Math.max(0, this.availableTimeMs - intervalMs);
    return true;
  }
}
