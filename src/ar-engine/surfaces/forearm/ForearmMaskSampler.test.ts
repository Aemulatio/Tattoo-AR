import { describe, expect, it } from 'vitest';
import type { PosePoint } from '../../contracts';
import { PoseLandmark } from '../../tracking/landmark-indices';
import { sampleForearmMask } from './ForearmMaskSampler';

const width = 101;
const height = 101;

describe('sampleForearmMask', () => {
  it('measures tapered wrist and elbow cross-sections', () => {
    const mask = taperedVerticalMask();

    const result = sampleForearmMask(mask, width, height, landmarks(), 'left');

    expect(result).not.toBeNull();
    expect(result!.wristRadiusRatio).toBeCloseTo(0.1, 1);
    expect(result!.elbowRadiusRatio).toBeCloseTo(0.16, 1);
    expect(result!.confidence).toBe(1);
  });

  it('finds the mask when the landmark centerline is slightly offset', () => {
    const result = sampleForearmMask(
      taperedVerticalMask(),
      width,
      height,
      landmarks(0.53),
      'left',
    );

    expect(result).not.toBeNull();
    expect(result!.wristRadiusRatio).toBeGreaterThan(0.07);
  });

  it('rejects absent, truncated, and implausibly wide masks', () => {
    const empty = new Float32Array(width * height);
    const full = new Float32Array(width * height).fill(1);

    expect(
      sampleForearmMask(empty, width, height, landmarks(), 'left'),
    ).toBeNull();
    expect(
      sampleForearmMask(full, width, height, landmarks(), 'left'),
    ).toBeNull();
    expect(
      sampleForearmMask(empty, width - 1, height, landmarks(), 'left'),
    ).toBeNull();
  });

  it('requires visible landmarks from the requested side', () => {
    expect(
      sampleForearmMask(
        taperedVerticalMask(),
        width,
        height,
        landmarks(0.5, 0.1),
        'left',
      ),
    ).toBeNull();
    expect(
      sampleForearmMask(
        taperedVerticalMask(),
        width,
        height,
        landmarks(),
        'right',
      ),
    ).toBeNull();
  });
});

function taperedVerticalMask(): Float32Array {
  const mask = new Float32Array(width * height);
  for (let y = 10; y <= 90; y += 1) {
    const progress = (y - 10) / 80;
    const halfWidth = 7 + progress * 7;
    for (
      let x = Math.ceil(50 - halfWidth);
      x <= Math.floor(50 + halfWidth);
      x += 1
    ) {
      mask[y * width + x] = 1;
    }
  }
  return mask;
}

function landmarks(centerX = 0.5, visibility = 1): PosePoint[] {
  const points = Array.from({ length: 23 }, () => point(0, 0, 0));
  points[PoseLandmark.leftWrist] = point(centerX, 0.1, visibility);
  points[PoseLandmark.leftElbow] = point(centerX, 0.9, visibility);
  return points;
}

function point(x: number, y: number, visibility: number): PosePoint {
  return {
    image: { x, y, z: 0 },
    world: { x: 0, y: 0, z: 0 },
    visibility,
  };
}
