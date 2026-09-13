import type { PoseLandmarkerResult } from '@mediapipe/tasks-vision';
import { describe, expect, it, vi } from 'vitest';
import { PoseLandmark } from './landmark-indices';
import { poseFrameFromResult } from './PoseResultMapper';

describe('poseFrameFromResult', () => {
  it('reduces a callback-owned mask to scalar forearm samples', () => {
    const pixels = taperedVerticalMask();
    const getAsFloat32Array = vi.fn(() => pixels);
    const result = poseFrameFromResult(
      poseResult({ width: 101, height: 101, getAsFloat32Array }),
      7,
      123,
    );

    expect(getAsFloat32Array).toHaveBeenCalledOnce();
    expect(result.frameId).toBe(7);
    expect(result.forearmMaskSamples?.left?.confidence).toBe(1);
    expect(result.forearmMaskSamples?.left?.wristRadiusRatio).toBeGreaterThan(
      0.07,
    );
    expect(result.forearmMaskSamples?.right).toBeUndefined();
  });

  it('keeps landmarks usable when mask pixels are unavailable', () => {
    const result = poseFrameFromResult(
      poseResult({
        width: 101,
        height: 101,
        getAsFloat32Array: () => {
          throw new Error('readback unavailable');
        },
      }),
      1,
      0,
    );

    expect(result.landmarks).toHaveLength(23);
    expect(result.forearmMaskSamples).toBeUndefined();
  });
});

function poseResult(mask: {
  width: number;
  height: number;
  getAsFloat32Array(): Float32Array;
}): PoseLandmarkerResult {
  const landmarks = Array.from({ length: 23 }, () => ({
    x: 0,
    y: 0,
    z: 0,
    visibility: 0,
  }));
  landmarks[PoseLandmark.leftWrist] = {
    x: 0.5,
    y: 0.1,
    z: 0,
    visibility: 1,
  };
  landmarks[PoseLandmark.leftElbow] = {
    x: 0.5,
    y: 0.9,
    z: 0,
    visibility: 1,
  };
  return {
    landmarks: [landmarks],
    worldLandmarks: [landmarks],
    segmentationMasks: [mask],
  } as unknown as PoseLandmarkerResult;
}

function taperedVerticalMask(): Float32Array {
  const size = 101;
  const mask = new Float32Array(size * size);
  for (let y = 10; y <= 90; y += 1) {
    const halfWidth = 7 + ((y - 10) / 80) * 7;
    for (
      let x = Math.ceil(50 - halfWidth);
      x <= Math.floor(50 + halfWidth);
      x += 1
    ) {
      mask[y * size + x] = 1;
    }
  }
  return mask;
}
