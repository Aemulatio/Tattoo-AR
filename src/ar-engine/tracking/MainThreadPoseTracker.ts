import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import type { PoseFrame, PoseTracker, TrackerConfig } from '../contracts';
import { poseFrameFromResult } from './PoseResultMapper';

export class MainThreadPoseTracker implements PoseTracker {
  private detector: PoseLandmarker | null = null;
  private readonly listeners = new Set<(frame: PoseFrame) => void>();
  private frameId = 0;

  async initialize(config: TrackerConfig): Promise<void> {
    if (this.detector) return;
    const fileset = await FilesetResolver.forVisionTasks(config.wasmRoot);
    this.detector = await PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: config.modelAssetPath },
      runningMode: 'VIDEO',
      numPoses: 1,
      minPoseDetectionConfidence: 0.55,
      minPosePresenceConfidence: 0.55,
      minTrackingConfidence: 0.5,
      outputSegmentationMasks: true,
    });
  }

  submit(bitmap: ImageBitmap, timestampMs: number): void {
    const detector = this.detector;
    if (!detector) {
      bitmap.close();
      return;
    }
    const start = performance.now();
    try {
      detector.detectForVideo(bitmap, timestampMs, (result) => {
        const frame = poseFrameFromResult(result, ++this.frameId, timestampMs);
        frame.inferenceMs = performance.now() - start;
        this.listeners.forEach((listener) => listener(frame));
      });
    } finally {
      bitmap.close();
    }
  }

  subscribe(listener: (frame: PoseFrame) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async dispose(): Promise<void> {
    this.detector?.close();
    this.detector = null;
    this.listeners.clear();
  }
}
