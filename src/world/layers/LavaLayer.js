import { BufferAttribute, BufferGeometry, DoubleSide, Mesh, MeshBasicMaterial } from 'three';

/**
 * Molten lava in the volcanoes that have it (see TerrainGenerator's
 * cones): a lake of it in the crater, and on some a live flow spilling over
 * the rim and down the flank in a channel between blocks of black basalt,
 * running under a rock roof in places (a lava tube) and showing through its
 * skylights. It glows (unlit, so it shines at night): plates of dark,
 * cooling crust drifting on it, split by bright cracks of molten rock,
 * the middle of a flow hotter and brighter than its edges.
 */
export function createLavaLayer(config) {
  const uniforms = { uTime: { value: 0 } };
  const material = new MeshBasicMaterial({ color: 0xffffff, side: DoubleSide });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aLava;\nvarying vec3 vLava;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLava = aLava;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        uniform float uTime;
        varying vec3 vLava;
        vec2 lavaHash(vec2 p) {
          p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
          return fract(sin(p) * 43758.5453);
        }
        // Distances to the nearest and next-nearest cell centres.
        vec2 lavaCells(vec2 x) {
          vec2 n = floor(x), f = fract(x);
          float f1 = 8.0, f2 = 8.0;
          for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
            vec2 g = vec2(float(i), float(j));
            vec2 o = lavaHash(n + g);
            o = 0.5 + 0.4 * sin(uTime * 0.25 + 6.2831 * o);
            vec2 r = g + o - f;
            float d = dot(r, r);
            if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
          }
          return vec2(sqrt(f1), sqrt(f2));
        }`,
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
        // vLava: x = metres along the flow (or across the lake), y = metres
        // across it, z = how near its edge (0 middle, 1 edge; 2..3 in a lake).
        float lake = step(1.5, vLava.z);
        float edge = vLava.z - 2.0 * lake;
        // Lakes: broad plates of crust drifting slowly, split by glowing
        // seams. Flows: smaller plates, stretched and carried downhill fast,
        // the lava between them bright.
        vec2 uv = lake > 0.5 ? vLava.xy * 0.11 - vec2(uTime * 0.03, uTime * 0.02) : vec2(vLava.x * 0.16 - uTime * 0.5, vLava.y * 0.34);
        vec2 c = lavaCells(uv);
        vec2 c2 = lavaCells(uv * 2.7 + 17.0);
        float seam = 1.0 - smoothstep(0.0, lake > 0.5 ? 0.09 : 0.16, c.y - c.x);
        float fine = 1.0 - smoothstep(0.0, 0.07, c2.y - c2.x);
        float heat = clamp(1.0 - edge, 0.0, 1.0);
        vec3 molten = mix(vec3(1.0, 0.38, 0.05), vec3(1.0, 0.78, 0.3), seam * heat);
        vec3 crust = mix(vec3(0.07, 0.03, 0.025), vec3(0.28, 0.07, 0.02), (1.0 - c.x) * 0.6 + 0.4 * heat * (1.0 - lake));
        float open = lake > 0.5 ? max(seam, fine * 0.35) * (0.7 + 0.3 * heat) : clamp(seam + fine * 0.5 + 0.55 * heat * heat, 0.0, 1.0);
        float pulse = 0.88 + 0.12 * sin(uTime * 1.7 + c.x * 9.0 + vLava.x * 0.05);
        diffuseColor.rgb = mix(crust, molten * pulse, open);`,
      );
  };
  material.customProgramCacheKey = () => 'lava-cells';

  return {
    name: 'lava',
    material,

    update(time) {
      uniforms.uTime.value = time;
    },

    reuseKey: ({ lod }) => (lod > 3 ? 'none' : 'lava'),

    build({ cx, cz, lod, generator }) {
      if (lod > 3 || !generator.volcanoes) return null;
      const size = config.chunkSize;
      const x0 = cx * size, z0 = cz * size;
      // (Each volcano's lava is built with the chunk holding its summit.)
      const cones = generator.volcanoes(x0, z0, x0 + size, z0 + size).filter((c) => c.lava && c.x >= x0 && c.x < x0 + size && c.z >= z0 && c.z < z0 + size);
      if (!cones.length) return null;
      const positions = [], lava = [];
      const push = (x, y, z, along, across, edge) => {
        positions.push(x - x0, y, z - z0);
        lava.push(along, across, edge);
      };
      for (const c of cones) {
        // The lake: a disc in the crater, below its rim.
        const level = generator.getBaseHeight(c.x, c.z) + c.depth * 0.3;
        const r = c.rc * 0.62, n = 28;
        for (let k = 0; k < n; k++) {
          const a0 = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2;
          push(c.x, level, c.z, 0, 0, 2);
          push(c.x + Math.cos(a1) * r, level, c.z + Math.sin(a1) * r, Math.cos(a1) * r, Math.sin(a1) * r, 3);
          push(c.x + Math.cos(a0) * r, level, c.z + Math.sin(a0) * r, Math.cos(a0) * r, Math.sin(a0) * r, 3);
        }
        // The live flow: along its channel (under the roof where it's a tube).
        if (c.active && c.flows.length) {
          let prev = null;
          const f = c.flows[0];
          for (let d = c.rc * 1.02; d < f.len * 0.85; d += 3) {
            const p = generator.lavaPath(c, d);
            if (!p) continue;
            const ca = Math.cos(p.angle), sa = Math.sin(p.angle);
            const px = c.x + ca * d, pz = c.z + sa * d;
            const floor = generator.getBaseHeight(px, pz) - (p.tube ? 3.6 : 0);
            if (floor < config.seaLevel + 0.3) break; // (into the sea: it stops, cooling)
            const y = floor + 0.7;
            const half = p.half * 0.95;
            const row = [-1, -0.5, 0, 0.5, 1].map((t) => {
              const lx = px - sa * half * t, lz = pz + ca * half * t;
              return [lx, y, lz, d, half * t, Math.abs(t)];
            });
            if (prev) {
              for (let k = 0; k < 4; k++) {
                push(...prev[k]); push(...row[k]); push(...prev[k + 1]);
                push(...prev[k + 1]); push(...row[k]); push(...row[k + 1]);
              }
            }
            prev = row;
          }
        }
      }
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
      geometry.setAttribute('aLava', new BufferAttribute(new Float32Array(lava), 3));
      geometry.computeBoundingSphere();
      const mesh = new Mesh(geometry, material);
      mesh.name = 'lava';
      return mesh;
    },

    dispose(mesh) {
      mesh.geometry.dispose();
    },
  };
}
