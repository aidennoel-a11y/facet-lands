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
    // Each corner of the land is turned earth or not, and a whole face takes
    // its corner's word for it (flat, not blended): so it's the ground's own
    // faces, under the plot, that are brown earth now, each a shade of its own.
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nuniform vec4 uTilled[${TILLED}];\nflat out vec3 vTill;`)
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `#include <begin_vertex>
        {
          vec2 xz = (modelMatrix * vec4(transformed, 1.0)).xz;
          vTill = vec3(0.0, 0.0, fract(sin(dot(floor(xz * 3.0), vec2(12.9898, 78.233))) * 43758.5453));
          for (int i = 0; i < ${TILLED}; i++) {
            vec4 p = uTilled[i];
            vec2 d = xz - p.xy;
            if (abs(d.x) > 3.0 || abs(d.y) > 3.0) continue;
            float c = cos(p.z), s = sin(p.z);
            vec2 l = vec2(c * d.x - s * d.y, s * d.x + c * d.y);
            if (max(abs(l.x), abs(l.y)) < ${(TILLED_HALF + 0.6).toFixed(2)}) vTill = vec3(1.0, p.w, vTill.z);
          }
        }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nflat in vec3 vTill;')
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
        if (vTill.x > 0.5) {
          // (Linear colours: turned earth, #6a5038 to #4a3424, darker where it's been watered.)
          vec3 soil = mix(vec3(0.068, 0.034, 0.018), vec3(0.144, 0.081, 0.040), vTill.z);
          diffuseColor.rgb = soil * (1.0 - 0.35 * vTill.y);
        }`,
      );
  };
  const previousKey = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () => `${previousKey ? previousKey() : ''}|tilled-faces`;
  return material;
}
