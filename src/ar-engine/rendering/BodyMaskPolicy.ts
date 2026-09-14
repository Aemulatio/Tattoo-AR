import type { BodyMask, BodySide, PoseFrame } from '../contracts';

export const minimumBodyMaskConfidence = 0.55;

export function bodyMaskForSide(
  frame: PoseFrame,
  side: BodySide,
  minimumConfidence = minimumBodyMaskConfidence,
): BodyMask | null {
  const confidence = frame.forearmMaskSamples?.[side]?.confidence ?? 0;
  return frame.bodyMask && confidence >= minimumConfidence
    ? frame.bodyMask
    : null;
}
