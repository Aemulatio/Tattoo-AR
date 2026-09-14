import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import type {
  InferenceDelegate,
  PoseFrame,
  PoseTracker,
  TrackerConfig,
} from '../contracts';
import { initializeWithInferenceDelegate } from './InferenceDelegate';
import { poseFrameFromResult } from './PoseResultMapper';

export class MainThreadPoseTracker implements PoseTracker {
  private detector: PoseLandmarker | null = null;
  private readonly listeners = new Set<(frame: PoseFrame) => void>();
  private frameId = 0;
  private selectedDelegate: InferenceDelegate | null = null;

  get inferenceDelegate(): InferenceDelegate | null {
    return this.selectedDelegate;
  }

  async initialize(config: TrackerConfig): Promise<void> {
    if (this.detector) return;
    const fileset = await FilesetResolver.forVisionTasks(config.wasmRoot);
    const selection = await initializeWithInferenceDelegate(
      config.delegatePreference ?? 'GPU',
      (delegate) =>
        PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: config.modelAssetPath, delegate },
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: 0.55,
          minPosePresenceConfidence: 0.55,
          minTrackingConfidence: 0.5,
          outputSegmentationMasks: true,
        }),
    );
    this.detector = selection.instance;
    this.selectedDelegate = selection.delegate;
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
        try {
          const frame = poseFrameFromResult(
            result,
            ++this.frameId,
            timestampMs,
          );
          frame.inferenceMs = performance.now() - start;
          this.listeners.forEach((listener) => listener(frame));
        } finally {
          result.close();
        }
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
    this.selectedDelegate = null;
    this.listeners.clear();
  }
}
