import { BufferAttribute, BufferGeometry, Color, Group, InstancedMesh, Matrix4, MeshLambertMaterial, Quaternion, Vector3 } from 'three';
import { hash2 } from '../../noise/random.js';
import { windTime } from '../../render/wind.js';

// A strip of quads up a curving blade: from `base`, `len` long, `w` wide,
// leaning out along (cx, cz) more the higher it goes.
function blade(pos, bx, bz, cx, cz, len, w, lean, segs = 3) {
  const sx = -cz * w * 0.5, sz = cx * w * 0.5;
  let prev = null;
  for (let k = 0; k <= segs; k++) {
    const t = k / segs, out = lean * t * t * len, y = len * t * (1 - 0.25 * lean * t);
    const taper = 1 - 0.7 * t;
    const L = [bx + cx * out - sx * taper, y, bz + cz * out - sz * taper], R = [bx + cx * out + sx * taper, y, bz + cz * out + sz * taper];
    if (prev) pos.push(...prev[0], ...prev[1], ...R, ...prev[0], ...R, ...L);
    prev = [L, R];
  }
}

function geometry(pos) {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.computeVertexNormals();
  return g;
}

// Seagrass: a clump of long, narrow, ribbon-like blades, about a metre tall.
function seagrass(seed) {
  const pos = [];
  for (let k = 0; k < 14; k++) {
    const a = hash2(k, 1, seed) * Math.PI * 2, d = hash2(k, 2, seed) * 0.12;
    blade(pos, Math.cos(a) * d, Math.sin(a) * d, Math.cos(a), Math.sin(a), 0.5 + 0.5 * hash2(k, 3, seed), 0.035, 0.25 + 0.35 * hash2(k, 4, seed), 4);
  }
  return geometry(pos);
}

// Sea lettuce: a tuft of broad, short, crinkled leaves on the rock.
function lettuce(seed) {
  const pos = [];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + hash2(k, 1, seed);
    blade(pos, 0, 0, Math.cos(a), Math.sin(a), 0.18 + 0.12 * hash2(k, 2, seed), 0.16, 1.1, 2);
  }
  return geometry(pos);
}

// Red weed: a bush of thin forking fronds.
function redweed(seed) {
  const pos = [];
  for (let k = 0; k < 9; k++) {
    const a = hash2(k, 1, seed) * Math.PI * 2, len = 0.25 + 0.25 * hash2(k, 2, seed);
    blade(pos, 0, 0, Math.cos(a), Math.sin(a), len, 0.05, 0.5, 3);
    // (A fork off it, halfway up.)
    const b = a + 0.7 * (hash2(k, 3, seed) - 0.5) * 2;
    const ox = Math.cos(a) * len * 0.15, oz = Math.sin(a) * len * 0.15, sub = [];
    blade(sub, 0, 0, Math.cos(b), Math.sin(b), len * 0.55, 0.04, 0.7, 2);
    for (let i = 0; i < sub.length; i += 3) pos.push(sub[i] + ox, sub[i + 1] + len * 0.45, sub[i + 2] + oz);
  }
  return geometry(pos);
}

const COLORS = [
  [0x4a7a2a, 0x5a8a30, 0x6a8a3a, 0x3e6a28, 0x7a8a3a], // seagrass
  [0x6aa040, 0x7ab048, 0x5a9038, 0x8ab84a], // sea lettuce
  [0x8a3a3a, 0xa04a4a, 0x7a3040, 0x8a5a2a, 0x6a4a24], // red and brown weed
].map((l) => l.map((c) => new Color(c)));

const m4 = new Matrix4(), p = new Vector3(), q = new Quaternion(), s = new Vector3(), yAxis = new Vector3(0, 1, 0);

/**
 * The sea floor's plants (beside the kelp and the corals): meadows of
 * seagrass on the sandy bottom of the shallows, a metre to a dozen deep;
 * tufts of green sea lettuce on the rocks; red and brown weed lower down
 * on them. All swaying in the swell. On the chunks near you.
 */
export function createSeaweedLayer(config) {
  const shapes = [seagrass(11), lettuce(23), redweed(37)];
  const material = new MeshLambertMaterial({ side: 2 });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `#include <begin_vertex>
        // Swaying to and fro in the swell, the tips most.
        float phase = instanceMatrix[3].x * 0.31 + instanceMatrix[3].z * 0.23;
        float up = position.y * position.y * 1.6;
        transformed.x += sin(uTime * 0.9 + phase + position.y * 3.0) * 0.18 * up;
        transformed.z += cos(uTime * 0.7 + phase * 1.3 + position.y * 2.4) * 0.14 * up;`,
      );
  };
  material.customProgramCacheKey = () => 'seaweed';

  return {
    name: 'seaweed',
    material,

    reuseKey: ({ lod }) => (lod > 0 ? 'none' : 'near'),

    build({ cx, cz, lod, generator, groundHeightAt }) {
      if (lod > 0 || !generator.getSeaRock) return null;
      const size = config.chunkSize, sea = config.seaLevel;
      const x0 = cx * size, z0 = cz * size;
      // (A quick look first: is any of this chunk under the sea?)
      let any = false;
      for (let j = 0; j <= 4 && !any; j++) for (let i = 0; i <= 4 && !any; i++) {
        const y = groundHeightAt(Math.min(size - 0.01, (i * size) / 4), Math.min(size - 0.01, (j * size) / 4));
        if (y < sea - 0.8) any = true;
      }
      if (!any) return null;
      const N = generator.coastNoise, seed = generator.seed ^ 0x5ea9;
      const G = 1.3, n = Math.round(size / G);
      const placed = shapes.map(() => []);
      let oceanAt = null;
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          const gi = cx * n + i, gj = cz * n + j;
          const lx = (i + hash2(gi, gj, seed + 1)) * G, lz = (j + hash2(gi, gj, seed + 2)) * G;
          const y = groundHeightAt(lx, lz);
          const depth = sea - y;
          if (!(depth > 0.8 && depth < 30)) continue;
          // (The open sea or a sea inlet: not a mountain lake.)
          oceanAt ??= generator.getOceanness(x0 + size / 2, z0 + size / 2);
          if (oceanAt < 0.3) return null;
          const wx = x0 + lx, wz = z0 + lz, roll = hash2(gi, gj, seed);
          const rock = generator.getSeaRock(wx, wz);
          let kind = -1;
          if (rock < 0.35 && depth < 12) {
            // Seagrass meadows, in great patches over the sand, thinning at their edges.
            const meadow = (N.noise2D(wx * 0.018 + 41, wz * 0.018 - 13) * 0.5 + 0.5) * (1 - smoothstep(8, 12, depth)) * (1 - rock * 2);
            if (roll < smoothstep(0.42, 0.62, meadow) * 0.85) kind = 0;
          } else if (rock >= 0.35 && roll < 0.1 * rock) {
            // On the rock: lettuce up in the light, the red and brown weed deeper.
            kind = depth < 10 ? (hash2(gi, gj, seed + 5) < 0.75 ? 1 : 2) : hash2(gi, gj, seed + 5) < 0.25 ? 1 : 2;
          }
          if (kind < 0) continue;
          placed[kind].push([lx, y - 0.04, lz, hash2(gi, gj, seed + 3), hash2(gi, gj, seed + 4)]);
        }
      }
      if (!placed.some((l) => l.length)) return null;
      const group = new Group();
      group.name = 'seaweed';
      placed.forEach((list, k) => {
        if (!list.length) return;
        const mesh = new InstancedMesh(shapes[k], material, list.length);
        list.forEach(([x, y, z, r, c], i) => {
          const sz = k === 0 ? 0.8 + 0.6 * c : 0.8 + 0.8 * r;
          mesh.setMatrixAt(i, m4.compose(p.set(x, y, z), q.setFromAxisAngle(yAxis, r * Math.PI * 2), s.set(sz, sz * (0.85 + 0.3 * r), sz)));
          mesh.setColorAt(i, COLORS[k][Math.floor(c * COLORS[k].length)]);
        });
        mesh.computeBoundingSphere();
        group.add(mesh);
      });
      return group;
    },

    dispose(group) {
      for (const mesh of group.children) mesh.dispose(); // (the shapes are shared)
    },
  };
}

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
