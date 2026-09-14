import type { BodyMask } from '../contracts';

export const defaultBodyMaskMaximumDimension = 128;

export function createCompactBodyMask(
  source: Float32Array,
  sourceWidth: number,
  sourceHeight: number,
  maximumDimension = defaultBodyMaskMaximumDimension,
): BodyMask | null {
  if (
    !Number.isInteger(sourceWidth) ||
    !Number.isInteger(sourceHeight) ||
    sourceWidth <= 0 ||
    sourceHeight <= 0 ||
    source.length !== sourceWidth * sourceHeight ||
    !Number.isInteger(maximumDimension) ||
    maximumDimension <= 0
  ) {
    return null;
  }

  const scale = Math.min(
    1,
    maximumDimension / Math.max(sourceWidth, sourceHeight),
  );
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const data = new Uint8Array(width * height);
  let foregroundPixels = 0;

  for (let y = 0; y < height; y += 1) {
    const sourceY = ((y + 0.5) * sourceHeight) / height - 0.5;
    for (let x = 0; x < width; x += 1) {
      const sourceX = ((x + 0.5) * sourceWidth) / width - 0.5;
      const value = sampleBilinear(
        source,
        sourceWidth,
        sourceHeight,
        sourceX,
        sourceY,
      );
      const byte = Math.round(value * 255);
      data[y * width + x] = byte;
      if (byte >= 128) foregroundPixels += 1;
    }
  }

  const coverage = foregroundPixels / data.length;
  if (coverage <= 0.005 || coverage >= 0.995) return null;
  return { width, height, data };
}

function sampleBilinear(
  source: Float32Array,
  width: number,
  height: number,
  x: number,
  y: number,
): number {
  const clampedX = Math.min(width - 1, Math.max(0, x));
  const clampedY = Math.min(height - 1, Math.max(0, y));
  const x0 = Math.floor(clampedX);
  const y0 = Math.floor(clampedY);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const blendX = clampedX - x0;
  const blendY = clampedY - y0;
  const top = lerp(
    read(source, width, x0, y0),
    read(source, width, x1, y0),
    blendX,
  );
  const bottom = lerp(
    read(source, width, x0, y1),
    read(source, width, x1, y1),
    blendX,
  );
  return lerp(top, bottom, blendY);
}

function read(source: Float32Array, width: number, x: number, y: number) {
  const value = source[y * width + x] ?? 0;
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function lerp(from: number, to: number, amount: number) {
  return from + (to - from) * amount;
}
