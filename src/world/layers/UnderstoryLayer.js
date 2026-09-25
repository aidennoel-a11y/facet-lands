import { BufferAttribute, BufferGeometry, Color, DoubleSide, InstancedMesh, Matrix4, MeshLambertMaterial, Quaternion, Vector3 } from 'three';
import { hash2 } from '../../noise/random.js';
import { addWind } from '../../render/wind.js';

/** Collects triangles with a colour per vertex into a geometry. */
function build(tris) {
  const pos = [], col = [];
  for (const [a, b, c, ca, cb, cc] of tris) {
    pos.push(...a, ...b, ...c);
    col.push(...ca, ...cb, ...cc);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
  g.computeVertexNormals();
  return g;
}

const DARK = [0.55, 0.62, 0.5], MID = [0.85, 0.92, 0.8], LIGHT = [1.05, 1.1, 0.95];

/**
 * A broad-leaved plant (elephant ears, philodendrons): big, heart-shaped
 * leaves on long stalks fanning out and drooping from the middle, about a
 * metre and a half across.
 */
function leafy(seed) {
  const tris = [];
  const n = 6;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + hash2(k, 1, seed) * 0.5;
    const ca = Math.cos(a), sa = Math.sin(a), px = -sa, pz = ca;
    const reach = 0.35 + 0.25 * hash2(k, 2, seed), up = 0.55 + 0.35 * hash2(k, 3, seed);
    const base = [ca * reach, up, sa * reach]; // where the stalk meets the leaf
    // The stalk.
    tris.push([[0, 0, 0], [ca * 0.02 + px * 0.03, 0, sa * 0.02 + pz * 0.03], base, DARK, DARK, MID]);
    // The leaf: out and down from the stalk, widest near its base.
    const len = 0.55 + 0.3 * hash2(k, 4, seed), w = len * 0.42;
    const mid = [base[0] + ca * len * 0.45, base[1] - len * 0.12, base[2] + sa * len * 0.45];
    const tip = [base[0] + ca * len, base[1] - len * 0.45, base[2] + sa * len];
    const l = [mid[0] + px * w, mid[1] + 0.05, mid[2] + pz * w], r = [mid[0] - px * w, mid[1] + 0.05, mid[2] - pz * w];
    tris.push([base, l, mid, MID, LIGHT, MID], [base, mid, r, MID, MID, LIGHT], [mid, l, tip, MID, LIGHT, LIGHT], [mid, tip, r, MID, LIGHT, LIGHT]);
  }
  return build(tris);
}

/** A fern: a ring of long fronds arching out and down, a metre or so across. */
function fern(seed) {
  const tris = [];
  const n = 9;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + hash2(k, 5, seed) * 0.4;
    const ca = Math.cos(a), sa = Math.sin(a), px = -sa, pz = ca;
    const len = 0.6 + 0.35 * hash2(k, 6, seed);
    const pts = [0, 0.35, 0.7, 1].map((t) => [ca * len * t, 0.1 + 0.55 * t - 0.6 * t * t, sa * len * t]);
    for (let s = 0; s < 3; s++) {
      const w = 0.09 * Math.sin(Math.PI * (0.3 + 0.7 * ((s + 0.5) / 3)));
      const p0 = pts[s], p1 = pts[s + 1];
      const l0 = [p0[0] + px * w, p0[1], p0[2] + pz * w], r0 = [p0[0] - px * w, p0[1], p0[2] - pz * w];
      tris.push([p0, l0, p1, DARK, MID, LIGHT], [p0, p1, r0, DARK, LIGHT, MID]);
    }
  }
  return build(tris);
}

const PLANTS = [
  { shape: leafy(3), colors: [0x3f7d2f, 0x4a8a34, 0x2f6a2a, 0x5a9a3a] },
  { shape: leafy(11), colors: [0x356f2c, 0x4f8f3a, 0x3a7a30] },
  { shape: fern(7), colors: [0x4a7f33, 0x5a8f3a, 0x3f7430, 0x6a9a44] },
];
const color = new Color();
const m4 = new Matrix4(), p = new Vector3(), q = new Quaternion(), s = new Vector3(), yAxis = new Vector3(0, 1, 0);

/**
 * The forest floor's plants: thick in the jungle (big-leaved plants and
 * ferns everywhere under the trees), ferns in the shade of the redwoods,
 * a few in the pine woods. They sway a little in the wind. On the chunks
 * right around you.
 */
export function createUnderstoryLayer(config) {
  const material = addWind(new MeshLambertMaterial({ vertexColors: true, side: DoubleSide, flatShading: true }), { strength: 0.02, speed: 1.3 });

  return {
    name: 'understory',
    material,

    reuseKey: ({ lod }) => (lod > 0 ? 'none' : 'near'),

    build({ cx, cz, lod, generator, groundHeightAt }) {
      if (lod > 0) return null;
      const size = config.chunkSize, sea = config.seaLevel;
      const x0 = cx * size, z0 = cz * size;
      // (A quick look first: any of the forests that have an understory?)
      const cover = (x, z) => {
        const w = generator.getBiomeWeights(x, z, {});
        return [w.jungle, w.redwood * 0.5, w.pine * 0.12];
      };
      let any = 0;
      for (let j = 0; j <= 4; j++) for (let i = 0; i <= 4; i++) any = Math.max(any, ...cover(x0 + (i * size) / 4, z0 + (j * size) / 4));
      if (any < 0.02) return null;
      const G = 2.2, n = Math.round(size / G), seed = generator.seed ^ 0x0d57;
      const surface = { normalY: 1 };
      const placed = PLANTS.map(() => []);
      let cell = -1, here = [0, 0, 0];
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          const gi = cx * n + i, gj = cz * n + j;
          const keep = hash2(gi, gj, seed);
          if (keep > 0.6) continue;
          const lx = (i + hash2(gi, gj, seed + 1)) * G, lz = (j + hash2(gi, gj, seed + 2)) * G;
          // (The forests looked up once per 8 m patch.)
          const c = Math.floor(lx / 8) * 64 + Math.floor(lz / 8);
          if (c !== cell) {
            cell = c;
            here = cover(x0 + Math.floor(lx / 8) * 8 + 4, z0 + Math.floor(lz / 8) * 8 + 4);
          }
          const r = hash2(gi, gj, seed + 3);
          // Jungle: all three kinds; elsewhere, ferns.
          const jungle = here[0] * 0.6, ferns = Math.max(here[1], here[2]);
          if (keep > Math.max(jungle, ferns * 0.6)) continue;
          const kind = keep < jungle ? Math.floor(r * 3) : 2;
          const y = groundHeightAt(lx, lz, surface);
          if (!(y > sea + 1) || surface.normalY < 0.7) continue;
          if (generator.rivers?.at(x0 + lx, z0 + lz, 1)) continue;
          const pl = PLANTS[kind];
          placed[kind].push([lx, y - 0.05, lz, 0.8 + 0.8 * hash2(gi, gj, seed + 4), hash2(gi, gj, seed + 5), pl.colors[Math.floor(hash2(gi, gj, seed + 6) * pl.colors.length)]]);
        }
      }
      if (!placed.some((l) => l.length)) return null;
      const meshes = placed.map((list, k) => {
        if (!list.length) return null;
        const mesh = new InstancedMesh(PLANTS[k].shape, material, list.length);
        list.forEach(([x, y, z, sc, turn, c], i) => {
          p.set(x, y, z);
          q.setFromAxisAngle(yAxis, turn * Math.PI * 2);
          s.set(sc, sc * (0.85 + 0.3 * turn), sc);
          mesh.setMatrixAt(i, m4.compose(p, q, s));
          mesh.setColorAt(i, color.setHex(c));
        });
        mesh.computeBoundingSphere();
        mesh.receiveShadow = true;
        return mesh;
      }).filter(Boolean);
      const root = meshes[0];
      for (const m of meshes.slice(1)) root.add(m);
      root.name = 'understory';
      return root;
    },

    dispose(mesh) {
      for (const child of mesh.children) child.dispose();
      mesh.dispose(); // (the shapes are shared)
    },
  };
}
