import { Vector4 } from 'three';

/**
 * Tilled ground: the plots you've dug with a hoe, painted straight onto
 * the terrain (no block of soil laid on top): dark turned earth in
 * furrows across the plot, the ridges a shade lighter, darker still where
 * it's been watered, its edges ragged into the grass round it. Filled in
 * each moment with the plots nearest you (see main): (x, z, turn, watered
 * 0..1), unused ones far away.
 */
export const TILLED = 24;
export const tilledUniform = { value: Array.from({ length: TILLED }, () => new Vector4(1e9, 1e9, 0, 0)) };
export const TILLED_HALF = 1.1; // half a plot's side (m), a little past its crops

export function addTilledSoil(material) {
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous?.call(material, shader, renderer);
    shader.uniforms.uTilled = tilledUniform;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vTillXZ;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTillXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec2 vTillXZ;\nuniform vec4 uTilled[${TILLED}];`)
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
        for (int i = 0; i < ${TILLED}; i++) {
          vec4 p = uTilled[i];
          vec2 d = vTillXZ - p.xy;
          if (abs(d.x) > 2.0 || abs(d.y) > 2.0) continue;
          float c = cos(p.z), s = sin(p.z);
          vec2 l = vec2(c * d.x - s * d.y, s * d.x + c * d.y);
          // (Ragged edges: the turned earth frays out into the grass.)
          float rag = 0.12 * sin(l.x * 9.0 + l.y * 4.0) + 0.08 * sin(l.y * 13.0 - l.x * 7.0);
          float inside = 1.0 - smoothstep(${TILLED_HALF.toFixed(2)} - 0.15, ${TILLED_HALF.toFixed(2)} + 0.1, max(abs(l.x), abs(l.y)) + rag);
          if (inside <= 0.0) continue;
          float furrow = smoothstep(0.35, 0.65, abs(fract(l.y * 2.0) - 0.5) * 2.0); // (rows half a metre apart)
          // (Linear colours: dark turned earth #4a3424 in the furrows, #6a5038 on the ridges.)
          vec3 soil = mix(vec3(0.068, 0.034, 0.018), vec3(0.144, 0.081, 0.040), furrow);
          soil *= 1.0 - 0.35 * p.w;
          diffuseColor.rgb = mix(diffuseColor.rgb, soil, inside);
        }`,
      );
  };
  const previousKey = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () => `${previousKey ? previousKey() : ''}|tilled`;
  return material;
}
