import type { PoseFrame, PosePoint } from '../contracts';
import { PoseLandmark } from './landmark-indices';

export type BodySide = 'left' | 'right';

export interface PoseConfidence {
  value: number;
  visibility: number;
  freshness: number;
  poseAgeMs: number;
  side: BodySide | null;
}

export interface PoseConfidenceOptions {
  maxPoseAgeMs: number;
}

const defaultOptions: PoseConfidenceOptions = {
  maxPoseAgeMs: 500,
};

const sideIndices = {
  left: {
    arm: [
      PoseLandmark.leftShoulder,
      PoseLandmark.leftElbow,
      PoseLandmark.leftWrist,
    ],
    hand: [
      PoseLandmark.leftThumb,
      PoseLandmark.leftIndex,
      PoseLandmark.leftPinky,
    ],
  },
  right: {
    arm: [
      PoseLandmark.rightShoulder,
      PoseLandmark.rightElbow,
      PoseLandmark.rightWrist,
    ],
    hand: [
      PoseLandmark.rightThumb,
      PoseLandmark.rightIndex,
      PoseLandmark.rightPinky,
    ],
  },
} as const;

export function evaluatePoseConfidence(
  frame: PoseFrame,
  nowMs: number,
  lockedSide: BodySide | null = null,
  options: Partial<PoseConfidenceOptions> = {},
): PoseConfidence {
  const resolvedOptions = { ...defaultOptions, ...options };
  const leftVisibility = visibilityForSide(frame.landmarks, 'left');
  const rightVisibility = visibilityForSide(frame.landmarks, 'right');
  const side = lockedSide ?? selectVisibleSide(leftVisibility, rightVisibility);
  const visibility =
    side === 'left' ? leftVisibility : side === 'right' ? rightVisibility : 0;
  const poseAgeMs = Math.max(0, nowMs - frame.timestampMs);
  const freshness = clamp01(1 - poseAgeMs / resolvedOptions.maxPoseAgeMs);

  return {
    value: visibility * freshness,
    visibility,
    freshness,
    poseAgeMs,
    side,
  };
}

function visibilityForSide(
  landmarks: ReadonlyArray<PosePoint>,
  side: BodySide,
): number {
  const indices = sideIndices[side];
  const armVisibility = meanVisibility(landmarks, indices.arm);
  const handVisibility = meanVisibility(landmarks, indices.hand);
  return clamp01(armVisibility * 0.75 + handVisibility * 0.25);
}

function meanVisibility(
  landmarks: ReadonlyArray<PosePoint>,
  indices: ReadonlyArray<number>,
): number {
  return (
    indices.reduce((total, index) => {
      return total + clamp01(landmarks[index]?.visibility ?? 0);
    }, 0) / indices.length
  );
}

function selectVisibleSide(
  leftVisibility: number,
  rightVisibility: number,
): BodySide | null {
  if (leftVisibility <= 0 && rightVisibility <= 0) return null;
  return leftVisibility >= rightVisibility ? 'left' : 'right';
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
