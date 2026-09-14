import { CanvasTexture } from 'three';
import type { TattooTextureResource } from './TattooAssetLoader';

export const MAX_TATTOO_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_TATTOO_SOURCE_PIXELS = 100_000_000;
export const MAX_TATTOO_TEXTURE_DIMENSION = 2048;

const supportedMimeTypes = new Set(['image/png', 'image/jpeg']);

export type TattooFileErrorCode =
  | 'empty-file'
  | 'unsupported-type'
  | 'invalid-content'
  | 'file-too-large'
  | 'dimensions-too-large'
  | 'decode-failed'
  | 'canvas-unavailable';

export class TattooFileError extends Error {
  readonly code: TattooFileErrorCode;

  constructor(
    code: TattooFileErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'TattooFileError';
    this.code = code;
  }
}

export interface DecodedTattooFile {
  resource: TattooTextureResource;
  detectedMimeType: 'image/png' | 'image/jpeg';
  sourceWidth: number;
  sourceHeight: number;
  textureWidth: number;
  textureHeight: number;
  wasDownscaled: boolean;
}

export interface TattooTextureSize {
  width: number;
  height: number;
  wasDownscaled: boolean;
}

export async function decodeTattooFile(file: File): Promise<DecodedTattooFile> {
  validateTattooFileMetadata(file);
  const detectedMimeType = await detectTattooFileMimeType(file);
  if (!detectedMimeType) {
    throw new TattooFileError(
      'invalid-content',
      'This file is not a valid PNG or JPEG image.',
    );
  }
  if (file.type && file.type !== detectedMimeType) {
    throw new TattooFileError(
      'invalid-content',
      'The file contents do not match its PNG or JPEG type.',
    );
  }

  const decoded = await decodeBrowserImage(file);
  try {
    const { width: sourceWidth, height: sourceHeight } = decoded;
    if (
      !Number.isFinite(sourceWidth) ||
      !Number.isFinite(sourceHeight) ||
      sourceWidth <= 0 ||
      sourceHeight <= 0
    ) {
      throw new TattooFileError(
        'decode-failed',
        'The image has invalid dimensions and cannot be used.',
      );
    }
    if (sourceWidth * sourceHeight > MAX_TATTOO_SOURCE_PIXELS) {
      throw new TattooFileError(
        'dimensions-too-large',
        'The decoded image is too large. Choose an image under 100 megapixels.',
      );
    }

    const textureSize = calculateTattooTextureSize(
      sourceWidth,
      sourceHeight,
      MAX_TATTOO_TEXTURE_DIMENSION,
    );
    const canvas = document.createElement('canvas');
    canvas.width = textureSize.width;
    canvas.height = textureSize.height;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new TattooFileError(
        'canvas-unavailable',
        'This browser could not prepare the image for preview.',
      );
    }
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);

    return {
      resource: {
        texture: new CanvasTexture(canvas),
        releaseSource: () => {
          canvas.width = 1;
          canvas.height = 1;
        },
      },
      detectedMimeType,
      sourceWidth,
      sourceHeight,
      textureWidth: textureSize.width,
      textureHeight: textureSize.height,
      wasDownscaled: textureSize.wasDownscaled,
    };
  } finally {
    decoded.release();
  }
}

export function validateTattooFileMetadata(
  file: Pick<File, 'size' | 'type'>,
): void {
  if (file.size <= 0) {
    throw new TattooFileError('empty-file', 'The selected image is empty.');
  }
  if (file.size > MAX_TATTOO_FILE_BYTES) {
    throw new TattooFileError(
      'file-too-large',
      'The selected image is over 20 MB. Choose a smaller PNG or JPEG.',
    );
  }
  if (file.type && !supportedMimeTypes.has(file.type)) {
    throw new TattooFileError(
      'unsupported-type',
      'Choose a PNG or JPEG image.',
    );
  }
}

export function detectTattooImageMimeType(
  bytes: Uint8Array,
): 'image/png' | 'image/jpeg' | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return 'image/jpeg';
  }
  return null;
}

export function calculateTattooTextureSize(
  sourceWidth: number,
  sourceHeight: number,
  maxDimension: number,
): TattooTextureSize {
  if (
    !Number.isFinite(sourceWidth) ||
    !Number.isFinite(sourceHeight) ||
    sourceWidth <= 0 ||
    sourceHeight <= 0
  ) {
    throw new RangeError('Source dimensions must be positive finite numbers');
  }
  if (!Number.isFinite(maxDimension) || maxDimension <= 0) {
    throw new RangeError('Maximum dimension must be a positive finite number');
  }
  const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
    wasDownscaled: scale < 1,
  };
}

async function detectTattooFileMimeType(
  file: File,
): Promise<'image/png' | 'image/jpeg' | null> {
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  return detectTattooImageMimeType(header);
}

interface DecodedBrowserImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  release(): void;
}

async function decodeBrowserImage(file: File): Promise<DecodedBrowserImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, {
        imageOrientation: 'from-image',
      });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      };
    } catch {
      // The element fallback covers browsers with partial ImageBitmap support.
    }
  }

  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = 'async';
  try {
    await new Promise<void>((resolve, reject) => {
      image.addEventListener('load', () => resolve(), { once: true });
      image.addEventListener(
        'error',
        () => reject(new Error('Image element failed to decode the file')),
        { once: true },
      );
      image.src = objectUrl;
    });
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw new TattooFileError(
      'decode-failed',
      'The image could not be decoded. It may be damaged or unsupported.',
      { cause: error },
    );
  }

  return {
    source: image,
    width: image.naturalWidth,
    height: image.naturalHeight,
    release: () => {
      image.src = '';
      URL.revokeObjectURL(objectUrl);
    },
  };
}
