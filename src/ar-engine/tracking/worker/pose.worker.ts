import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import { poseFrameFromResult } from '../PoseResultMapper';
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
        outputSegmentationMasks: true,
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
      detector.detectForVideo(request.bitmap, request.timestampMs, (result) => {
        const frame = poseFrameFromResult(
          result,
          ++frameId,
          request.timestampMs,
        );
        frame.inferenceMs = performance.now() - started;
        const transfer = frame.bodyMask
          ? [frame.bodyMask.data.buffer as ArrayBuffer]
          : [];
        post({ type: 'pose', frame }, transfer);
      });
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

function post(message: WorkerResponse, transfer: Transferable[] = []): void {
  const workerScope = self as unknown as {
    postMessage(value: WorkerResponse, transfer: Transferable[]): void;
  };
  workerScope.postMessage(message, transfer);
}
