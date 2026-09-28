import { ClampToEdgeWrapping, Color, DataTexture, LinearFilter, RedFormat, UnsignedByteType, Vector2, Vector4 } from 'three';

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

const N = 128; // texels a side

/**
 * The shadows of the clouds, sliding over the land as they drift: a small
 * map of the ground seen from above, the whole cloud field across (about
 * 20 m a texel, so the shadows are soft), repainted every frame with a
 * soft ellipse under each cloud, thrown along the light (see paint). Every
 * material patched with addCloudShadow dims its direct light where the map
 * is dark, so the shadows lie across the land to the edge of the view.
 */
const data = new Uint8Array(N * N);
const acc = new Float32Array(N * N);
const texture = new DataTexture(data, N, N, RedFormat, UnsignedByteType);
texture.magFilter = texture.minFilter = LinearFilter;
texture.wrapS = texture.wrapT = ClampToEdgeWrapping;
texture.needsUpdate = true;

export const cloudShadowUniforms = {
  uCloudShadow: { value: texture },
  uCloudOrigin: { value: new Vector2() }, // world x, z of the map's corner
  uCloudSize: { value: 2600 }, // metres across
  uCloudStrength: { value: 0 }, // how much of the direct light a cloud takes (0..1)
  // Mist lying in the valleys (see addCloudShadow): how much, how high its
  // top lies (world y), and its colour.
  uMist: { value: 0 },
  uMistTop: { value: 0 },
  uMistColor: { value: new Color(0xdfe6ea) },
  // Ground burnt by a wildfire (see Wildfires): up to eight scars, each
  // (x, z, radius, how burnt 0..1).
  uBurns: { value: Array.from({ length: 8 }, () => new Vector4(0, 0, 0, 0)) },
};

/**
 * Paints the cloud shadows. `clouds` are the cloud Object3Ds (see Clouds),
 * `focus` where the map is centred, `light` the direction towards the sun
 * (or moon), `ground` the height of the land about here, `range` the map's
 * width in metres, and `strength` how dark a shadow is.
 */
export function paintCloudShadows(clouds, focus, light, ground, range, strength) {
  const u = cloudShadowUniforms;
  const texel = range / N;
  // (The map's corner snapped to whole texels, so the shadows don't shimmer as you move.)
  const ox = Math.floor((focus.x - range / 2) / texel) * texel, oz = Math.floor((focus.z - range / 2) / texel) * texel;
  u.uCloudOrigin.value.set(ox, oz);
  u.uCloudSize.value = range;
  u.uCloudStrength.value = strength;
  acc.fill(0);
  if (strength > 0.001) {
    const up = Math.max(0.2, light.y);
    for (const cloud of clouds) {
      if (!cloud.visible) continue;
      const p = cloud.position;
      // Down along the light onto the land.
      const drop = Math.max(0, p.y - ground);
      const cx = p.x - (light.x / up) * drop, cz = p.z - (light.z / up) * drop;
      const grown = cloud.scale.x / cloud.userData.scale.x;
      const a = cloud.userData.reach * 0.75 * grown, b = cloud.userData.reach * 0.45 * grown;
      const ca = Math.cos(cloud.rotation.y), sa = Math.sin(cloud.rotation.y);
      const dark = cloud.userData.wispy ? 0.35 : 1;
      const i0 = Math.max(0, Math.floor((cx - a - ox) / texel)), i1 = Math.min(N - 1, Math.ceil((cx + a - ox) / texel));
      const j0 = Math.max(0, Math.floor((cz - a - oz) / texel)), j1 = Math.min(N - 1, Math.ceil((cz + a - oz) / texel));
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const dx = ox + (i + 0.5) * texel - cx, dz = oz + (j + 0.5) * texel - cz;
          // (In the cloud's own frame: its length along its local x.)
          const lx = dx * ca - dz * sa, lz = dx * sa + dz * ca;
          const r = Math.hypot(lx / a, lz / b);
          if (r >= 1) continue;
          const v = dark * (1 - smoothstep(0.45, 1, r));
          const k = j * N + i;
          if (v > acc[k]) acc[k] = v;
        }
      }
    }
  }
  for (let k = 0; k < N * N; k++) data[k] = acc[k] * 255;
  texture.needsUpdate = true;
}

/**
 * Patches a material so the cloud shadows dim its direct light; and so the
 * valley mist lies over it (see uMist): whatever lies low, under the
 * mist's top, is veiled, the more so the further off it is (the more mist
 * there is to look through), so from up high a valley below lies under a
 * white sheet, and down in it the woods fade into it.
 */
export function addCloudShadow(material) {
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous?.call(material, shader, renderer);
    Object.assign(shader.uniforms, cloudShadowUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vCloudXZ;\nvarying float vCloudY;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        {
        #ifdef USE_INSTANCING
          vec4 cw = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
        #else
          vec4 cw = modelMatrix * vec4(transformed, 1.0);
        #endif
          vCloudXZ = cw.xz;
          vCloudY = cw.y;
        }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uCloudShadow;\nuniform vec2 uCloudOrigin;\nuniform float uCloudSize;\nuniform float uCloudStrength;\nvarying vec2 vCloudXZ;\nvarying float vCloudY;\nuniform float uMist;\nuniform float uMistTop;\nuniform vec3 uMistColor;\nuniform vec4 uBurns[8];')
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
        reflectedLight.directDiffuse *= 1.0 - uCloudStrength * texture2D(uCloudShadow, (vCloudXZ - uCloudOrigin) / uCloudSize).r;
        {
          // Burnt: charred black where a fire went through, ragged at the edge.
          float burnt = 0.0;
          float rag = fract(sin(dot(floor(vCloudXZ * 0.7), vec2(12.9898, 78.233))) * 43758.5453);
          for (int i = 0; i < 8; i++) {
            vec4 b = uBurns[i];
            if (b.w > 0.0) burnt = max(burnt, b.w * (1.0 - smoothstep(b.z * (0.55 + 0.25 * rag), b.z, distance(vCloudXZ, b.xy))));
          }
          vec3 char = mix(vec3(1.0), vec3(0.16, 0.13, 0.11), burnt);
          reflectedLight.directDiffuse *= char;
          reflectedLight.indirectDiffuse *= char;
        }`,
      )
      .replace(
        '#include <fog_fragment>',
        `#include <fog_fragment>
        if (uMist > 0.001) {
          float under = smoothstep(uMistTop, uMistTop - 12.0, vCloudY);
          float through = 1.0 - exp(-distance(cameraPosition, vec3(vCloudXZ.x, vCloudY, vCloudXZ.y)) * 0.008);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, uMistColor, uMist * under * (0.25 + 0.75 * through));
        }`,
      );
  };
  const previousKey = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () => `${previousKey ? previousKey() : ''}|cloud-shadow-mist`;
  return material;
}
