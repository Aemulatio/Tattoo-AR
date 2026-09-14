import type { BodySide, PoseFrame, Vec3 } from '../contracts';
import type { ViewportPoint, ViewportSize } from '../camera/ViewportTransform';
import { ViewportTransform } from '../camera/ViewportTransform';
import type { ForearmLocalFrame } from '../surfaces/forearm/ForearmFrameEstimator';
import { PoseLandmark } from '../tracking/landmark-indices';

export interface ProjectedForearmPoint {
  source: ViewportPoint;
  display: ViewportPoint;
  ndc: ViewportPoint;
  /** Renderer depth, with larger values closer to the camera. */
  depth: number;
  /** Positive when the surface normal faces the camera. */
  facing: number;
}

export const forearmProjectionCamera = {
  z: 2,
  near: 0,
  far: 4,
} as const;

/**
 * Projects MediaPipe-relative forearm geometry onto the landmark-aligned video.
 * ViewportTransform remains the only source/display/mirroring boundary.
 */
export class ForearmProjector {
  private readonly localFrame: ForearmLocalFrame;
  private readonly transform: ViewportTransform;
  private readonly sourceSize: ViewportSize;
  private readonly sourceWrist: ViewportPoint;
  private readonly sourceElbow: ViewportPoint;
  private readonly pixelsPerWorldUnit: number;

  constructor(
    poseFrame: PoseFrame,
    side: BodySide,
    localFrame: ForearmLocalFrame,
    transform: ViewportTransform,
    sourceSize: ViewportSize,
  ) {
    const indices = forearmLandmarks(side);
    const wrist = poseFrame.landmarks[indices.wrist];
    const elbow = poseFrame.landmarks[indices.elbow];
    if (!wrist || !elbow) {
      throw new Error(`Missing ${side} wrist or elbow landmark`);
    }
    if (!Number.isFinite(localFrame.length) || localFrame.length <= 0) {
      throw new RangeError('forearm frame length must be positive');
    }

    this.localFrame = localFrame;
    this.transform = transform;
    this.sourceSize = sourceSize;
    this.sourceWrist = {
      x: wrist.image.x * sourceSize.width,
      y: wrist.image.y * sourceSize.height,
    };
    this.sourceElbow = {
      x: elbow.image.x * sourceSize.width,
      y: elbow.image.y * sourceSize.height,
    };
    this.pixelsPerWorldUnit =
      Math.hypot(
        this.sourceElbow.x - this.sourceWrist.x,
        this.sourceElbow.y - this.sourceWrist.y,
      ) / localFrame.length;
  }

  project(world: Vec3, normal?: Vec3): ProjectedForearmPoint {
    const relative = subtract(world, this.localFrame.origin);
    const longitudinal =
      dot(relative, this.localFrame.axis) / this.localFrame.length;
    const radial = dot(relative, this.localFrame.radial);
    const tangent = dot(relative, this.localFrame.tangent);
    const crossX =
      this.localFrame.radial.x * radial + this.localFrame.tangent.x * tangent;
    const crossY =
      this.localFrame.radial.y * radial + this.localFrame.tangent.y * tangent;
    const source = {
      x:
        this.sourceWrist.x +
        (this.sourceElbow.x - this.sourceWrist.x) * longitudinal +
        crossX * this.pixelsPerWorldUnit,
      y:
        this.sourceWrist.y +
        (this.sourceElbow.y - this.sourceWrist.y) * longitudinal +
        crossY * this.pixelsPerWorldUnit,
    };
    const display = this.transform.sourceToDisplay(source);

    return {
      source,
      display,
      ndc: this.transform.displayToNdc(display),
      depth: -relative.z / this.localFrame.length,
      facing: normal ? clamp(-normal.z, -1, 1) : 0,
    };
  }

  get source(): ViewportSize {
    return this.sourceSize;
  }
}

function forearmLandmarks(side: BodySide): {
  wrist: number;
  elbow: number;
} {
  return side === 'left'
    ? { wrist: PoseLandmark.leftWrist, elbow: PoseLandmark.leftElbow }
    : { wrist: PoseLandmark.rightWrist, elbow: PoseLandmark.rightElbow };
}

function subtract(left: Vec3, right: Vec3): Vec3 {
  return {
    x: left.x - right.x,
    y: left.y - right.y,
    z: left.z - right.z,
  };
}

function dot(left: Vec3, right: Vec3): number {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
