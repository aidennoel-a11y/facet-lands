import { BufferAttribute, BufferGeometry, Mesh, MeshBasicMaterial } from 'three';

/**
 * Molten lava in the volcanoes that have it (see TerrainGenerator's
 * cones): a lake of it in the crater, and on some a live flow spilling
 * over the rim and running down the flank. It glows (unlit, so it shines
 * at night), a crust of darker, cooling rock drifting over it and
 * cracking to show the bright lava beneath. Built with the chunk holding
 * the volcano's top, seen from well off.
 */
export function createLavaLayer(config) {
  const uniforms = { uTime: { value: 0 } };
  const material = new MeshBasicMaterial({ color: 0xffffff });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aLava;\nvarying vec2 vLava;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLava = aLava;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying vec2 vLava;')
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
        // vLava: x = metres along the flow (or across the lake), y = across it.
        float t = uTime * 0.35;
        float a = sin(vLava.x * 0.45 - t * 2.0 + sin(vLava.y * 0.7 + vLava.x * 0.08) * 2.4);
        float b = sin(vLava.y * 0.55 + t + sin(vLava.x * 0.21 - t) * 1.8);
        float crust = smoothstep(-0.2, 0.55, a * 0.6 + b * 0.4);
        float cracks = 1.0 - smoothstep(0.0, 0.18, abs(a * 0.6 + b * 0.4 - 0.1));
        vec3 molten = mix(vec3(1.0, 0.36, 0.05), vec3(1.0, 0.78, 0.3), 0.5 + 0.5 * sin(t * 3.0 + vLava.x * 0.3));
        vec3 rock = vec3(0.16, 0.07, 0.04);
        diffuseColor.rgb = mix(molten, rock, crust * 0.85) + vec3(1.0, 0.55, 0.15) * cracks * crust * 0.6;`,
      );
  };
  material.customProgramCacheKey = () => 'lava';

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
      const cones = generator.volcanoes(x0, z0, x0 + size, z0 + size).filter((c) => c.lava && c.x >= x0 && c.x < x0 + size && c.z >= z0 && c.z < z0 + size);
      if (!cones.length) return null;
      const positions = [], lava = [];
      const push = (x, y, z, along, across) => {
        positions.push(x - x0, y, z - z0);
        lava.push(along, across);
      };
      for (const c of cones) {
        // The lake: a disc in the crater, below its rim.
        const level = generator.getBaseHeight(c.x, c.z) + c.depth * 0.3;
        const r = c.rc * 0.62, n = 20;
        for (let k = 0; k < n; k++) {
          const a0 = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2;
          push(c.x, level, c.z, 0, 0);
          push(c.x + Math.cos(a1) * r, level, c.z + Math.sin(a1) * r, Math.cos(a1) * r, Math.sin(a1) * r);
          push(c.x + Math.cos(a0) * r, level, c.z + Math.sin(a0) * r, Math.cos(a0) * r, Math.sin(a0) * r);
        }
        // The live flow: over the rim and down the flank, along the
        // volcano's first tongue of lava, narrowing as it cools.
        if (c.active && c.flows.length) {
          const f = c.flows[0];
          const ca = Math.cos(f.a), sa = Math.sin(f.a);
          let prev = null;
          for (let d = c.rc * 0.9; d < f.len * 0.85; d += 5) {
            const half = (4 + d * 0.035) * (1 - 0.5 * (d / f.len));
            const px = c.x + ca * d, pz = c.z + sa * d;
            const lx = px - sa * half, lz = pz + ca * half, rx = px + sa * half, rz = pz - ca * half;
            const row = [
              [lx, generator.getHeight(lx, lz) + 0.35, lz, d, -half],
              [rx, generator.getHeight(rx, rz) + 0.35, rz, d, half],
            ];
            if (prev) {
              push(...prev[0]); push(...row[0]); push(...prev[1]);
              push(...prev[1]); push(...row[0]); push(...row[1]);
            }
            prev = row;
          }
        }
      }
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
      geometry.setAttribute('aLava', new BufferAttribute(new Float32Array(lava), 2));
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
