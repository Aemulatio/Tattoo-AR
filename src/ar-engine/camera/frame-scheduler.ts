import type { PoseTracker } from '../contracts';

export function startFrameScheduler(
  video: HTMLVideoElement,
  tracker: PoseTracker,
): () => void {
  let active = true;
  let busy = false;
  let lastTimestamp = 0;
  const minIntervalMs = 1000 / 20;

  const submitNewestFrame = async (timestampMs: number) => {
    if (
      !active ||
      busy ||
      timestampMs - lastTimestamp < minIntervalMs ||
      video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
    )
      return;
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

  const tick = (_now: number, metadata?: VideoFrameCallbackMetadata) => {
    void submitNewestFrame(
      metadata?.mediaTime ? metadata.mediaTime * 1000 : performance.now(),
    );
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
