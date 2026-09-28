import { BoxGeometry, BufferAttribute, Color, ConeGeometry, CylinderGeometry, DodecahedronGeometry, Euler, IcosahedronGeometry, Matrix4, OctahedronGeometry, Quaternion, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../noise/random.js';

const tint = new Color(), m4 = new Matrix4(), q = new Quaternion(), e = new Euler(), p = new Vector3(), s = new Vector3();

/**
 * Builds a low-poly model from coloured parts (each face its part's colour,
 * a little darker underneath), merged into one flat-shaded geometry.
 */
class Parts {
  constructor(seed = 1) {
    this.list = [];
    this.rand = mulberry32(seed);
  }

  add(geometry, color, [x, y, z] = [0, 0, 0], [rx, ry, rz] = [0, 0, 0], [sx, sy, sz] = [1, 1, 1], jitter = 0.08) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    g.deleteAttribute('uv');
    g.deleteAttribute('normal');
    g.applyMatrix4(m4.compose(p.set(x, y, z), q.setFromEuler(e.set(rx, ry, rz)), s.set(sx, sy, sz)));
    const pos = g.attributes.position;
    const col = new Float32Array(pos.count * 3);
    for (let k = 0; k < pos.count; k += 3) {
      const low = (pos.getY(k) + pos.getY(k + 1) + pos.getY(k + 2)) / 3 < y ? 0.82 : 1;
      tint.set(color).multiplyScalar(low * (1 - jitter + this.rand() * jitter * 2));
      for (let v = 0; v < 3; v++) col.set([tint.r, tint.g, tint.b], (k + v) * 3);
    }
    g.setAttribute('color', new BufferAttribute(col, 3));
    this.list.push(g);
    return this;
  }

  /** A log (a rough cylinder) from a to b. */
  log(a, b, r, bark = 0x6e4c32, end = 0xc8a070, sides = 7) {
    const from = new Vector3(...a), to = new Vector3(...b);
    const dir = to.clone().sub(from), len = dir.length();
    const g = new CylinderGeometry(r, r * 1.04, len, sides, 1);
    const rot = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir.clone().normalize());
    const mid = from.clone().add(to).multiplyScalar(0.5);
    g.applyQuaternion(rot);
    g.translate(mid.x, mid.y, mid.z);
    this.add(g, bark);
    // The cut ends, pale wood.
    for (const [at, sign] of [[from, -1], [to, 1]]) {
      const cap = new CylinderGeometry(r * 0.94, r * 0.94, 0.02, sides, 1);
      cap.applyQuaternion(rot);
      const c = at.clone().addScaledVector(dir, (sign * 0.011) / len);
      cap.translate(c.x, c.y, c.z);
      this.add(cap, end, [0, 0, 0], [0, 0, 0], [1, 1, 1], 0.03);
    }
    return this;
  }

  build() {
    const g = mergeGeometries(this.list);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

// --- Things lying on the ground (base at y = 0) --------------------------------

export const stickModel = () =>
  new Parts(3)
    .add(new CylinderGeometry(0.025, 0.035, 0.9, 5), 0x7a5634, [0, 0.03, 0], [0, 0, Math.PI / 2])
    .add(new CylinderGeometry(0.012, 0.018, 0.25, 4), 0x7a5634, [0.15, 0.03, 0.08], [0, -0.6, Math.PI / 2])
    .build();

export const rockModel = () => new Parts(5).add(new DodecahedronGeometry(0.11, 0), 0x8e8a82, [0, 0.06, 0], [0.3, 0.5, 0.2], [1.2, 0.75, 1]).build();

export const flintModel = () =>
  new Parts(7)
    .add(new OctahedronGeometry(0.1, 0), 0x3a3e4c, [0, 0.06, 0], [0.4, 0.3, 0.2], [1.3, 0.8, 1])
    .add(new OctahedronGeometry(0.06, 0), 0xe4dccc, [0.06, 0.08, 0.02], [0.2, 0.7, 0.1], [1, 0.7, 1])
    .build();

export const ironModel = () =>
  new Parts(9)
    .add(new DodecahedronGeometry(0.28, 0), 0x6a4c42, [0, 0.16, 0], [0.3, 0.2, 0.1], [1.2, 0.8, 1])
    .add(new DodecahedronGeometry(0.18, 0), 0x7a584a, [0.22, 0.1, 0.12], [0.5, 0.1, 0.4], [1, 0.8, 1])
    .add(new OctahedronGeometry(0.06, 0), 0xd0c8c0, [0.05, 0.36, 0.1])
    .add(new OctahedronGeometry(0.05, 0), 0xb06a40, [-0.15, 0.3, -0.08])
    .add(new OctahedronGeometry(0.05, 0), 0xd0c8c0, [0.24, 0.22, -0.04])
    .build();

export const logModel = () => new Parts(11).log([-0.9, 0.2, 0], [0.9, 0.2, 0], 0.2).build();

export const spearModel = () =>
  new Parts(13)
    .add(new CylinderGeometry(0.025, 0.03, 2.0, 5), 0x8a6038, [0, 0, 0], [Math.PI / 2, 0, 0])
    .add(new ConeGeometry(0.045, 0.2, 4), 0x4a4e58, [0, 0, 1.08], [Math.PI / 2, 0, 0])
    .add(new CylinderGeometry(0.035, 0.035, 0.08, 5), 0x4f6a34, [0, 0, 0.95], [Math.PI / 2, 0, 0])
    .build(); // (along +z, its point at the front, centred)

export const axeModel = () =>
  new Parts(15)
    .add(new CylinderGeometry(0.022, 0.028, 0.62, 5), 0x8a6038, [0, 0.31, 0])
    .add(new BoxGeometry(0.2, 0.1, 0.05), 0x8e8a84, [0.07, 0.56, 0], [0, 0, -0.15])
    .add(new BoxGeometry(0.05, 0.12, 0.052), 0xbcb8b0, [0.17, 0.55, 0], [0, 0, -0.15])
    .add(new CylinderGeometry(0.032, 0.032, 0.06, 5), 0x4f6a34, [0, 0.5, 0])
    .build(); // (the handle up +y, the head at the top)

export const meatModel = (cooked = false) =>
  new Parts(17)
    .add(new DodecahedronGeometry(0.13, 0), cooked ? 0x7a3e1e : 0xb84040, [0, 0.07, 0], [0.2, 0.4, 0], [1.3, 0.55, 1])
    .add(new CylinderGeometry(0.018, 0.018, 0.22, 4), 0xeee4d4, [0.12, 0.06, 0], [0, 0, Math.PI / 2])
    .build();

/** A little bundle for anything else dropped on the ground: its colour. */
export const bundleModel = (color) =>
  new Parts(19)
    .add(new DodecahedronGeometry(0.14, 0), color, [0, 0.1, 0], [0.2, 0.3, 0.1], [1.1, 0.8, 1])
    .add(new CylinderGeometry(0.03, 0.03, 0.05, 5), 0x5a3c24, [0, 0.2, 0])
    .build();

export const skinModel = () =>
  new Parts(21)
    .add(new BoxGeometry(0.9, 0.03, 0.7), 0xa8743e, [0, 0.02, 0], [0, 0.3, 0])
    .add(new BoxGeometry(0.5, 0.035, 0.4), 0xc4945a, [0.05, 0.03, 0], [0, 0.3, 0])
    .build();

// --- Things you build (base at y = 0, facing +z) ------------------------------------

/** A campfire: a ring of stones and three logs leaning together. */
export function campfireModel() {
  const b = new Parts(23);
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2;
    b.add(new DodecahedronGeometry(0.13, 0), 0x8a867e, [Math.cos(a) * 0.62, 0.07, Math.sin(a) * 0.62], [k, k * 2, 0], [1.2, 0.8, 1]);
  }
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + 0.3;
    b.log([Math.cos(a) * 0.5, 0.06, Math.sin(a) * 0.5], [Math.cos(a) * 0.05, 0.55, Math.sin(a) * 0.05], 0.07, 0x5a3e28, 0x3a2a1c, 6);
  }
  b.add(new DodecahedronGeometry(0.16, 0), 0x2a2420, [0, 0.05, 0], [0, 0, 0], [1.4, 0.35, 1.4]); // (ash)
  return b.build();
}

/**
 * A section of palisade, 4 m long: sharpened logs stood side by side,
 * lashed to two rails with rope, a prop or two behind; the logs a little
 * uneven in height and lean, like the forts in the old north.
 */
export const WALL_LENGTH = 4;
export function wallModel() {
  const b = new Parts(25);
  const rand = mulberry32(77);
  const n = 10, gap = WALL_LENGTH / n;
  for (let k = 0; k < n; k++) {
    const x = -WALL_LENGTH / 2 + gap * (k + 0.5);
    const h = 3.0 + rand() * 0.7, r = 0.17 + rand() * 0.04, lean = (rand() - 0.5) * 0.04;
    const shade = 0x7a6448 + Math.floor(rand() * 3) * 0x040302;
    b.add(new CylinderGeometry(r, r * 1.05, h, 7), shade, [x, h / 2 - 0.3, 0], [lean, 0, (rand() - 0.5) * 0.03]);
    b.add(new ConeGeometry(r, 0.55, 7), 0xb0946a, [x, h - 0.3 + 0.27, 0], [lean, 0, 0]);
  }
  // Rails behind, lashed on with rope.
  for (const y of [0.9, 2.2]) {
    b.log([-WALL_LENGTH / 2 + 0.05, y, -0.27], [WALL_LENGTH / 2 - 0.05, y, -0.27], 0.1, 0x6a5238, 0xb89468, 6);
    for (let k = 0; k < n; k += 2) b.add(new BoxGeometry(0.36, 0.1, 0.44), 0x4a3a28, [-WALL_LENGTH / 2 + gap * (k + 0.5), y, -0.12]);
  }
  // Props leaning in behind.
  for (const x of [-1.2, 1.3]) b.log([x, 2.4, -0.35], [x + 0.1, -0.1, -1.6], 0.09, 0x6a5238, 0xb89468, 6);
  return b.build();
}

/** One sharpened log, stood upright. */
export function stakeModel() {
  return new Parts(27)
    .add(new CylinderGeometry(0.2, 0.22, 3.1, 7), 0x7a6448, [0, 1.3, 0])
    .add(new ConeGeometry(0.2, 0.6, 7), 0xb0946a, [0, 3.15, 0])
    .add(new CylinderGeometry(0.215, 0.215, 0.08, 7), 0x4a3a28, [0, 1.1, 0])
    .build();
}

/** A chest: planks, a lid, rope bands and a latch. */
export function chestModel() {
  return new Parts(29)
    .add(new BoxGeometry(1.0, 0.5, 0.6), 0x8a6038, [0, 0.25, 0])
    .add(new BoxGeometry(1.04, 0.16, 0.64), 0xa8744a, [0, 0.58, 0])
    .add(new BoxGeometry(1.06, 0.06, 0.66), 0x4a3422, [0, 0.4, 0])
    .add(new BoxGeometry(0.06, 0.62, 0.66), 0x4a3422, [-0.3, 0.33, 0])
    .add(new BoxGeometry(0.06, 0.62, 0.66), 0x4a3422, [0.3, 0.33, 0])
    .add(new BoxGeometry(0.12, 0.14, 0.04), 0x3a2a1a, [0, 0.45, 0.32])
    .build();
}

// --- Cave finds ---------------------------------------------------------------

export const crystalModel = () => {
  const b = new Parts(31);
  const rand = mulberry32(5);
  for (let k = 0; k < 6; k++) {
    const h = 0.4 + rand() * 0.8, a = rand() * 6.28;
    b.add(new ConeGeometry(0.08 + rand() * 0.06, h, 5), 0xffffff, [Math.cos(a) * 0.12, h / 2, Math.sin(a) * 0.12], [(rand() - 0.5) * 0.8, 0, (rand() - 0.5) * 0.8], [1, 1, 1], 0.2);
  }
  return b.build();
};

export const glowcapModel = () => {
  const b = new Parts(33);
  for (const [x, z, h] of [[0, 0, 0.18], [0.08, 0.05, 0.12], [-0.06, 0.07, 0.1], [0.03, -0.08, 0.14]]) {
    b.add(new CylinderGeometry(0.012, 0.016, h, 5), 0xd8e8e0, [x, h / 2, z]);
    b.add(new ConeGeometry(0.05, 0.035, 6), 0xffffff, [x, h, z]);
  }
  return b.build();
};

export const bonesModel = () =>
  new Parts(35)
    .add(new BoxGeometry(0.16, 0.12, 0.2), 0xe8e0cc, [0, 0.06, 0], [0, 0.4, 0]) // skull
    .add(new BoxGeometry(0.1, 0.05, 0.12), 0xe0d8c4, [0.02, 0.03, 0.14], [0, 0.4, 0])
    .add(new CylinderGeometry(0.02, 0.02, 0.5, 4), 0xe8e0cc, [0.3, 0.02, 0.1], [0, 0.9, Math.PI / 2])
    .add(new CylinderGeometry(0.02, 0.02, 0.42, 4), 0xe0d8c4, [-0.25, 0.02, -0.1], [0, -0.5, Math.PI / 2])
    .add(new IcosahedronGeometry(0.03, 0), 0xe8e0cc, [0.55, 0.02, 0.3])
    .build();
