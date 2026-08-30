import type { PoseTracker } from '../contracts';
import { MonotonicTimestamp } from './MonotonicTimestamp';

export interface FrameSchedulerOptions {
  onFrameDropped?(): void;
}

export function startFrameScheduler(
  video: HTMLVideoElement,
  tracker: PoseTracker,
  options: FrameSchedulerOptions = {},
): () => void {
  let active = true;
  const timestamps = new MonotonicTimestamp();
  let busy = false;
  let lastTimestamp = 0;
  const minIntervalMs = 1000 / 20;

  const submitNewestFrame = async (timestampMs: number) => {
    if (!active || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA)
      return;
    if (busy || timestampMs - lastTimestamp < minIntervalMs) {
      options.onFrameDropped?.();
      return;
    }
    busy = true;
    lastTimestamp = timestampMs;
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
