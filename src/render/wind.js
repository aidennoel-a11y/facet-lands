import { MeshDepthMaterial, RGBADepthPacking } from 'three';

// Shared clock for every wind-blown material; main.js advances it.
export const windTime = { value: 0 };

/**
 * Patches a material so its vertices sway in the wind. Sway grows with a
 * vertex's height above the model's base (y = 0), so trunks and blade roots
 * stay planted. Each instance gets its own phase from its world position.
 *
 * Options:
 *   strength  metres of sway per metre^1.5 of height
 *   speed     how fast the gusts come
 *   fade      [start, end] distance from the camera over which instances
 *             shrink to nothing (used for grass), or null
 */
export function addWind(material, { strength = 0.02, speed = 1.2, fade = null } = {}) {
  const f = (n) => n.toFixed(4);
  const fadeCode = fade
    ? `transformed *= 1.0 - smoothstep(${f(fade[0])}, ${f(fade[1])}, distance(wOrigin.xz, cameraPosition.xz));`
    : '';
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous?.call(material, shader, renderer);
    shader.uniforms.uWindTime = windTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWindTime;')
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 wOrigin = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        #else
          vec3 wOrigin = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        #endif
        float wPhase = uWindTime * ${f(speed)} + wOrigin.x * 0.045 + wOrigin.z * 0.037;
        float wBend = pow(max(transformed.y, 0.0), 1.5) * ${f(strength)};
        transformed.x += (sin(wPhase) + 0.35 * sin(wPhase * 2.7 + position.z)) * wBend;
        transformed.z += (0.6 * cos(wPhase * 0.8) + 0.25 * sin(wPhase * 3.1 + position.x)) * wBend;
        ${fadeCode}`,
      );
  };
  const key = `wind-${strength}-${speed}-${fade}`;
  material.customProgramCacheKey = () => key;
  return material;
}

/** Depth material for shadows that sways the same way as the visible mesh. */
export function windDepthMaterial(options) {
  return addWind(new MeshDepthMaterial({ depthPacking: RGBADepthPacking }), options);
}
