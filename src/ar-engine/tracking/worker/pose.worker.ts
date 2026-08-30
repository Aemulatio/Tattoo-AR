import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import type { PoseFrame, PosePoint } from '../../contracts';
import type { WorkerRequest, WorkerResponse } from './messages';

let detector: PoseLandmarker | null = null;
let frameId = 0;

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  try {
    const request = event.data;
    if (request.type === 'initialize') {
      const fileset = await FilesetResolver.forVisionTasks(
        request.config.wasmRoot,
        true,
      );
      detector = await PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: request.config.modelAssetPath },
        runningMode: 'VIDEO',
        numPoses: 1,
        minPoseDetectionConfidence: 0.55,
        minPosePresenceConfidence: 0.55,
        minTrackingConfidence: 0.5,
      });
      post({ type: 'ready' });
      return;
    }
    if (request.type === 'dispose') {
      detector?.close();
      detector = null;
      self.close();
      return;
    }
    if (!detector)
      throw new Error('Pose worker received a frame before initialization.');
    const started = performance.now();
    try {
      const result = detector.detectForVideo(
        request.bitmap,
        request.timestampMs,
      );
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
        frameId: ++frameId,
        timestampMs: request.timestampMs,
        landmarks,
        inferenceMs: performance.now() - started,
      };
      post({ type: 'pose', frame });
    } finally {
      request.bitmap.close();
    }
  } catch (error) {
    post({
      type: 'error',
      message:
        error instanceof Error ? error.message : 'Unknown pose-worker error.',
    });
  }
};

function post(message: WorkerResponse): void {
  self.postMessage(message);
}
