import { BufferAttribute, BufferGeometry, Color, Group, InstancedMesh, Matrix4, MeshLambertMaterial, Quaternion, Vector3 } from 'three';
import { hash2 } from '../../noise/random.js';
import { windTime } from '../../render/wind.js';
import { placeSeaweed } from '../decorPlacement.js';

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
    blade(pos, Math.cos(a) * d, Math.sin(a) * d, Math.cos(a), Math.sin(a), 0.5 + 0.5 * hash2(k, 3, seed), 0.035, 0.25 + 0.35 * hash2(k, 4, seed), 3);
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

    build({ cx, cz, lod, generator, groundHeightAt, prepared }) {
      if (lod > 0 || !generator.getSeaRock) return null;
      // (Where they go: worked out by a chunk worker; here only if it wasn't.)
      const data = prepared && prepared.seaweed !== undefined ? prepared.seaweed : placeSeaweed(generator, config, cx, cz, groundHeightAt);
      if (!data) return null;
      const placed = shapes.map(() => []);
      for (let k = 0; k < data.length; k += 7) placed[data[k]].push([data[k + 1], data[k + 2], data[k + 3], data[k + 4], data[k + 5], data[k + 6]]);
      if (!placed.some((l) => l.length)) return null;
      const group = new Group();
      group.name = 'seaweed';
      placed.forEach((list, k) => {
        if (!list.length) return;
        const mesh = new InstancedMesh(shapes[k], material, list.length);
        list.forEach(([x, y, z, r, c, tall], i) => {
          const sz = (k === 0 ? 0.8 + 0.6 * c : 0.8 + 0.8 * r) * tall;
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
