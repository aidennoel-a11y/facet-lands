import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Mesh,
  MeshLambertMaterial,
  MeshPhongMaterial,
} from 'three';
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
 * The water is see-through, and flows: light streaks in chevrons pointing
 * downstream drift along it (quicker where it's steeper); white water down
 * rapids and falls. Waterfalls
 * throw blocky spray: cubes of water tumbling over the lip and splashing
 * up where it lands (all worked out on the GPU from the time).
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
      .replace('#include <common>', '#include <common>\nattribute vec4 flow;\nattribute float streaks;\nvarying vec4 vFlow;\nvarying float vStreaks;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFlow = flow;\nvStreaks = streaks;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform vec3 uSky;\nvarying vec4 vFlow;\nvarying float vStreaks;')
      .replace(
        '#include <fog_fragment>',
        /* glsl */ `// flow: x = metres along the river, y = out from its middle (1 at the
        // channel's edge), z = speed, w = white water.
        float phase = vFlow.x * 0.42 - vFlow.y * 1.6 - uTime * vFlow.z * 2.4;
        float streak = smoothstep(0.72, 0.97, sin(phase) * 0.5 + 0.5 + 0.35 * sin(vFlow.x * 0.11 + vFlow.y * 2.3));
        gl_FragColor.rgb += streak * step(0.01, vFlow.z) * (0.13 + 0.25 * vFlow.w) * vStreaks;
        gl_FragColor.a = min(1.0, gl_FragColor.a + streak * 0.2 * step(0.01, vFlow.z) * vStreaks);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.93, 0.97, 0.98), vFlow.w * (0.55 + 0.25 * sin(phase * 2.0)));
        gl_FragColor.a = mix(gl_FragColor.a, 1.0, vFlow.w * 0.6);
        float fresnel = pow(1.0 - clamp(dot(normal, normalize(vViewPosition) * -1.0), 0.0, 1.0), 3.0);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uSky, fresnel * 0.3 * (1.0 - vFlow.w));
        #include <fog_fragment>`,
      );
  };
  material.customProgramCacheKey = () => 'river';

  // Waterfall spray: little cubes, each flying on its own arc (start, velocity,
  // how long it lives, when it starts) and shrinking away as it lands.
  const cube = new BoxGeometry(1, 1, 1);
  const sprayMaterial = new MeshLambertMaterial({ color: 0xeef7fa, emissive: 0x4a6068 });
  sprayMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nattribute vec3 aStart;\nattribute vec3 aVelocity;\nattribute vec3 aLife;')
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `// aLife: x = lifetime (s), y = phase (0..1), z = size.
        float age = fract(uTime / aLife.x + aLife.y) * aLife.x;
        float k = age / aLife.x;
        float spin = aLife.y * 40.0 + age * 3.0;
        vec3 p = position;
        p.xz = mat2(cos(spin), sin(spin), -sin(spin), cos(spin)) * p.xz;
        vec3 transformed = p * aLife.z * (1.0 - k * k) + aStart + aVelocity * age + vec3(0.0, -4.9 * age * age, 0.0);`,
      );
  };
  sprayMaterial.customProgramCacheKey = () => 'spray';

  /** Spray for each waterfall in the chunk: cubes pouring over the lip, and splashing up at the foot. */
  function spray(rivers, x0, z0, chunkSize) {
    const starts = [], velocities = [], lives = [];
    let n = 0;
    for (const course of rivers) {
      const P = course.points;
      for (let i = 0; i < P.length - 1; i++) {
        const a = P[i], b = P[i + 1];
        const run = Math.hypot(b.x - a.x, b.z - a.z) || 1;
        const fall = a.level - b.level;
        if (fall / run < 0.4 || fall < 0.8) continue;
        if (a.x < x0 || a.x >= x0 + chunkSize || a.z < z0 || a.z >= z0 + chunkSize) continue;
        const ux = (b.x - a.x) / run, uz = (b.z - a.z) / run;
        const width = Math.max(1.5, Math.max(a.width, b.width) * 0.8);
        let seed = Math.floor(a.x * 13 + a.z * 7) >>> 0;
        const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
        const drop = Math.sqrt((2 * (fall + 0.3)) / 9.8); // seconds to fall
        const pour = Math.round(10 + width * 4), splash = Math.round(12 + width * 4);
        for (let k = 0; k < pour; k++) {
          const across = (rand() - 0.5) * width;
          starts.push(a.x - x0 - uz * across, a.level + 0.1, a.z - z0 + ux * across);
          const v = 1.2 + rand() * 1.2;
          velocities.push(ux * v, rand() * 0.4, uz * v);
          lives.push(drop, rand(), 0.22 + rand() * 0.25);
        }
        for (let k = 0; k < splash; k++) {
          const across = (rand() - 0.5) * width * 1.2;
          const out = rand() * 1.5;
          starts.push(b.x - x0 - uz * across + ux * out, b.level + 0.05, b.z - z0 + ux * across + uz * out);
          const up = 1.5 + rand() * 2.5 + Math.min(2, fall * 0.4);
          const a2 = rand() * Math.PI * 2, side = 0.6 + rand() * 1.6;
          velocities.push(Math.cos(a2) * side + ux * 0.8, up, Math.sin(a2) * side + uz * 0.8);
          lives.push((2 * up) / 9.8, rand(), 0.15 + rand() * 0.25);
        }
        n += pour + splash;
      }
    }
    if (!n) return null;
    const geometry = cube.clone();
    geometry.setAttribute('aStart', new InstancedBufferAttribute(new Float32Array(starts), 3));
    geometry.setAttribute('aVelocity', new InstancedBufferAttribute(new Float32Array(velocities), 3));
    geometry.setAttribute('aLife', new InstancedBufferAttribute(new Float32Array(lives), 3));
    const mesh = new InstancedMesh(geometry, sprayMaterial, n);
    mesh.frustumCulled = false; // it moves on the GPU; there are only a few
    mesh.name = 'spray';
    return mesh;
  }

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
      const courses = rivers.inBox(x0, z0, x0 + chunkSize, z0 + chunkSize);
      if (!courses.length) return null;

      // The water at each grid point: its level, current, white water, how
      // far in from the channel's edge, and how much it has given way to a
      // lake or the sea it runs into.
      const cells = chunkSize / GRID;
      const n = cells + 1;
      const level = new Float32Array(n * n).fill(NaN);
      const flow = new Float32Array(n * n * 4);
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
          flow[k * 4] = w.along;
          flow[k * 4 + 1] = Math.min(1.5, w.across);
          flow[k * 4 + 2] = w.pond ? 0 : (0.6 + Math.min(2.4, drop * 6)) * river[k];
          flow[k * 4 + 3] = Math.min(1, Math.max(0, (drop - 0.25) / 0.5));
          inset[k] = w.inset;
          any = true;
        }
      }
      if (!any) return null;

      const positions = [];
      const colors = [];
      const flows = [];
      const streaks = [];
      const seed = generator.seed ^ 0x3c6ef372;
      const tri = (a, b, c, shade) => {
        if (Number.isNaN(level[a]) || Number.isNaN(level[b]) || Number.isNaN(level[c])) return;
        const r = (river[a] + river[b] + river[c]) / 3;
        if (r === 0) return; // well out in the lake
        const deep = smoothstep(0, 3, (inset[a] + inset[b] + inset[c]) / 3);
        const t = smoothstep(-1, 16, (depth[a] + depth[b] + depth[c]) / 3);
        lakeColor.copy(LAKE_SHALLOW).lerp(LAKE_DEEP, t);
        color.copy(SHALLOW).lerp(DEEP, deep).lerp(lakeColor, 1 - r).multiplyScalar(shade);
        // Where two rivers meet, their distances along don't match: no
        // streaks on the few faces that straddle the two.
        const spread = Math.max(flow[a * 4], flow[b * 4], flow[c * 4]) - Math.min(flow[a * 4], flow[b * 4], flow[c * 4]);
        const streaky = spread < 8 ? 1 : 0;
        const clear = 0.5 + 0.18 * deep; // see-through, more so at the edges
        const alpha = clear + (0.68 + 0.26 * t - clear) * (1 - r);
        for (const k of [a, b, c]) {
          positions.push((k % n) * GRID, level[k], Math.floor(k / n) * GRID);
          colors.push(color.r, color.g, color.b, alpha);
          flows.push(flow[k * 4], flow[k * 4 + 1], flow[k * 4 + 2], flow[k * 4 + 3]);
          streaks.push(streaky);
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
      geometry.setAttribute('flow', new BufferAttribute(new Float32Array(flows), 4));
      geometry.setAttribute('streaks', new BufferAttribute(new Float32Array(streaks), 1));
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      const mesh = new Mesh(geometry, material);
      mesh.name = 'river';
      mesh.renderOrder = 0; // before the lake or sea, so where it runs on over one that doesn't show through
      mesh.receiveShadow = true;
      const group = new Group();
      group.name = 'rivers';
      group.add(mesh);
      const falls = spray(courses, x0, z0, chunkSize);
      if (falls) group.add(falls);
      return group;
    },

    dispose(group) {
      for (const child of group.children) {
        child.geometry.dispose();
        if (child.isInstancedMesh) child.dispose();
      }
    },
  };
}
