import { BufferAttribute, BufferGeometry, Color, DoubleSide, InstancedMesh, Matrix4, MeshLambertMaterial, Quaternion, Vector3 } from 'three';
import { hash2 } from '../../noise/random.js';
import { addWind } from '../../render/wind.js';
import { placeUnderstory } from '../decorPlacement.js';

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

/**
 * A fern: a ring of fronds, each a strip of leaflets narrowing to its tip,
 * `n` of them `len` long, rising `rise` and drooping `droop` (a metre or
 * so across, by default: arching out and down). `w` how broad a frond is;
 * `strap`, a broad, smooth leaf (a bird's-nest fern's) rather than a
 * feathery one; `trunk`, standing on a short stump.
 */
function fern(seed, { n = 9, len = 0.6, rise = 0.55, droop = 0.6, w = 0.09, strap = false, trunk = 0 } = {}) {
  const tris = [];
  if (trunk > 0) {
    // (The stump: a few rough sides, dark and shaggy.)
    for (let k = 0; k < 5; k++) {
      const a0 = (k / 5) * Math.PI * 2, a1 = ((k + 1) / 5) * Math.PI * 2, r0 = 0.09, r1 = 0.07;
      const b0 = [Math.cos(a0) * r0, 0, Math.sin(a0) * r0], b1 = [Math.cos(a1) * r0, 0, Math.sin(a1) * r0];
      const t0 = [Math.cos(a0) * r1, trunk, Math.sin(a0) * r1], t1 = [Math.cos(a1) * r1, trunk, Math.sin(a1) * r1];
      tris.push([b0, b1, t1, DARK, DARK, DARK], [b0, t1, t0, DARK, DARK, DARK]);
    }
  }
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + hash2(k, 5, seed) * 0.4;
    const ca = Math.cos(a), sa = Math.sin(a), px = -sa, pz = ca;
    const l = len * (0.75 + 0.5 * hash2(k, 6, seed));
    const pts = [0, 0.35, 0.7, 1].map((t) => [ca * l * t, trunk + 0.1 + rise * t - droop * t * t, sa * l * t]);
    for (let sg = 0; sg < 3; sg++) {
      const f = (sg + 0.5) / 3, ww = w * (strap ? 1.1 - 0.5 * f : Math.sin(Math.PI * (0.3 + 0.7 * f)));
      const p0 = pts[sg], p1 = pts[sg + 1];
      const l0 = [p0[0] + px * ww, p0[1], p0[2] + pz * ww], r0 = [p0[0] - px * ww, p0[1], p0[2] - pz * ww];
      tris.push([p0, l0, p1, DARK, MID, LIGHT], [p0, p1, r0, DARK, LIGHT, MID]);
      if (!strap) {
        // (Leaflets: little blades off each side of the frond.)
        const m = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2];
        for (const side of [1, -1]) tris.push([l0.map((v, i) => (v + p0[i]) / 2), [m[0] + px * ww * 2.2 * side, m[1] - 0.03, m[2] + pz * ww * 2.2 * side], m, MID, LIGHT, MID]);
      }
    }
  }
  return build(tris);
}

// (Kinds 0 and 1 the big-leaved plants, 2 the common fern, 3-6 the jungle's other ferns: see placeUnderstory.)
const PLANTS = [
  { shape: leafy(3), colors: [0x3f7d2f, 0x4a8a34, 0x2f6a2a, 0x5a9a3a] },
  { shape: leafy(11), colors: [0x356f2c, 0x4f8f3a, 0x3a7a30] },
  { shape: fern(7), colors: [0x4a7f33, 0x5a8f3a, 0x3f7430, 0x6a9a44] },
  // (A shuttlecock fern: tall fronds standing up out of the middle in a vase.)
  { shape: fern(13, { n: 8, len: 0.45, rise: 1.25, droop: 0.35, w: 0.08 }), colors: [0x5a9a3a, 0x4f8a30, 0x6aa848] },
  // (A bird's-nest fern: broad smooth bright straps in a rosette.)
  { shape: fern(19, { n: 10, len: 0.75, rise: 0.5, droop: 0.4, w: 0.13, strap: true }), colors: [0x6aa83a, 0x7ab848, 0x5a9a30] },
  // (A low lacy fern: many fine fronds lying out flat, wide across.)
  { shape: fern(23, { n: 14, len: 0.85, rise: 0.25, droop: 0.3, w: 0.06 }), colors: [0x3e6e2c, 0x4a7a34, 0x355f28] },
  // (A little tree fern: fronds arching out from the top of a shaggy stump.)
  { shape: fern(29, { n: 9, len: 0.8, rise: 0.4, droop: 0.65, w: 0.1, trunk: 0.55 }), colors: [0x4a8a36, 0x3f7a2e, 0x55963c] },
];
const color = new Color();
const m4 = new Matrix4(), p = new Vector3(), q = new Quaternion(), s = new Vector3(), yAxis = new Vector3(0, 1, 0);

/**
 * The forest floor's plants: thick in the jungle (big-leaved plants and
 * ferns everywhere under the trees), and a few ferns in the pine woods. They sway a little in the wind. On the chunks
 * right around you.
 */
export function createUnderstoryLayer(config) {
  const material = addWind(new MeshLambertMaterial({ vertexColors: true, side: DoubleSide, flatShading: true }), { strength: 0.02, speed: 1.3 });

  return {
    name: 'understory',
    material,

    reuseKey: ({ lod }) => (lod > 0 ? 'none' : 'near'),

    build({ cx, cz, lod, generator, groundHeightAt, prepared }) {
      if (lod > 0) return null;
      // (Where they grow: worked out by a chunk worker; here only if it wasn't.)
      const data = prepared && prepared.understory !== undefined ? prepared.understory : placeUnderstory(generator, config, cx, cz, groundHeightAt);
      if (!data) return null;
      const placed = PLANTS.map(() => []);
      for (let k = 0; k < data.length; k += 7) {
        const pl = PLANTS[data[k]];
        placed[data[k]].push([data[k + 1], data[k + 2], data[k + 3], data[k + 4], data[k + 5], pl.colors[Math.floor(data[k + 6] * pl.colors.length)]]);
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
