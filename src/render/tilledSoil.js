import { DataTexture, LinearFilter, RGBAFormat, UnsignedByteType, Vector3 } from 'three';

/**
 * Tilled ground: what you've dug with a hoe, painted straight onto the
 * terrain itself (no block of soil laid on top): dark turned earth in
 * furrows, the ridges a shade lighter, darker still where it's been
 * watered, its edges ragged into the grass round it. Kept in a map of the
 * ground round you, half a metre a texel (see paintTilled, filled in from
 * the plots near you by main): red how dug it is, green how wet.
 */
const N = 256, TEXEL = 0.5;
const data = new Uint8Array(N * N * 4);
export const tilledTexture = new DataTexture(data, N, N, RGBAFormat, UnsignedByteType);
tilledTexture.magFilter = LinearFilter;
tilledTexture.minFilter = LinearFilter;
tilledTexture.needsUpdate = true;
// (x0, z0, size): where the map lies.
export const tilledOrigin = { value: new Vector3(1e9, 1e9, N * TEXEL) };
export const TILLED_HALF = 1.1; // half a plot's side (m), a little past its crops

/**
 * Paints the map afresh round (cx, cz) from `plots` ([{ x, z, rot, watered }]):
 * each a patch of dug earth about its middle, roughly square, frayed at the edges.
 */
export function paintTilled(cx, cz, plots, paths = []) {
  const size = N * TEXEL, x0 = Math.floor((cx - size / 2) / 8) * 8, z0 = Math.floor((cz - size / 2) / 8) * 8;
  data.fill(0);
  const R = TILLED_HALF + 0.45;
  for (const p of plots) {
    const c = Math.cos(p.rot ?? 0), s = Math.sin(p.rot ?? 0), wet = p.watered ? 255 : 0;
    const i0 = Math.max(0, Math.floor((p.x - R * 1.5 - x0) / TEXEL)), i1 = Math.min(N - 1, Math.ceil((p.x + R * 1.5 - x0) / TEXEL));
    const k0 = Math.max(0, Math.floor((p.z - R * 1.5 - z0) / TEXEL)), k1 = Math.min(N - 1, Math.ceil((p.z + R * 1.5 - z0) / TEXEL));
    for (let k = k0; k <= k1; k++) {
      for (let i = i0; i <= i1; i++) {
        const dx = x0 + (i + 0.5) * TEXEL - p.x, dz = z0 + (k + 0.5) * TEXEL - p.z;
        const lx = c * dx - s * dz, lz = s * dx + c * dz;
        // (Rounded off at the corners, and ragged.)
        const d = 0.65 * Math.max(Math.abs(lx), Math.abs(lz)) + 0.35 * Math.hypot(lx, lz) + 0.12 * Math.sin(lx * 5 + lz * 3) + 0.08 * Math.sin(lz * 7 - lx * 4);
        const v = Math.round(255 * Math.min(1, Math.max(0, (R - d) / 0.45)));
        const o = (k * N + i) * 4;
        if (v > data[o]) data[o] = v;
        if (v && wet) data[o + 1] = Math.max(data[o + 1], Math.min(v, wet));
      }
    }
  }
  // The paths you've worn (blue): bare trodden earth, about a metre wide, ragged at its edges.
  for (const [px, pz, s] of paths) {
    const i0 = Math.max(0, Math.floor((px - 1.2 - x0) / TEXEL)), i1 = Math.min(N - 1, Math.ceil((px + 1.2 - x0) / TEXEL));
    const k0 = Math.max(0, Math.floor((pz - 1.2 - z0) / TEXEL)), k1 = Math.min(N - 1, Math.ceil((pz + 1.2 - z0) / TEXEL));
    for (let k = k0; k <= k1; k++) {
      for (let i = i0; i <= i1; i++) {
        const wx = x0 + (i + 0.5) * TEXEL, wz = z0 + (k + 0.5) * TEXEL;
        const d = Math.hypot(wx - px, wz - pz) + 0.15 * Math.sin(wx * 3.1 + wz * 1.7) + 0.1 * Math.sin(wz * 4.3 - wx * 2.2);
        const v = Math.round(255 * s * Math.min(1, Math.max(0, (1.05 - d) / 0.5)));
        const o = (k * N + i) * 4 + 2;
        if (v > data[o]) data[o] = v;
      }
    }
  }
  tilledOrigin.value.set(x0, z0, size);
  tilledTexture.needsUpdate = true;
}

export function addTilledSoil(material) {
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous?.call(material, shader, renderer);
    shader.uniforms.uTilledMap = { value: tilledTexture };
    shader.uniforms.uTilledOrigin = tilledOrigin;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vTillXZ;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTillXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vTillXZ;\nuniform sampler2D uTilledMap;\nuniform vec3 uTilledOrigin;')
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
        {
          vec2 tuv = (vTillXZ - uTilledOrigin.xy) / uTilledOrigin.z;
          if (tuv.x > 0.0 && tuv.y > 0.0 && tuv.x < 1.0 && tuv.y < 1.0) {
            vec4 till = texture2D(uTilledMap, tuv);
            // (A worn path: the grass gone, bare earth trodden hard and pale.)
            float worn = smoothstep(0.08, 0.6, till.b) * 0.9;
            if (worn > 0.0) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.20, 0.145, 0.09) * (0.9 + 0.2 * fract(sin(dot(floor(vTillXZ * 3.0), vec2(12.9898, 78.233))) * 43758.5453)), worn);
            float inside = smoothstep(0.15, 0.6, till.r);
            if (inside > 0.0) {
              float furrow = smoothstep(0.35, 0.65, abs(fract(vTillXZ.y * 2.0) - 0.5) * 2.0); // (rows half a metre apart)
              // (Linear colours: dark turned earth #4a3424 in the furrows, #6a5038 on the ridges.)
              vec3 soil = mix(vec3(0.068, 0.034, 0.018), vec3(0.144, 0.081, 0.040), furrow);
              soil *= 1.0 - 0.35 * till.g;
              diffuseColor.rgb = mix(diffuseColor.rgb, soil, inside);
            }
          }
        }`,
      );
  };
  const previousKey = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () => `${previousKey ? previousKey() : ''}|tilled`;
  return material;
}
