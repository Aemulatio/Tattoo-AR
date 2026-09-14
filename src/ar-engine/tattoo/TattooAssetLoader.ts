import {
  ClampToEdgeWrapping,
  LinearFilter,
  SRGBColorSpace,
  TextureLoader,
  type Texture,
} from 'three';

export interface TattooAsset {
  sourceUrl: string;
  texture: Texture;
  pixelWidth: number;
  pixelHeight: number;
  aspectRatio: number;
}

export interface TattooTextureResource {
  texture: Texture;
  /** Releases decoded source resources such as blob URLs or ImageBitmaps. */
  releaseSource?: () => void;
}

export interface TextureLoaderPort {
  loadAsync(url: string): Promise<TattooTextureResource>;
}

export class TattooAssetLoadSupersededError extends Error {
  constructor() {
    super('Tattoo asset load was superseded');
    this.name = 'TattooAssetLoadSupersededError';
  }
}

/** Owns the active GPU texture and disposes it on replacement or teardown. */
export class TattooAssetLoader {
  private readonly textureLoader: TextureLoaderPort;
  private active: OwnedTattooAsset | null = null;
  private generation = 0;
  private disposed = false;

  constructor(textureLoader?: TextureLoaderPort) {
    this.textureLoader = textureLoader ?? createDefaultTextureLoader();
  }

  get current(): TattooAsset | null {
    return this.active;
  }

  async replace(sourceUrl: string): Promise<TattooAsset> {
    return this.replaceWith(sourceUrl, () =>
      this.textureLoader.loadAsync(sourceUrl),
    );
  }

  async replaceWith(
    sourceUrl: string,
    loadResource: () => Promise<TattooTextureResource>,
  ): Promise<TattooAsset> {
    if (this.disposed) throw new Error('TattooAssetLoader is disposed');
    if (!sourceUrl) throw new TypeError('sourceUrl must not be empty');

    const generation = ++this.generation;
    let resource: TattooTextureResource;
    try {
      resource = await loadResource();
    } catch (error) {
      if (this.disposed || generation !== this.generation) {
        throw new TattooAssetLoadSupersededError();
      }
      throw error;
    }

    const ownedResource = ownTextureResource(resource);
    if (this.disposed || generation !== this.generation) {
      ownedResource.dispose();
      throw new TattooAssetLoadSupersededError();
    }

    const { texture } = resource;
    let asset: OwnedTattooAsset;
    try {
      const { width, height } = textureDimensions(texture);
      configureTattooTexture(texture);
      asset = {
        sourceUrl,
        texture,
        pixelWidth: width,
        pixelHeight: height,
        aspectRatio: width / height,
        dispose: ownedResource.dispose,
      };
    } catch (error) {
      ownedResource.dispose();
      throw error;
    }

    const previous = this.active;
    this.active = asset;
    previous?.dispose();
    return asset;
  }

  clear(): void {
    this.generation += 1;
    const active = this.active;
    this.active = null;
    active?.dispose();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clear();
  }
}

interface OwnedTattooAsset extends TattooAsset {
  dispose(): void;
}

function createDefaultTextureLoader(): TextureLoaderPort {
  const loader = new TextureLoader();
  return {
    async loadAsync(url) {
      return { texture: await loader.loadAsync(url) };
    },
  };
}

function ownTextureResource(resource: TattooTextureResource): {
  dispose(): void;
} {
  let disposed = false;
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      try {
        resource.texture.dispose();
      } finally {
        resource.releaseSource?.();
      }
    },
  };
}

function configureTattooTexture(texture: Texture): void {
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.magFilter = LinearFilter;
  texture.premultiplyAlpha = false;
  texture.needsUpdate = true;
}

function textureDimensions(texture: Texture): {
  width: number;
  height: number;
} {
  const image = texture.image as
    | {
        width?: number;
        height?: number;
        naturalWidth?: number;
        naturalHeight?: number;
      }
    | undefined;
  const width = image?.naturalWidth ?? image?.width;
  const height = image?.naturalHeight ?? image?.height;
  if (
    typeof width !== 'number' ||
    typeof height !== 'number' ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new Error('Tattoo texture has invalid decoded dimensions');
  }
  return { width, height };
}
