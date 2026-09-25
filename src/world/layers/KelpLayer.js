import { BufferAttribute, BufferGeometry, Color, InstancedMesh, Matrix4, MeshLambertMaterial, Quaternion, Vector3 } from 'three';
import { hash2 } from '../../noise/random.js';
import { windTime } from '../../render/wind.js';

/**
 * One kelp plant, a metre tall (it's stretched to reach the surface): a
 * thin stalk wandering up, long blades hanging off it on alternate sides,
 * and a spread of them floating at the top.
 */
function plant() {
  const pos = [];
  const quad = (a, b, c, d) => pos.push(...a, ...b, ...c, ...a, ...c, ...d);
  const nodes = 8;
  let px = 0, pz = 0;
  const stalk = [];
  for (let k = 0; k <= nodes; k++) {
    stalk.push([px, k / nodes, pz]);
    px += (hash2(k, 1, 77) - 0.5) * 0.12;
    pz += (hash2(k, 2, 77) - 0.5) * 0.12;
  }
  for (let k = 0; k < nodes; k++) {
    const [x0, y0, z0] = stalk[k], [x1, y1, z1] = stalk[k + 1];
    const w = 0.035;
    quad([x0 - w, y0, z0], [x0 + w, y0, z0], [x1 + w, y1, z1], [x1 - w, y1, z1]);
    quad([x0, y0, z0 - w], [x0, y0, z0 + w], [x1, y1, z1 + w], [x1, y1, z1 - w]);
    // A blade: long and narrow, hanging out and down from the node.
    if (k > 0) {
      const a = k * 2.4 + hash2(k, 3, 77);
      const cx = Math.cos(a), cz = Math.sin(a), sx = -cz * 0.09, sz = cx * 0.09;
      const len = 0.55 + 0.3 * hash2(k, 4, 77);
      const tip = [x0 + cx * len, y0 - 0.06, z0 + cz * len];
      const mid = [x0 + cx * len * 0.5, y0 + 0.02, z0 + cz * len * 0.5];
      quad([x0, y0, z0], [mid[0] + sx, mid[1], mid[2] + sz], tip, [mid[0] - sx, mid[1], mid[2] - sz]);
    }
  }
  // The floating canopy at the top.
  const [tx, , tz] = stalk[nodes];
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + 0.3;
    const cx = Math.cos(a), cz = Math.sin(a), sx = -cz * 0.14, sz = cx * 0.14;
    const len = 0.9 + 0.4 * hash2(k, 5, 77);
    quad([tx, 1, tz], [tx + cx * len * 0.5 + sx, 1, tz + cz * len * 0.5 + sz], [tx + cx * len, 1, tz + cz * len], [tx + cx * len * 0.5 - sx, 1, tz + cz * len * 0.5 - sz]);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.computeVertexNormals();
  return g;
}

const PALETTE = [0x6b5a2a, 0x7d6b30, 0x5a4c24, 0x8a7a3a, 0x6e6a2c].map((c) => new Color(c));
const m4 = new Matrix4(), p = new Vector3(), q = new Quaternion(), s = new Vector3(), yAxis = new Vector3(0, 1, 0);

/**
 * Kelp forests (see TerrainGenerator.getKelp): tall kelp rising from the
 * sea floor to spread over the surface, swaying in the swell. On the
 * chunks near you.
 */
export function createKelpLayer(config) {
  const geometry = plant();
  const material = new MeshLambertMaterial({ side: 2 });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `#include <begin_vertex>
        // Swaying in the swell, more the higher up the plant (the top floats).
        float phase = instanceMatrix[3].x * 0.21 + instanceMatrix[3].z * 0.17;
        float up = position.y * position.y;
        transformed.x += sin(uTime * 0.7 + phase + position.y * 2.0) * 0.35 * up;
        transformed.z += cos(uTime * 0.55 + phase * 1.3 + position.y * 1.6) * 0.3 * up;`,
      );
  };
  material.customProgramCacheKey = () => 'kelp';

  return {
    name: 'kelp',
    material,

    reuseKey: ({ lod }) => (lod > 1 ? 'none' : 'near'),

    build({ cx, cz, lod, generator, groundHeightAt }) {
      if (lod > 1 || !generator.getKelp) return null;
      const size = config.chunkSize, sea = config.seaLevel;
      const x0 = cx * size, z0 = cz * size;
      // (A quick look first: is any of this chunk sea deep enough?)
      let any = false;
      for (let j = 0; j <= 4 && !any; j++) for (let i = 0; i <= 4 && !any; i++) {
        const y = groundHeightAt(Math.min(size - 0.01, (i * size) / 4), Math.min(size - 0.01, (j * size) / 4));
        if (y < sea - 2.5 && y > sea - 16) any = true;
      }
      if (!any) return null;
      const G = 2.4, n = Math.round(size / G), seed = generator.seed ^ 0x6e1b;
      const list = [];
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          const gi = cx * n + i, gj = cz * n + j;
          const keep = hash2(gi, gj, seed);
          if (keep > 0.7) continue;
          const lx = (i + hash2(gi, gj, seed + 1)) * G, lz = (j + hash2(gi, gj, seed + 2)) * G;
          const y = groundHeightAt(lx, lz);
          if (!(y < sea - 2.5 && y > sea - 16)) continue;
          if (keep > 0.7 * generator.getKelp(x0 + lx, z0 + lz, y)) continue;
          list.push([lx, y, lz, hash2(gi, gj, seed + 3), hash2(gi, gj, seed + 4)]);
        }
      }
      if (!list.length) return null;
      const mesh = new InstancedMesh(geometry, material, list.length);
      list.forEach(([x, y, z, r, c], k) => {
        const tall = sea - 0.12 - y;
        p.set(x, y, z);
        q.setFromAxisAngle(yAxis, r * Math.PI * 2);
        s.set(1.2 + r * 0.6, tall, 1.2 + r * 0.6);
        mesh.setMatrixAt(k, m4.compose(p, q, s));
        mesh.setColorAt(k, PALETTE[Math.floor(c * PALETTE.length)]);
      });
      mesh.computeBoundingSphere();
      mesh.name = 'kelp';
      return mesh;
    },

    dispose(mesh) {
      mesh.dispose(); // (the plant is shared)
    },
  };
}
