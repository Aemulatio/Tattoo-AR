import { DoubleSide, ShaderMaterial, Vector2, type Texture } from 'three';

export interface TattooMaterialControls {
  setTexture(texture: Texture | null): void;
  setAnchor(u: number, v: number): void;
  setSize(width: number, height: number): void;
  setRotation(radians: number): void;
  setCircumferenceRatio(ratio: number): void;
  setOpacity(opacity: number): void;
}

export interface TattooMaterialBundle {
  material: ShaderMaterial;
  controls: TattooMaterialControls;
}

export function createTattooMaterial(): TattooMaterialBundle {
  const uniforms = {
    tattooMap: { value: null as Texture | null },
    anchorUv: { value: new Vector2(0.5, 0.5) },
    patchSize: { value: new Vector2(0.24, 0.32) },
    rotation: { value: 0 },
    circumferenceRatio: { value: 0.7 },
    opacity: { value: 0.82 },
    edgeFeather: { value: 0.025 },
  };
  const material = new ShaderMaterial({
    uniforms,
    vertexShader: `
      attribute float facing;
      varying vec2 vBodyUv;
      varying float vFacing;

      void main() {
        vBodyUv = uv;
        vFacing = facing;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D tattooMap;
      uniform vec2 anchorUv;
      uniform vec2 patchSize;
      uniform float rotation;
      uniform float circumferenceRatio;
      uniform float opacity;
      uniform float edgeFeather;

      varying vec2 vBodyUv;
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
        float edgeDistance = min(
          min(textureUv.x, textureUv.y),
          min(1.0 - textureUv.x, 1.0 - textureUv.y)
        );
        float borderAlpha = smoothstep(0.0, edgeFeather, edgeDistance);
        float facingAlpha = smoothstep(0.02, 0.28, vFacing);
        float alpha = tattoo.a * borderAlpha * facingAlpha * opacity;
        if (alpha < 0.01) discard;

        // A transparent DOM overlay cannot sample the video beneath it. Dark
        // alpha compositing is the Phase 4 approximation of an ink blend.
        vec3 ink = min(tattoo.rgb, vec3(0.12));
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
      setOpacity(value) {
        uniforms.opacity.value = value;
      },
    },
  };
}
