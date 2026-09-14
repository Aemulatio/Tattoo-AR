import { describe, expect, it } from 'vitest';
import type { PoseFrame } from '../contracts';
import { bodyMaskForSide } from './BodyMaskPolicy';

const bodyMask = {
  width: 2,
  height: 2,
  data: new Uint8Array([0, 255, 255, 0]),
};

describe('bodyMaskForSide', () => {
  it('selects a mask only for a reliable selected forearm', () => {
    const frame = poseFrame(0.8);

    expect(bodyMaskForSide(frame, 'left')).toBe(bodyMask);
    expect(bodyMaskForSide(frame, 'right')).toBeNull();
  });

  it('falls back when the mask or confidence is unavailable', () => {
    expect(bodyMaskForSide(poseFrame(0.4), 'left')).toBeNull();
    expect(
      bodyMaskForSide({ ...poseFrame(0.8), bodyMask: undefined }, 'left'),
    ).toBeNull();
  });
});

function poseFrame(confidence: number): PoseFrame {
  return {
    frameId: 1,
    timestampMs: 1,
    inferenceMs: 1,
    landmarks: [],
    bodyMask,
    forearmMaskSamples: {
      left: {
        wristRadiusRatio: 0.1,
        elbowRadiusRatio: 0.15,
        confidence,
      },
    },
  };
}
