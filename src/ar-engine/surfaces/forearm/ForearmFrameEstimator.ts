import type { BodySide, PoseFrame, PosePoint, Vec3 } from '../../contracts';
import {
  cross,
  dot,
  negate,
  normalize,
  projectOnPlane,
  subtract,
  vectorLength,
} from '../../math/vec3';
import { PoseLandmark } from '../../tracking/landmark-indices';

export type ForearmOrientationSource = 'hand' | 'transported' | 'neutral';

export interface ForearmLocalFrame {
  origin: Vec3;
  axis: Vec3;
  radial: Vec3;
  tangent: Vec3;
  length: number;
  rollRadians: number;
  rollConfidence: number;
  orientationSource: ForearmOrientationSource;
}

const landmarkIndices = {
  left: {
    elbow: PoseLandmark.leftElbow,
    wrist: PoseLandmark.leftWrist,
    pinky: PoseLandmark.leftPinky,
    index: PoseLandmark.leftIndex,
  },
  right: {
    elbow: PoseLandmark.rightElbow,
    wrist: PoseLandmark.rightWrist,
    pinky: PoseLandmark.rightPinky,
    index: PoseLandmark.rightIndex,
  },
} as const;

export class ForearmFrameEstimator {
  private previousFrame: ForearmLocalFrame | null = null;

  update(frame: PoseFrame, side: BodySide): ForearmLocalFrame | null {
    const indices = landmarkIndices[side];
    const wrist = frame.landmarks[indices.wrist];
    const elbow = frame.landmarks[indices.elbow];
    if (!isUsableJoint(wrist) || !isUsableJoint(elbow)) return null;

    const axisVector = subtract(elbow.world, wrist.world);
    const axis = normalize(axisVector);
    const length = vectorLength(axisVector);
    if (!axis || length < 1e-4) return null;

    const handOrientation = this.fromHandLandmarks(frame, side, axis, length);
    const transported = this.transportPrevious(axis);
    const orientation =
      handOrientation ?? transported ?? this.neutralOrientation(axis);
    let radial = orientation.radial;
    const transportedPrevious = this.previousFrame
      ? normalize(projectOnPlane(this.previousFrame.radial, axis))
      : null;

    if (transportedPrevious && dot(radial, transportedPrevious) < 0) {
      radial = negate(radial);
    }

    const tangent = normalize(cross(axis, radial));
    if (!tangent) return null;
    const orthogonalRadial = normalize(cross(tangent, axis));
    if (!orthogonalRadial) return null;

    const localFrame: ForearmLocalFrame = {
      origin: { ...wrist.world },
      axis,
      radial: orthogonalRadial,
      tangent,
      length,
      rollRadians:
        this.previousFrame && transportedPrevious
          ? this.previousFrame.rollRadians +
            signedAngle(transportedPrevious, orthogonalRadial, axis)
          : 0,
      rollConfidence: orientation.confidence,
      orientationSource: orientation.source,
    };
    this.previousFrame = localFrame;
    return localFrame;
  }

  reset(): void {
    this.previousFrame = null;
  }

  private fromHandLandmarks(
    frame: PoseFrame,
    side: BodySide,
    axis: Vec3,
    forearmLength: number,
  ): OrientationCandidate | null {
    const indices = landmarkIndices[side];
    const index = frame.landmarks[indices.index];
    const pinky = frame.landmarks[indices.pinky];
    if (!isUsableHandPoint(index) || !isUsableHandPoint(pinky)) return null;

    const acrossHand = subtract(index.world, pinky.world);
    const acrossLength = vectorLength(acrossHand);
    const projected = projectOnPlane(acrossHand, axis);
    const radial = normalize(projected);
    if (!radial || acrossLength < forearmLength * 0.015) return null;

    const projectionQuality = Math.min(
      1,
      vectorLength(projected) / acrossLength,
    );
    return {
      radial,
      confidence:
        Math.min(index.visibility, pinky.visibility) * projectionQuality,
      source: 'hand',
    };
  }

  private transportPrevious(axis: Vec3): OrientationCandidate | null {
    if (!this.previousFrame) return null;
    const radial = normalize(projectOnPlane(this.previousFrame.radial, axis));
    if (!radial) return null;
    return {
      radial,
      confidence: this.previousFrame.rollConfidence * 0.92,
      source: 'transported',
    };
  }

  private neutralOrientation(axis: Vec3): OrientationCandidate {
    const cameraFacing = { x: 0, y: 0, z: -1 };
    const screenRight = { x: 1, y: 0, z: 0 };
    const radial =
      normalize(projectOnPlane(cameraFacing, axis)) ??
      normalize(projectOnPlane(screenRight, axis)) ??
      screenRight;
    return { radial, confidence: 0.15, source: 'neutral' };
  }
}

function signedAngle(from: Vec3, to: Vec3, axis: Vec3): number {
  return Math.atan2(dot(axis, cross(from, to)), dot(from, to));
}

interface OrientationCandidate {
  radial: Vec3;
  confidence: number;
  source: ForearmOrientationSource;
}

function isUsableJoint(point: PosePoint | undefined): point is PosePoint {
  return Boolean(point && point.visibility >= 0.3);
}

function isUsableHandPoint(point: PosePoint | undefined): point is PosePoint {
  return Boolean(point && point.visibility >= 0.45);
}
