import type { BodySide, ForearmMaskSample, PosePoint } from '../../contracts';
import { PoseLandmark } from '../../tracking/landmark-indices';

const samplePositions = {
  wrist: [0.2, 0.3, 0.4],
  elbow: [0.6, 0.7, 0.8],
} as const;

export interface ForearmMaskSamplerOptions {
  threshold?: number;
  minimumLandmarkVisibility?: number;
}

/** Samples cross-sections directly from MediaPipe's callback-owned mask. */
export function sampleForearmMask(
  mask: Float32Array,
  width: number,
  height: number,
  landmarks: ReadonlyArray<PosePoint>,
  side: BodySide,
  options: ForearmMaskSamplerOptions = {},
): ForearmMaskSample | null {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    mask.length !== width * height
  ) {
    return null;
  }

  const threshold = options.threshold ?? 0.55;
  const minimumVisibility = options.minimumLandmarkVisibility ?? 0.3;
  const indices =
    side === 'left'
      ? { wrist: PoseLandmark.leftWrist, elbow: PoseLandmark.leftElbow }
      : { wrist: PoseLandmark.rightWrist, elbow: PoseLandmark.rightElbow };
  const wrist = landmarks[indices.wrist];
  const elbow = landmarks[indices.elbow];
  if (
    !wrist ||
    !elbow ||
    wrist.visibility < minimumVisibility ||
    elbow.visibility < minimumVisibility
  ) {
    return null;
  }

  const wristX = wrist.image.x * (width - 1);
  const wristY = wrist.image.y * (height - 1);
  const elbowX = elbow.image.x * (width - 1);
  const elbowY = elbow.image.y * (height - 1);
  const axisX = elbowX - wristX;
  const axisY = elbowY - wristY;
  const forearmLength = Math.hypot(axisX, axisY);
  if (!Number.isFinite(forearmLength) || forearmLength < 4) return null;

  const perpendicularX = -axisY / forearmLength;
  const perpendicularY = axisX / forearmLength;
  const maximumHalfWidth = Math.min(
    forearmLength * 0.35,
    Math.max(width, height) * 0.2,
  );
  const wristSamples = samplePositions.wrist
    .map((position) =>
      sampleCrossSection(
        mask,
        width,
        height,
        wristX + axisX * position,
        wristY + axisY * position,
        perpendicularX,
        perpendicularY,
        maximumHalfWidth,
        threshold,
      ),
    )
    .filter(isCrossSection);
  const elbowSamples = samplePositions.elbow
    .map((position) =>
      sampleCrossSection(
        mask,
        width,
        height,
        wristX + axisX * position,
        wristY + axisY * position,
        perpendicularX,
        perpendicularY,
        maximumHalfWidth,
        threshold,
      ),
    )
    .filter(isCrossSection);

  if (wristSamples.length < 2 || elbowSamples.length < 2) return null;
  const wristRadiusRatio = median(
    wristSamples.map((sample) => sample.halfWidth / forearmLength),
  );
  const elbowRadiusRatio = median(
    elbowSamples.map((sample) => sample.halfWidth / forearmLength),
  );
  if (
    !isPlausibleRadiusRatio(wristRadiusRatio) ||
    !isPlausibleRadiusRatio(elbowRadiusRatio) ||
    elbowRadiusRatio < wristRadiusRatio * 0.65 ||
    elbowRadiusRatio > wristRadiusRatio * 2.2
  ) {
    return null;
  }

  const samples = [...wristSamples, ...elbowSamples];
  const coverage = samples.length / 6;
  const maskConfidence =
    samples.reduce((total, sample) => total + sample.centerConfidence, 0) /
    samples.length;

  return {
    wristRadiusRatio,
    elbowRadiusRatio,
    confidence: clamp01(coverage * maskConfidence),
  };
}

interface CrossSection {
  halfWidth: number;
  centerConfidence: number;
}

function sampleCrossSection(
  mask: Float32Array,
  width: number,
  height: number,
  centerX: number,
  centerY: number,
  perpendicularX: number,
  perpendicularY: number,
  maximumHalfWidth: number,
  threshold: number,
): CrossSection | null {
  const centerOffset = findNearestForegroundOffset(
    mask,
    width,
    height,
    centerX,
    centerY,
    perpendicularX,
    perpendicularY,
    maximumHalfWidth * 0.25,
    threshold,
  );
  if (centerOffset === null) return null;

  const adjustedX = centerX + perpendicularX * centerOffset;
  const adjustedY = centerY + perpendicularY * centerOffset;
  const negative = distanceToBoundary(
    mask,
    width,
    height,
    adjustedX,
    adjustedY,
    -perpendicularX,
    -perpendicularY,
    maximumHalfWidth,
    threshold,
  );
  const positive = distanceToBoundary(
    mask,
    width,
    height,
    adjustedX,
    adjustedY,
    perpendicularX,
    perpendicularY,
    maximumHalfWidth,
    threshold,
  );
  if (negative === null || positive === null) return null;

  return {
    halfWidth: (negative + positive) / 2,
    centerConfidence: sampleMask(mask, width, height, adjustedX, adjustedY),
  };
}

function findNearestForegroundOffset(
  mask: Float32Array,
  width: number,
  height: number,
  centerX: number,
  centerY: number,
  directionX: number,
  directionY: number,
  searchDistance: number,
  threshold: number,
): number | null {
  if (sampleMask(mask, width, height, centerX, centerY) >= threshold) return 0;
  for (let distance = 1; distance <= searchDistance; distance += 1) {
    if (
      sampleMask(
        mask,
        width,
        height,
        centerX + directionX * distance,
        centerY + directionY * distance,
      ) >= threshold
    ) {
      return distance;
    }
    if (
      sampleMask(
        mask,
        width,
        height,
        centerX - directionX * distance,
        centerY - directionY * distance,
      ) >= threshold
    ) {
      return -distance;
    }
  }
  return null;
}

function distanceToBoundary(
  mask: Float32Array,
  width: number,
  height: number,
  originX: number,
  originY: number,
  directionX: number,
  directionY: number,
  maximumDistance: number,
  threshold: number,
): number | null {
  for (let distance = 1; distance <= maximumDistance; distance += 1) {
    if (
      sampleMask(
        mask,
        width,
        height,
        originX + directionX * distance,
        originY + directionY * distance,
      ) < threshold
    ) {
      return distance - 0.5;
    }
  }
  return null;
}

function sampleMask(
  mask: Float32Array,
  width: number,
  height: number,
  x: number,
  y: number,
): number {
  const roundedX = Math.round(x);
  const roundedY = Math.round(y);
  if (roundedX < 0 || roundedX >= width || roundedY < 0 || roundedY >= height) {
    return 0;
  }
  return clamp01(mask[roundedY * width + roundedX] ?? 0);
}

function median(values: number[]): number {
  values.sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)] ?? 0;
}

function isCrossSection(value: CrossSection | null): value is CrossSection {
  return value !== null;
}

function isPlausibleRadiusRatio(value: number): boolean {
  return value >= 0.04 && value <= 0.35;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
