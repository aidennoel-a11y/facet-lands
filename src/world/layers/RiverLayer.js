import { BufferAttribute, BufferGeometry, Color, Mesh, MeshPhongMaterial } from 'three';
import { hash2 } from '../../noise/random.js';

const DEEP = new Color(0x4fbfc4).lerp(new Color(0x2c67b0), 0.45);
const SHALLOW = new Color(0x4fbfc4).lerp(new Color(0x2c67b0), 0.15);
// The lake and sea's colours (as WaterLayer), which a river turns into at its mouth.
const LAKE_SHALLOW = new Color(0x4fbfc4);
const LAKE_DEEP = new Color(0x2c67b0);
const color = new Color();
const lakeColor = new Color();
const GRID = 2; // metres between the surface's vertices
const MARGIN = 3; // how far past a channel's edge the surface runs on under the banks

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * River, stream and pond water (see Rivers) as one surface that fills the
 * trenches: each chunk near you gets a sheet sampled every 2 m at the level
 * of the water there (see Rivers.waterAt), running a little way on under the banks so the
 * land itself cuts the waterline. So a river flows straight out of its
 * source pond, and two rivers meeting merge into one sheet. At a lake or
 * the sea it takes on that water's colour and runs on over it a little,
 * so the two meet without a seam (it's drawn first, so the lake doesn't
 * show through it twice).
 *
 * The water drifts slowly downstream: ripples of light carried along the
 * flow (faster where it's steeper), and white water down rapids and falls.
 */
export function createRiverLayer(skyColor) {
  const uniforms = { uTime: { value: 0 }, uSky: { value: skyColor } };
  const material = new MeshPhongMaterial({
    vertexColors: true,
    transparent: true,
    flatShading: true,
    shininess: 80,
    specular: 0x6f8fb0,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uSky = uniforms.uSky;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 flow;\nvarying vec3 vFlow;\nvarying vec2 vWorld;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFlow = flow;\nvWorld = (modelMatrix * vec4(transformed, 1.0)).xz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        uniform float uTime;
        uniform vec3 uSky;
        varying vec3 vFlow;
        varying vec2 vWorld;
        float cellHash(vec2 p) {
          vec3 q = fract(vec3(p.xyx) * 0.1031);
          q += dot(q, q.yzx + 33.33);
          return fract((q.x + q.y) * q.z);
        }
        float valueNoise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(cellHash(i), cellHash(i + vec2(1.0, 0.0)), f.x), mix(cellHash(i + vec2(0.0, 1.0)), cellHash(i + vec2(1.0, 1.0)), f.x), f.y);
        }
        float ripples(vec2 p) {
          return valueNoise(p * 0.32) * 0.6 + valueNoise(p * 0.85 + 13.0) * 0.4;
        }`,
      )
      .replace(
        '#include <fog_fragment>',
        /* glsl */ `// flow: xy = the current (m/s), z = white water. The ripples are carried
        // along it, two copies half a cycle apart cross-fading, so they can
        // flow on for ever without stretching (a flow map).
        vec2 current = vFlow.xy;
        vec2 at = mod(vWorld, 2048.0);
        float cycle = 3.0;
        float p0 = fract(uTime / cycle), p1 = fract(uTime / cycle + 0.5);
        float w0 = 1.0 - abs(2.0 * p0 - 1.0);
        float r = ripples(at - current * p0 * cycle) * w0 + ripples(at - current * p1 * cycle + vec2(7.3, 2.1)) * (1.0 - w0);
        float moving = clamp(length(current) * 2.0, 0.0, 1.0);
        gl_FragColor.rgb += smoothstep(0.6, 0.85, r) * (0.05 + 0.1 * moving + 0.25 * vFlow.z);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.93, 0.97, 0.98), vFlow.z * (0.5 + 0.3 * r));
        gl_FragColor.a = mix(gl_FragColor.a, 1.0, vFlow.z * 0.6);
        float fresnel = pow(1.0 - clamp(dot(normal, normalize(vViewPosition) * -1.0), 0.0, 1.0), 3.0);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uSky, fresnel * 0.3 * (1.0 - vFlow.z));
        #include <fog_fragment>`,
      );
  };
  material.customProgramCacheKey = () => 'river';

  return {
    name: 'rivers',
    material,

    update(time) {
      uniforms.uTime.value = time;
    },

    reuseKey: ({ lod }) => (lod > 1 ? 'none' : 'near'),

    build({ cx, cz, lod, generator, config }) {
      if (lod > 1 || !generator.rivers) return null;
      const { chunkSize, seaLevel } = config;
      const rivers = generator.rivers;
      const x0 = cx * chunkSize, z0 = cz * chunkSize;
      if (!rivers.inBox(x0, z0, x0 + chunkSize, z0 + chunkSize).length) return null;

      // The water at each grid point: its level, current, white water, how
      // far in from the channel's edge, and how much it has given way to a
      // lake or the sea it runs into.
      const cells = chunkSize / GRID;
      const n = cells + 1;
      const level = new Float32Array(n * n).fill(NaN);
      const flow = new Float32Array(n * n * 3);
      const inset = new Float32Array(n * n);
      const river = new Float32Array(n * n); // 1 in the river, 0 out in the lake it flows into
      const depth = new Float32Array(n * n); // of the water, for the lake's colours
      let any = false;
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          const x = x0 + i * GRID, z = z0 + j * GRID;
          const w = rivers.waterAt(x, z, MARGIN);
          if (!w) continue;
          const k = j * n + i;
          river[k] = smoothstep(seaLevel - 0.6, seaLevel + 0.3, generator.getBaseHeight(x, z));
          // Out over a lake it sits a hair higher, clear of the lake's ripples.
          level[k] = w.level + 0.03 + 0.07 * (1 - river[k]);
          depth[k] = w.level - generator.getHeight(x, z);
          const drop = Math.max(0, w.drop);
          const speed = w.pond ? 0 : 0.3 + Math.min(1.8, drop * 9);
          flow[k * 3] = w.fx * speed * river[k];
          flow[k * 3 + 1] = w.fz * speed * river[k];
          flow[k * 3 + 2] = Math.min(1, Math.max(0, (drop - 0.25) / 0.5));
          inset[k] = w.inset;
          any = true;
        }
      }
      if (!any) return null;

      const positions = [];
      const colors = [];
      const flows = [];
      const seed = generator.seed ^ 0x3c6ef372;
      const tri = (a, b, c, shade) => {
        if (Number.isNaN(level[a]) || Number.isNaN(level[b]) || Number.isNaN(level[c])) return;
        const r = (river[a] + river[b] + river[c]) / 3;
        if (r === 0) return; // well out in the lake
        const deep = smoothstep(0, 3, (inset[a] + inset[b] + inset[c]) / 3);
        const t = smoothstep(-1, 16, (depth[a] + depth[b] + depth[c]) / 3);
        lakeColor.copy(LAKE_SHALLOW).lerp(LAKE_DEEP, t);
        color.copy(SHALLOW).lerp(DEEP, deep).lerp(lakeColor, 1 - r).multiplyScalar(shade);
        const alpha = 0.72 + 0.14 * deep + (0.68 + 0.26 * t - 0.72 - 0.14 * deep) * (1 - r);
        for (const k of [a, b, c]) {
          positions.push((k % n) * GRID, level[k], Math.floor(k / n) * GRID);
          colors.push(color.r, color.g, color.b, alpha);
          flows.push(flow[k * 3], flow[k * 3 + 1], flow[k * 3 + 2]);
        }
      };
      for (let j = 0; j < cells; j++) {
        for (let i = 0; i < cells; i++) {
          const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
          const gi = cx * cells + i, gj = cz * cells + j;
          const s0 = 0.96 + hash2(gi * 2, gj, seed) * 0.06;
          const s1 = 0.96 + hash2(gi * 2 + 1, gj, seed) * 0.06;
          if (hash2(gi, gj, seed + 1) < 0.5) {
            tri(a, c, d, s0);
            tri(a, d, b, s1);
          } else {
            tri(a, c, b, s0);
            tri(b, c, d, s1);
          }
        }
      }
      if (!positions.length) return null;

      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
      geometry.setAttribute('color', new BufferAttribute(new Float32Array(colors), 4));
      geometry.setAttribute('flow', new BufferAttribute(new Float32Array(flows), 3));
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      const mesh = new Mesh(geometry, material);
      mesh.name = 'river';
      mesh.renderOrder = 0; // before the lake or sea, so where it runs on over one that doesn't show through
      mesh.receiveShadow = true;
      return mesh;
    },

    dispose(mesh) {
      mesh.geometry.dispose();
    },
  };
}
