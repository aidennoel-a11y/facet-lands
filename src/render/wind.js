import { MeshDepthMaterial, RGBADepthPacking, Vector2 } from 'three';

// Shared clock and strength for every wind-blown material; call updateWind()
// once per frame.
export const windTime = { value: 0 };
export const windStrength = { value: 1 };
// Which way it blows (the way the clouds drift).
export const windDirection = { value: new Vector2(0.95, 0.31) };

// Gusts: fronts of stronger wind a hundred-odd metres apart, rolling
// downwind across the land at about 9 m/s, their lines wavering. (The
// same in the shaders, where they bend the grass over in waves, and here,
// where the wind's sound swells as one passes.)
const GUST = /* glsl */ `
  float windGust(vec2 p, float t, vec2 dir, float strength) {
    float along = dot(p, dir), across = dot(p, vec2(-dir.y, dir.x));
    float w = along * 0.045 - t * 0.4 + 1.6 * sin(across * 0.011 + t * 0.05) + 0.7 * sin(across * 0.031 - along * 0.008);
    return smoothstep(0.55, 1.0, sin(w)) * smoothstep(0.1, 0.5, strength);
  }`;

/** How strong a gust is at (x, z) now (0..1), as the shaders have it. */
export function gustAt(x, z) {
  const d = windDirection.value, t = windTime.value;
  const along = x * d.x + z * d.y, across = -x * d.y + z * d.x;
  const w = along * 0.045 - t * 0.4 + 1.6 * Math.sin(across * 0.011 + t * 0.05) + 0.7 * Math.sin(across * 0.031 - along * 0.008);
  return smoothstep(0.55, 1, Math.sin(w)) * smoothstep(0.1, 0.5, windStrength.value);
}

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * Advances the wind. Its strength wanders slowly between still spells (a
 * few percent) and gusty periods, from three slow, out-of-step waves, so
 * calm and windy stretches last from a few tens of seconds to minutes.
 * Returns the strength, 0..1. `atLeast` raises it (storms are windy).
 */
export function updateWind(seconds, atLeast = 0) {
  windTime.value = seconds;
  const raw = (Math.sin(seconds * 0.043) + Math.sin(seconds * 0.027 + 2.1) + Math.sin(seconds * 0.011 + 4.2)) / 3;
  windStrength.value = Math.max(atLeast, 0.04 + 0.96 * smoothstep(-0.55, 0.55, raw));
  return windStrength.value;
}

/** Everyday word for a wind strength, for the HUD. */
export function describeWind(strength) {
  if (strength < 0.15) return 'Calm';
  if (strength < 0.45) return 'Light';
  if (strength < 0.75) return 'Breezy';
  return 'Windy';
}

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
export function addWind(material, { strength = 0.02, speed = 1.2, fade = null, gust = 0, still = null } = {}) {
  const f = (n) => n.toFixed(4);
  // (A gust bends it right over downwind, and shows the paler undersides:
  // \`vGust\` for the fragment shader.)
  const gustCode = gust
    ? `vGust = windGust(wOrigin.xz, uWindTime, uWindDir, uWindStrength) * wNear;
        transformed.xz += uWindDir * pow(max(transformed.y, 0.0), 1.5) * ${f(gust)} * vGust;`
    : '';
  const fadeCode = fade
    ? `transformed *= 1.0 - smoothstep(${f(fade[0])}, ${f(fade[1])}, distance(wOrigin.xz, cameraPosition.xz));`
    : '';
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous?.call(material, shader, renderer);
    shader.uniforms.uWindTime = windTime;
    shader.uniforms.uWindStrength = windStrength;
    shader.uniforms.uWindDir = windDirection;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nuniform float uWindTime;\nuniform float uWindStrength;\nuniform vec2 uWindDir;\nvarying float vGust;\n${GUST}`)
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 wOrigin = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        #else
          vec3 wOrigin = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        #endif
        vGust = 0.0;
        // (Past \`still\`, it stands still: too far off for its swaying to be seen, so not worked out.)
        ${still ? `float wNear = 1.0 - smoothstep(${f(still[0])}, ${f(still[1])}, distance(wOrigin.xz, cameraPosition.xz));\n        if (wNear > 0.0) {` : 'float wNear = 1.0;\n        {'}
        float wPhase = uWindTime * ${f(speed)} + wOrigin.x * 0.045 + wOrigin.z * 0.037;
        float wBend = pow(max(transformed.y, 0.0), 1.5) * ${f(strength)} * uWindStrength * wNear;
        transformed.x += (sin(wPhase) + 0.35 * sin(wPhase * 2.7 + position.z)) * wBend;
        transformed.z += (0.6 * cos(wPhase * 0.8) + 0.25 * sin(wPhase * 3.1 + position.x)) * wBend;
        ${gustCode}
        }
        ${fadeCode}`,
      );
    if (!shader.fragmentShader.includes('varying float vGust;')) shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vGust;');
  };
  const key = `wind-${strength}-${speed}-${fade}-${gust}-${still}`;
  material.customProgramCacheKey = () => key;
  return material;
}

/** Depth material for shadows that sways the same way as the visible mesh. */
export function windDepthMaterial(options) {
  return addWind(new MeshDepthMaterial({ depthPacking: RGBADepthPacking }), options);
}
