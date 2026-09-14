import { DoubleSide, ShaderMaterial, Vector2, type Texture } from 'three';

export interface TattooAppearance {
  opacity: number;
  inkBlend: number;
  edgeFeather: number;
  removeWhiteBackground: boolean;
  backgroundThreshold: number;
  backgroundFeather: number;
  invert: boolean;
}

export const defaultTattooAppearance: Readonly<TattooAppearance> = {
  opacity: 0.68,
  inkBlend: 1,
  edgeFeather: 0.025,
  removeWhiteBackground: false,
  backgroundThreshold: 0.82,
  backgroundFeather: 0.08,
  invert: false,
};

export interface TattooMaterialControls {
  setTexture(texture: Texture | null): void;
  setAnchor(u: number, v: number): void;
  setSize(width: number, height: number): void;
  setRotation(radians: number): void;
  setCircumferenceRatio(ratio: number): void;
  setTrackingOpacity(opacity: number): void;
  setBodyMask(texture: Texture | null): void;
  setAppearance(appearance: TattooAppearance): void;
}

export interface TattooMaterialBundle {
  material: ShaderMaterial;
  controls: TattooMaterialControls;
}

export function createTattooMaterial(): TattooMaterialBundle {
  const uniforms = {
    tattooMap: { value: null as Texture | null },
    bodyMask: { value: null as Texture | null },
    bodyMaskEnabled: { value: 0 },
    anchorUv: { value: new Vector2(0.5, 0.5) },
    patchSize: { value: new Vector2(0.24, 0.32) },
    rotation: { value: 0 },
    circumferenceRatio: { value: 0.7 },
    trackingOpacity: { value: 1 },
    userOpacity: { value: defaultTattooAppearance.opacity },
    inkBlend: { value: defaultTattooAppearance.inkBlend },
    removeWhiteBackground: { value: 0 },
    backgroundThreshold: {
      value: defaultTattooAppearance.backgroundThreshold,
    },
    backgroundFeather: { value: defaultTattooAppearance.backgroundFeather },
    invertArtwork: { value: 0 },
    edgeFeather: { value: defaultTattooAppearance.edgeFeather },
  };
  const material = new ShaderMaterial({
    uniforms,
    vertexShader: `
      attribute float facing;
      attribute vec2 sourceUv;
      varying vec2 vBodyUv;
      varying vec2 vSourceUv;
      varying float vFacing;

      void main() {
        vBodyUv = uv;
        vSourceUv = sourceUv;
        vFacing = facing;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D tattooMap;
      uniform sampler2D bodyMask;
      uniform float bodyMaskEnabled;
      uniform vec2 anchorUv;
      uniform vec2 patchSize;
      uniform float rotation;
      uniform float circumferenceRatio;
      uniform float trackingOpacity;
      uniform float userOpacity;
      uniform float inkBlend;
      uniform float removeWhiteBackground;
      uniform float backgroundThreshold;
      uniform float backgroundFeather;
      uniform float invertArtwork;
      uniform float edgeFeather;

      varying vec2 vBodyUv;
      varying vec2 vSourceUv;
      varying float vFacing;

      void main() {
        float wrappedV = mod(vBodyUv.y - anchorUv.y + 0.5, 1.0) - 0.5;
        vec2 surfaceOffset = vec2(
          wrappedV * circumferenceRatio,
          vBodyUv.x - anchorUv.x
        );
        float cosine = cos(rotation);
        float sine = sin(rotation);
        vec2 localOffset = vec2(
          cosine * surfaceOffset.x + sine * surfaceOffset.y,
          -sine * surfaceOffset.x + cosine * surfaceOffset.y
        );
        vec2 textureUv = localOffset / patchSize + 0.5;
        if (
          textureUv.x <= 0.0 || textureUv.x >= 1.0 ||
          textureUv.y <= 0.0 || textureUv.y >= 1.0
        ) discard;

        vec4 tattoo = texture2D(tattooMap, textureUv);
        vec3 artworkColor = mix(
          tattoo.rgb,
          vec3(1.0) - tattoo.rgb,
          invertArtwork
        );
        float artworkLuminance = dot(
          artworkColor,
          vec3(0.2126, 0.7152, 0.0722)
        );
        float paperAlpha = 1.0 - smoothstep(
          max(0.0, backgroundThreshold - backgroundFeather),
          min(1.0, backgroundThreshold + backgroundFeather),
          artworkLuminance
        );
        float artworkAlpha = tattoo.a * mix(
          1.0,
          paperAlpha,
          removeWhiteBackground
        );
        float edgeDistance = min(
          min(textureUv.x, textureUv.y),
          min(1.0 - textureUv.x, 1.0 - textureUv.y)
        );
        float borderAlpha = smoothstep(0.0, edgeFeather, edgeDistance);
        float facingAlpha = smoothstep(0.02, 0.28, vFacing);
        float bodyAlpha = 1.0;
        if (bodyMaskEnabled > 0.5) {
          if (
            any(lessThan(vSourceUv, vec2(0.0))) ||
            any(greaterThan(vSourceUv, vec2(1.0)))
          ) {
            bodyAlpha = 0.0;
          } else {
            float bodyConfidence = texture2D(bodyMask, vSourceUv).r;
            bodyAlpha = smoothstep(0.35, 0.65, bodyConfidence);
          }
        }
        float alpha = artworkAlpha * borderAlpha * facingAlpha * bodyAlpha
          * trackingOpacity * userOpacity;
        if (alpha < 0.01) discard;

        // A transparent DOM overlay cannot sample the video beneath it. The
        // absorption control blends original color toward the established
        // dark-ink approximation without changing alpha strength.
        vec3 absorbedInk = min(artworkColor, vec3(0.16));
        vec3 ink = mix(artworkColor, absorbedInk, inkBlend);
        gl_FragColor = vec4(ink, alpha);
      }
    `,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    side: DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    toneMapped: false,
  });

  return {
    material,
    controls: {
      setTexture(texture) {
        uniforms.tattooMap.value = texture;
      },
      setAnchor(u, v) {
        uniforms.anchorUv.value.set(u, v);
      },
      setSize(width, height) {
        uniforms.patchSize.value.set(width, height);
      },
      setRotation(radians) {
        uniforms.rotation.value = radians;
      },
      setCircumferenceRatio(ratio) {
        uniforms.circumferenceRatio.value = ratio;
      },
      setTrackingOpacity(value) {
        uniforms.trackingOpacity.value = clampUnit(value);
      },
      setBodyMask(texture) {
        uniforms.bodyMask.value = texture;
        uniforms.bodyMaskEnabled.value = texture ? 1 : 0;
      },
      setAppearance(appearance) {
        const normalized = normalizeTattooAppearance(appearance);
        uniforms.userOpacity.value = normalized.opacity;
        uniforms.inkBlend.value = normalized.inkBlend;
        uniforms.removeWhiteBackground.value = normalized.removeWhiteBackground
          ? 1
          : 0;
        uniforms.backgroundThreshold.value = normalized.backgroundThreshold;
        uniforms.backgroundFeather.value = normalized.backgroundFeather;
        uniforms.invertArtwork.value = normalized.invert ? 1 : 0;
        uniforms.edgeFeather.value = normalized.edgeFeather;
      },
    },
  };
}

export function normalizeTattooAppearance(
  appearance: TattooAppearance,
): TattooAppearance {
  return {
    opacity: clampUnit(appearance.opacity),
    inkBlend: clampUnit(appearance.inkBlend),
    edgeFeather: Math.min(0.2, Math.max(0.001, appearance.edgeFeather)),
    removeWhiteBackground: appearance.removeWhiteBackground,
    backgroundThreshold: clampUnit(appearance.backgroundThreshold),
    backgroundFeather: Math.min(
      0.49,
      Math.max(0.001, appearance.backgroundFeather),
    ),
    invert: appearance.invert,
  };
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
