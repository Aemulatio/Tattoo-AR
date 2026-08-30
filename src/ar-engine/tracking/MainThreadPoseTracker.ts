import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import type {
  PoseFrame,
  PosePoint,
  PoseTracker,
  TrackerConfig,
} from '../contracts';

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
      outputSegmentationMasks: false,
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
      const result = detector.detectForVideo(bitmap, timestampMs);
      const image = result.landmarks[0] ?? [];
      const world = result.worldLandmarks[0] ?? [];
      const landmarks: PosePoint[] = image.map((point, index) => ({
        image: { x: point.x, y: point.y, z: point.z },
        world: {
          x: world[index]?.x ?? 0,
          y: world[index]?.y ?? 0,
          z: world[index]?.z ?? 0,
        },
        visibility: point.visibility ?? 0,
      }));
      const frame: PoseFrame = {
        frameId: ++this.frameId,
        timestampMs,
        landmarks,
        inferenceMs: performance.now() - start,
      };
      this.listeners.forEach((listener) => listener(frame));
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
