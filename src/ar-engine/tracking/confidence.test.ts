import { describe, expect, it } from 'vitest';
import type { PoseFrame, PosePoint } from '../contracts';
import { PoseLandmark } from './landmark-indices';
import { evaluatePoseConfidence } from './confidence';

describe('evaluatePoseConfidence', () => {
  it('chooses the arm with stronger landmark visibility', () => {
    const frame = poseFrame(100, 0.2, 0.9);

    const confidence = evaluatePoseConfidence(frame, 100);

    expect(confidence.side).toBe('right');
    expect(confidence.visibility).toBeCloseTo(0.9);
    expect(confidence.value).toBeCloseTo(0.9);
  });

  it('keeps evaluating a locked side instead of switching arms', () => {
    const frame = poseFrame(100, 0.2, 0.9);

    const confidence = evaluatePoseConfidence(frame, 100, 'left');

    expect(confidence.side).toBe('left');
    expect(confidence.visibility).toBeCloseTo(0.2);
  });

  it('reduces confidence as the pose result ages', () => {
    const frame = poseFrame(100, 1, 0);

    expect(evaluatePoseConfidence(frame, 100).value).toBe(1);
    expect(evaluatePoseConfidence(frame, 350).value).toBeCloseTo(0.5);
    expect(evaluatePoseConfidence(frame, 600).value).toBe(0);
  });

  it('reports no side for an empty pose', () => {
    const frame: PoseFrame = {
      frameId: 1,
      timestampMs: 100,
      landmarks: [],
      inferenceMs: 5,
    };

    expect(evaluatePoseConfidence(frame, 100)).toMatchObject({
      side: null,
      visibility: 0,
      value: 0,
    });
  });
});

function poseFrame(
  timestampMs: number,
  leftVisibility: number,
  rightVisibility: number,
): PoseFrame {
  const landmarks = Array.from({ length: 23 }, () => point(0));
  for (const index of [
    PoseLandmark.leftShoulder,
    PoseLandmark.leftElbow,
    PoseLandmark.leftWrist,
    PoseLandmark.leftThumb,
    PoseLandmark.leftIndex,
    PoseLandmark.leftPinky,
  ]) {
    landmarks[index] = point(leftVisibility);
  }
  for (const index of [
    PoseLandmark.rightShoulder,
    PoseLandmark.rightElbow,
    PoseLandmark.rightWrist,
    PoseLandmark.rightThumb,
    PoseLandmark.rightIndex,
    PoseLandmark.rightPinky,
  ]) {
    landmarks[index] = point(rightVisibility);
  }
  return { frameId: 1, timestampMs, landmarks, inferenceMs: 5 };
}

function point(visibility: number): PosePoint {
  return {
    image: { x: 0.5, y: 0.5, z: 0 },
    world: { x: 0, y: 0, z: 0 },
    visibility,
  };
}
