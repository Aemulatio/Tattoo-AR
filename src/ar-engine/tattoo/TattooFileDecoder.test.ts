import { describe, expect, it } from 'vitest';
import {
  MAX_TATTOO_FILE_BYTES,
  TattooFileError,
  calculateTattooTextureSize,
  detectTattooImageMimeType,
  validateTattooFileMetadata,
} from './TattooFileDecoder';

describe('TattooFileDecoder', () => {
  it('recognizes PNG and JPEG signatures instead of trusting extensions', () => {
    expect(
      detectTattooImageMimeType(
        Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ),
    ).toBe('image/png');
    expect(
      detectTattooImageMimeType(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])),
    ).toBe('image/jpeg');
    expect(
      detectTattooImageMimeType(Uint8Array.from([0x3c, 0x73, 0x76, 0x67])),
    ).toBeNull();
  });

  it('rejects empty, oversized, and unsupported files before decoding', () => {
    expect(() =>
      validateTattooFileMetadata({ size: 0, type: 'image/png' }),
    ).toThrowError(TattooFileError);
    expect(() =>
      validateTattooFileMetadata({
        size: MAX_TATTOO_FILE_BYTES + 1,
        type: 'image/jpeg',
      }),
    ).toThrow('over 20 MB');
    expect(() =>
      validateTattooFileMetadata({ size: 100, type: 'image/svg+xml' }),
    ).toThrow('PNG or JPEG');
  });

  it('allows an omitted MIME type so valid file bytes can decide the format', () => {
    expect(() =>
      validateTattooFileMetadata({ size: 100, type: '' }),
    ).not.toThrow();
  });

  it('downscales the longest edge while preserving aspect ratio', () => {
    expect(calculateTattooTextureSize(4032, 3024, 2048)).toEqual({
      width: 2048,
      height: 1536,
      wasDownscaled: true,
    });
    expect(calculateTattooTextureSize(640, 960, 2048)).toEqual({
      width: 640,
      height: 960,
      wasDownscaled: false,
    });
  });

  it('rejects invalid source and limit dimensions', () => {
    expect(() => calculateTattooTextureSize(0, 100, 2048)).toThrow(
      'Source dimensions',
    );
    expect(() => calculateTattooTextureSize(100, 100, 0)).toThrow(
      'Maximum dimension',
    );
  });
});
