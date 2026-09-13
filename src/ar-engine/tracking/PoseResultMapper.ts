import type { PoseLandmarkerResult } from '@mediapipe/tasks-vision';
import type { ForearmMaskSample, PoseFrame, PosePoint } from '../contracts';
import { sampleForearmMask } from '../surfaces/forearm/ForearmMaskSampler';

export function poseFrameFromResult(
  result: PoseLandmarkerResult,
  frameId: number,
  timestampMs: number,
): PoseFrame {
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
  const forearmMaskSamples = readForearmMask(result, landmarks);

  return {
    frameId,
    timestampMs,
    landmarks,
    inferenceMs: 0,
    ...(forearmMaskSamples ? { forearmMaskSamples } : {}),
  };
}

function readForearmMask(
  result: PoseLandmarkerResult,
  landmarks: ReadonlyArray<PosePoint>,
): Partial<Record<'left' | 'right', ForearmMaskSample>> | null {
  const mask = result.segmentationMasks?.[0];
  if (!mask) return null;

  try {
    const pixels = mask.getAsFloat32Array();
    const left = sampleForearmMask(
      pixels,
      mask.width,
      mask.height,
      landmarks,
      'left',
    );
    const right = sampleForearmMask(
      pixels,
      mask.width,
      mask.height,
      landmarks,
      'right',
    );
    if (!left && !right) return null;
    return {
      ...(left ? { left } : {}),
      ...(right ? { right } : {}),
    };
  } catch {
    // Landmarks remain usable when a browser cannot expose mask pixels.
    return null;
  }
}
