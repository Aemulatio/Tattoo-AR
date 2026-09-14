import { Texture } from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  TattooAssetLoader,
  TattooAssetLoadSupersededError,
  type TattooTextureResource,
  type TextureLoaderPort,
} from './TattooAssetLoader';

describe('TattooAssetLoader', () => {
  it('loads and configures a decoded transparent texture', async () => {
    const texture = decodedTexture(600, 900);
    const loader = new TattooAssetLoader(stubLoader(texture));

    const asset = await loader.replace('/fixture.png');

    expect(asset.sourceUrl).toBe('/fixture.png');
    expect(asset.pixelWidth).toBe(600);
    expect(asset.pixelHeight).toBe(900);
    expect(asset.aspectRatio).toBeCloseTo(2 / 3);
    expect(texture.colorSpace).toBe('srgb');
    expect(texture.version).toBeGreaterThan(0);
    expect(loader.current).toBe(asset);
  });

  it('disposes the previous GPU texture after a successful replacement', async () => {
    const first = decodedTexture(100, 200);
    const second = decodedTexture(300, 400);
    const firstDispose = vi.spyOn(first, 'dispose');
    const secondDispose = vi.spyOn(second, 'dispose');
    const loader = new TattooAssetLoader(
      sequenceLoader({ texture: first }, { texture: second }),
    );

    await loader.replace('/first.png');
    await loader.replace('/second.png');

    expect(firstDispose).toHaveBeenCalledOnce();
    expect(secondDispose).not.toHaveBeenCalled();
    loader.dispose();
    loader.dispose();
    expect(secondDispose).toHaveBeenCalledOnce();
  });

  it('releases decoded source ownership exactly once', async () => {
    const first = textureResource(100, 200);
    const second = textureResource(300, 400);
    const loader = new TattooAssetLoader(sequenceLoader(first, second));

    await loader.replace('/first.png');
    await loader.replace('/second.png');
    loader.dispose();
    loader.dispose();

    expect(first.releaseSource).toHaveBeenCalledOnce();
    expect(second.releaseSource).toHaveBeenCalledOnce();
  });

  it('keeps the replacement active when previous source cleanup throws', async () => {
    const first = textureResource(100, 200);
    const second = textureResource(300, 400);
    vi.mocked(first.releaseSource!).mockImplementation(() => {
      throw new Error('release failed');
    });
    const loader = new TattooAssetLoader(sequenceLoader(first, second));

    await loader.replace('/first.png');
    await expect(loader.replace('/second.png')).rejects.toThrow(
      'release failed',
    );

    expect(loader.current?.texture).toBe(second.texture);
    expect(first.releaseSource).toHaveBeenCalledOnce();
    expect(second.releaseSource).not.toHaveBeenCalled();
    loader.dispose();
  });

  it('detaches the active asset even when teardown cleanup throws', async () => {
    const resource = textureResource(100, 200);
    const textureDispose = vi.spyOn(resource.texture, 'dispose');
    vi.mocked(resource.releaseSource!).mockImplementation(() => {
      throw new Error('release failed');
    });
    const loader = new TattooAssetLoader(sequenceLoader(resource));
    await loader.replace('/fixture.png');

    expect(() => loader.dispose()).toThrow('release failed');
    expect(loader.current).toBeNull();
    expect(textureDispose).toHaveBeenCalledOnce();
    expect(resource.releaseSource).toHaveBeenCalledOnce();
    expect(() => loader.dispose()).not.toThrow();
  });

  it('keeps the current asset when a replacement fails', async () => {
    const first = decodedTexture(100, 200);
    const port: TextureLoaderPort = {
      loadAsync: vi
        .fn()
        .mockResolvedValueOnce({ texture: first })
        .mockRejectedValueOnce(new Error('decode failed')),
    };
    const loader = new TattooAssetLoader(port);
    const active = await loader.replace('/first.png');

    await expect(loader.replace('/broken.png')).rejects.toThrow(
      'decode failed',
    );
    expect(loader.current).toBe(active);
  });

  it('disposes a late texture from a superseded request', async () => {
    const first = decodedTexture(100, 100);
    const second = decodedTexture(200, 200);
    const firstDispose = vi.spyOn(first, 'dispose');
    const releaseSource = vi.fn();
    const firstLoad = deferred<TattooTextureResource>();
    const port: TextureLoaderPort = {
      loadAsync: vi
        .fn()
        .mockReturnValueOnce(firstLoad.promise)
        .mockResolvedValueOnce({ texture: second }),
    };
    const loader = new TattooAssetLoader(port);

    const stale = loader.replace('/slow.png');
    await loader.replace('/new.png');
    firstLoad.resolve({ texture: first, releaseSource });

    await expect(stale).rejects.toBeInstanceOf(TattooAssetLoadSupersededError);
    expect(firstDispose).toHaveBeenCalledOnce();
    expect(releaseSource).toHaveBeenCalledOnce();
    expect(loader.current?.texture).toBe(second);
  });

  it('reports a late rejection as superseded', async () => {
    const firstLoad = deferred<TattooTextureResource>();
    const second = decodedTexture(200, 200);
    const port: TextureLoaderPort = {
      loadAsync: vi
        .fn()
        .mockReturnValueOnce(firstLoad.promise)
        .mockResolvedValueOnce({ texture: second }),
    };
    const loader = new TattooAssetLoader(port);

    const stale = loader.replace('/slow.png');
    await loader.replace('/new.png');
    firstLoad.reject(new Error('stale decode failed'));

    await expect(stale).rejects.toBeInstanceOf(TattooAssetLoadSupersededError);
    expect(loader.current?.texture).toBe(second);
  });

  it('rejects a decoded texture without usable dimensions', async () => {
    const texture = new Texture();
    const dispose = vi.spyOn(texture, 'dispose');
    const releaseSource = vi.fn();
    const loader = new TattooAssetLoader({
      loadAsync: vi.fn().mockResolvedValue({ texture, releaseSource }),
    });

    await expect(loader.replace('/empty.png')).rejects.toThrow(
      'invalid decoded dimensions',
    );
    expect(dispose).toHaveBeenCalledOnce();
    expect(releaseSource).toHaveBeenCalledOnce();
  });
});

function decodedTexture(width: number, height: number): Texture {
  return new Texture({ width, height } as TexImageSource);
}

function stubLoader(texture: Texture): TextureLoaderPort {
  return { loadAsync: vi.fn().mockResolvedValue({ texture }) };
}

function sequenceLoader(
  ...resources: TattooTextureResource[]
): TextureLoaderPort {
  const loadAsync = vi.fn();
  for (const resource of resources) loadAsync.mockResolvedValueOnce(resource);
  return { loadAsync };
}

function textureResource(width: number, height: number): TattooTextureResource {
  return {
    texture: decodedTexture(width, height),
    releaseSource: vi.fn(),
  };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(reason: unknown): void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((settle, fail) => {
    resolve = settle;
    reject = fail;
  });
  return { promise, resolve, reject };
}
