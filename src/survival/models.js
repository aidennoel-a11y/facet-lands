import { BoxGeometry, BufferAttribute, Color, ConeGeometry, CylinderGeometry, DodecahedronGeometry, Euler, IcosahedronGeometry, Matrix4, OctahedronGeometry, Quaternion, TorusGeometry, Vector3 } from 'three';
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

// Coal, mountain iron ore (dark, with a silvery glint) and gold ore (pale
// quartz, flecked with gold): see Game.#mine and GroundItems.
export const coalModel = () =>
  new Parts(21)
    .add(new DodecahedronGeometry(0.13, 0), 0x22201e, [0, 0.08, 0], [0.4, 0.2, 0.3], [1.2, 0.8, 1])
    .add(new OctahedronGeometry(0.07, 0), 0x3a3634, [0.09, 0.1, 0.03], [0.3, 0.6, 0.1])
    .build();
export const mountainOreModel = () =>
  new Parts(23)
    .add(new DodecahedronGeometry(0.2, 0), 0x3e434c, [0, 0.12, 0], [0.3, 0.2, 0.1], [1.2, 0.8, 1])
    .add(new OctahedronGeometry(0.05, 0), 0xd8dee6, [0.06, 0.26, 0.06])
    .add(new OctahedronGeometry(0.045, 0), 0xb8c0ca, [-0.12, 0.2, -0.05])
    .build();
export const goldOreModel = () =>
  new Parts(25)
    .add(new DodecahedronGeometry(0.14, 0), 0xe6e0d2, [0, 0.09, 0], [0.4, 0.3, 0.2], [1.2, 0.8, 1])
    .add(new OctahedronGeometry(0.045, 0), 0xe8b830, [0.06, 0.17, 0.04])
    .add(new OctahedronGeometry(0.04, 0), 0xd8a020, [-0.07, 0.14, -0.03])
    .build();
// A steel sword: the grip up +y, the blade above (held as an axe is).
export const swordModel = (blade = 0xd0d8e0, tip = 0xe8eef4, guard = 0x8a949e) =>
  new Parts(27)
    .add(new CylinderGeometry(0.022, 0.024, 0.2, 5), 0x4a3020, [0, 0.1, 0])
    .add(new BoxGeometry(0.2, 0.03, 0.04), guard, [0, 0.215, 0])
    .add(new BoxGeometry(0.05, 0.72, 0.012), blade, [0, 0.59, 0], [0, 0, 0], [1, 1, 1], 0.03)
    .add(new ConeGeometry(0.035, 0.1, 4), tip, [0, 1.0, 0], [0, Math.PI / 4, 0], [1, 1, 0.3])
    .build();

export const logModel = () => new Parts(11).log([-0.9, 0.2, 0], [0.9, 0.2, 0], 0.2).build();

export const spearModel = (metal = 0x4a4e58) =>
  new Parts(13)
    .add(new CylinderGeometry(0.025, 0.03, 2.0, 5), 0x8a6038, [0, 0, 0], [Math.PI / 2, 0, 0])
    .add(new ConeGeometry(0.045, 0.2, 4), metal, [0, 0, 1.08], [Math.PI / 2, 0, 0])
    .add(new CylinderGeometry(0.035, 0.035, 0.08, 5), 0x4f6a34, [0, 0, 0.95], [Math.PI / 2, 0, 0])
    .build(); // (along +z, its point at the front, centred)

export const axeModel = (metal = 0x8e8a84, edge = 0xbcb8b0) =>
  new Parts(15)
    .add(new CylinderGeometry(0.022, 0.028, 0.62, 5), 0x8a6038, [0, 0.31, 0])
    .add(new BoxGeometry(0.2, 0.1, 0.05), metal, [0.07, 0.56, 0], [0, 0, -0.15])
    .add(new BoxGeometry(0.05, 0.12, 0.052), edge, [0.17, 0.55, 0], [0, 0, -0.15])
    .add(new CylinderGeometry(0.032, 0.032, 0.06, 5), 0x4f6a34, [0, 0.5, 0])
    .build(); // (the handle up +y, the head at the top)

/** A pickaxe: a handle, and a curved head pointed both ways. */
export const pickaxeModel = (metal = 0x8e8a84, edge = 0xbcb8b0) =>
  new Parts(16)
    .add(new CylinderGeometry(0.022, 0.028, 0.66, 5), 0x8a6038, [0, 0.33, 0])
    .add(new BoxGeometry(0.34, 0.06, 0.05), metal, [0, 0.62, 0])
    .add(new ConeGeometry(0.035, 0.14, 4), edge, [0.22, 0.58, 0], [0, 0, -Math.PI / 2 - 0.4])
    .add(new ConeGeometry(0.035, 0.14, 4), edge, [-0.22, 0.58, 0], [0, 0, Math.PI / 2 + 0.4])
    .build();

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

// --- More tools and things ------------------------------------------------------

/** A bow, held upright: a bent stave and its string. */
export function bowModel(string = true, wood = 0x8a5d38) {
  const b = new Parts(41);
  const n = 7;
  for (let k = 0; k < n; k++) {
    const a0 = -0.75 + (1.5 * k) / n, a1 = a0 + 1.5 / n;
    const p0 = [0, Math.sin(a0) * 0.55, -Math.cos(a0) * 0.18 + 0.18], p1 = [0, Math.sin(a1) * 0.55, -Math.cos(a1) * 0.18 + 0.18];
    b.log(p0, p1, 0.018, wood, wood, 5);
  }
  if (string) b.add(new CylinderGeometry(0.004, 0.004, 1.02, 3), 0xe8e0cc, [0, 0, 0.055]); // (in your hand, drawn back: see Game)
  return b.build();
}

/** An arrow, along +z (the point at the front). */
export const arrowModel = (head = 0x3e4250) =>
  new Parts(43)
    .add(new CylinderGeometry(0.008, 0.008, 0.75, 4), 0x9a6e44, [0, 0, 0], [Math.PI / 2, 0, 0])
    .add(new ConeGeometry(0.02, 0.07, 4), head, [0, 0, 0.4], [Math.PI / 2, 0, 0])
    .add(new BoxGeometry(0.002, 0.04, 0.1), 0xe8e0d0, [0, 0.015, -0.32])
    .add(new BoxGeometry(0.04, 0.002, 0.1), 0xe8e0d0, [0, 0, -0.32])
    .build();

export const rodModel = () =>
  new Parts(45)
    .add(new CylinderGeometry(0.008, 0.02, 1.8, 5), 0x8a5d38, [0, 0.9, 0])
    .add(new CylinderGeometry(0.025, 0.025, 0.12, 6), 0x4f6a34, [0, 0.35, 0])
    .build();

export const bobberModel = () =>
  new Parts(47)
    .add(new IcosahedronGeometry(0.05, 0), 0xd83a2a, [0, 0.02, 0])
    .add(new IcosahedronGeometry(0.045, 0), 0xf4f0e8, [0, -0.03, 0])
    .build();

export const waterskinModel = () =>
  new Parts(49)
    .add(new DodecahedronGeometry(0.13, 0), 0xa8743e, [0, 0.12, 0], [0, 0, 0], [1, 1.3, 0.7])
    .add(new CylinderGeometry(0.03, 0.035, 0.08, 6), 0x5a3c24, [0, 0.29, 0])
    .build();

export const potModel = () =>
  new Parts(51)
    .add(new CylinderGeometry(0.2, 0.15, 0.22, 8), 0x4a5058, [0, 0.11, 0])
    .add(new CylinderGeometry(0.22, 0.22, 0.03, 8), 0x6e7680, [0, 0.22, 0])
    .build();

export const ironBarModel = (colour = 0xa4acb4) => new Parts(53).add(new BoxGeometry(0.3, 0.07, 0.1), colour, [0, 0.035, 0], [0, 0, 0], [1, 1, 1], 0.03).build();

export const fishModel = (cooked = false) =>
  new Parts(55)
    .add(new OctahedronGeometry(0.1, 0), cooked ? 0xa8703a : 0x8aa4b4, [0, 0.05, 0], [0, 0, 0], [0.8, 0.8, 2.4])
    .add(new ConeGeometry(0.07, 0.1, 4), cooked ? 0x8a5a2a : 0x6a8494, [0, 0.05, -0.26], [-Math.PI / 2, 0, 0], [0.3, 1, 1])
    .build();

/** A stone furnace: a squat dome of stones with a fire-mouth at the front. */
export function furnaceModel() {
  const b = new Parts(57);
  const rand = mulberry32(3);
  for (let ring = 0; ring < 4; ring++) {
    const r = 0.62 - ring * 0.13, y = 0.15 + ring * 0.27, n = 9 - ring;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + ring * 0.4;
      if (ring === 0 && Math.abs(a - Math.PI / 2) < 0.4) continue; // (the mouth, at the front)
      b.add(new DodecahedronGeometry(0.2 + rand() * 0.05, 0), 0x8a867e, [Math.cos(a) * r, y, Math.sin(a) * r], [k, ring, 0], [1.1, 0.8, 1]);
    }
  }
  b.add(new CylinderGeometry(0.16, 0.2, 0.3, 7), 0x6a665e, [0, 1.25, 0]); // (the chimney)
  b.add(new CylinderGeometry(0.42, 0.46, 0.9, 8), 0x3a3430, [0, 0.45, 0]); // (dark inside)
  return b.build();
}

/** A bed: a frame of logs, a wool mattress and a blanket of skins. */
export function bedModel() {
  return new Parts(59)
    .log([-0.5, 0.15, -1.0], [-0.5, 0.15, 1.0], 0.1, 0x6e4c32, 0xc8a070, 6)
    .log([0.5, 0.15, -1.0], [0.5, 0.15, 1.0], 0.1, 0x6e4c32, 0xc8a070, 6)
    .log([-0.6, 0.15, -1.0], [0.6, 0.15, -1.0], 0.1, 0x6e4c32, 0xc8a070, 6)
    .log([-0.6, 0.15, 1.0], [0.6, 0.15, 1.0], 0.1, 0x6e4c32, 0xc8a070, 6)
    .add(new BoxGeometry(0.95, 0.16, 1.95), 0xece6d8, [0, 0.3, 0])
    .add(new BoxGeometry(0.7, 0.12, 0.35), 0xf6f2e8, [0, 0.42, -0.72])
    .add(new BoxGeometry(1.0, 0.06, 1.2), 0xa8743e, [0, 0.4, 0.35])
    .log([-0.6, 0.1, -1.05], [-0.6, 0.8, -1.05], 0.08, 0x5a3c24, 0xc8a070, 6)
    .log([0.6, 0.1, -1.05], [0.6, 0.8, -1.05], 0.08, 0x5a3c24, 0xc8a070, 6)
    .build();
}

/** A gate in a palisade: two tall posts (the frame)... */
export function gateFrameModel() {
  const b = new Parts(61);
  for (const x of [-WALL_LENGTH / 2 + 0.2, WALL_LENGTH / 2 - 0.2]) {
    b.add(new CylinderGeometry(0.22, 0.24, 3.8, 7), 0x6e5438, [x, 1.6, 0]);
    b.add(new ConeGeometry(0.22, 0.55, 7), 0xb0946a, [x, 3.77, 0]);
  }
  b.log([-WALL_LENGTH / 2 + 0.1, 3.2, 0], [WALL_LENGTH / 2 - 0.1, 3.2, 0], 0.13, 0x6a5238, 0xb89468, 6);
  return b.build();
}
/** ...and its door: planks of split logs, hinged at its left edge (x = 0), braced. */
export function gateDoorModel() {
  const b = new Parts(63);
  const w = WALL_LENGTH - 0.9, n = 8;
  for (let k = 0; k < n; k++) b.add(new BoxGeometry(w / n - 0.02, 2.8, 0.14), 0x8a6a44, [(w / n) * (k + 0.5), 1.45, 0]);
  for (const y of [0.5, 2.4]) b.add(new BoxGeometry(w, 0.16, 0.08), 0x5a3c24, [w / 2, y, -0.1]);
  b.add(new BoxGeometry(0.12, 2.3, 0.07), 0x5a3c24, [w / 2, 1.45, -0.12], [0, 0, 0.62]);
  return b.build();
}
export const GATE_DOOR_WIDTH = WALL_LENGTH - 0.9;

/** A drying rack: two A-frames, a pole, and strips of meat hanging from it (see the rack's hooks). */
export function dryingRackModel() {
  const b = new Parts(65);
  for (const x of [-0.7, 0.7]) {
    b.log([x, 0, -0.35], [x, 1.25, 0], 0.035, 0x8a5d38, 0xc8a070, 5);
    b.log([x, 0, 0.35], [x, 1.25, 0], 0.035, 0x8a5d38, 0xc8a070, 5);
  }
  b.log([-0.85, 1.18, 0], [0.85, 1.18, 0], 0.03, 0x8a5d38, 0xc8a070, 5);
  return b.build();
}
export const meatStripModel = (dry = false) => new Parts(67).add(new BoxGeometry(0.1, 0.36, 0.03), dry ? 0x6a2e18 : 0xb84040, [0, -0.2, 0]).build();

/** A snare: two sticks and a noose of vine across a run in the grass. */
export function snareModel() {
  const b = new Parts(69);
  b.log([-0.2, 0, 0], [-0.18, 0.4, 0], 0.015, 0x8a5d38, 0xc8a070, 4);
  b.log([0.2, 0, 0], [0.18, 0.4, 0], 0.015, 0x8a5d38, 0xc8a070, 4);
  b.log([-0.22, 0.36, 0], [0.22, 0.36, 0], 0.012, 0x8a5d38, 0xc8a070, 4);
  for (let k = 0; k < 8; k++) {
    const a0 = (k / 8) * Math.PI * 2, a1 = ((k + 1) / 8) * Math.PI * 2;
    b.log([Math.cos(a0) * 0.1, 0.12 + Math.sin(a0) * 0.1, 0], [Math.cos(a1) * 0.1, 0.12 + Math.sin(a1) * 0.1, 0], 0.006, 0x4f8a34, 0x4f8a34, 3);
  }
  b.log([0, 0.22, 0], [0, 0.36, 0], 0.006, 0x4f8a34, 0x4f8a34, 3);
  return b.build();
}
/** A rabbit caught in one. */
export const caughtModel = () =>
  new Parts(71)
    .add(new DodecahedronGeometry(0.13, 0), 0x9a8468, [0, 0.08, 0], [0, 0, 0.3], [1.5, 0.8, 1])
    .add(new DodecahedronGeometry(0.07, 0), 0x8a765c, [0.18, 0.08, 0])
    .add(new BoxGeometry(0.04, 0.02, 0.12), 0x8a765c, [0.24, 0.1, 0.05], [0, 0.4, 0])
    .build();

/** A raft: logs lashed side by side, with two cross-pieces. */
export function raftModel() {
  const b = new Parts(73);
  for (let k = 0; k < 6; k++) {
    const x = -0.95 + k * 0.38;
    b.log([x, 0.15, -1.3], [x, 0.15, 1.3], 0.19, 0x7a5232, 0xc8a070, 7);
  }
  for (const z of [-0.9, 0.9]) b.log([-1.2, 0.36, z], [1.2, 0.36, z], 0.08, 0x6a4a2e, 0xc8a070, 6);
  for (const z of [-0.9, 0.9]) for (let k = 0; k < 6; k++) b.add(new BoxGeometry(0.2, 0.06, 0.22), 0x4f6a34, [-0.95 + k * 0.38, 0.34, z]);
  return b.build();
}

// --- Tools, and things to build: the smithy, the farm, the camp -------------

/** A crossbow: a stock, a steel bow across its front, the string drawn back (along +z, the bolt's way). */
export const crossbowModel = () =>
  new Parts(81)
    .add(new BoxGeometry(0.07, 0.07, 0.7), 0x7a5232, [0, 0, 0.05])
    .add(new BoxGeometry(0.06, 0.12, 0.18), 0x6a4428, [0, -0.07, -0.22], [0.3, 0, 0])
    .add(new BoxGeometry(0.62, 0.035, 0.05), 0x9aa4b0, [0, 0.03, 0.36], [0, 0, 0], [1, 1, 1], 0.03)
    .add(new BoxGeometry(0.02, 0.02, 0.3), 0xe8e0cc, [0.18, 0.04, 0.24], [0, -0.9, 0])
    .add(new BoxGeometry(0.02, 0.02, 0.3), 0xe8e0cc, [-0.18, 0.04, 0.24], [0, 0.9, 0])
    .add(new BoxGeometry(0.03, 0.05, 0.08), 0x3a3a40, [0, -0.05, -0.02])
    .build();

/** A crossbow bolt: short and heavy, iron-headed. */
export const boltModel = (head = 0x9aa4b0) =>
  new Parts(83)
    .add(new CylinderGeometry(0.011, 0.011, 0.42, 4), 0x7a5232, [0, 0, 0], [Math.PI / 2, 0, 0])
    .add(new ConeGeometry(0.022, 0.07, 4), head, [0, 0, 0.24], [Math.PI / 2, 0, 0])
    .add(new BoxGeometry(0.002, 0.03, 0.07), 0xc8c0b0, [0, 0.012, -0.17])
    .add(new BoxGeometry(0.03, 0.002, 0.07), 0xc8c0b0, [0, 0, -0.17])
    .build();

/** A hoe: a long handle, a flat blade at right angles. */
export const hoeModel = () =>
  new Parts(85)
    .add(new CylinderGeometry(0.022, 0.026, 1.1, 5), 0x8a6038, [0, 0.55, 0])
    .add(new BoxGeometry(0.18, 0.04, 0.14), 0x8e8a84, [0, 1.08, 0.08], [0.2, 0, 0])
    .build();

/** Shears: two blades on a spring of iron. */
export const shearsModel = () =>
  new Parts(87)
    .add(new BoxGeometry(0.03, 0.2, 0.01), 0xc8d0d8, [0.02, 0.1, 0], [0, 0, -0.08])
    .add(new BoxGeometry(0.03, 0.2, 0.01), 0xc8d0d8, [-0.02, 0.1, 0], [0, 0, 0.08])
    .add(new BoxGeometry(0.1, 0.03, 0.02), 0x5a3c24, [0, 0, 0])
    .build();

/** An anvil on a stump: the horn to the front, the flat face on top. */
export function anvilModel() {
  return new Parts(89)
    .add(new CylinderGeometry(0.34, 0.4, 0.55, 8), 0x6e5234, [0, 0.27, 0])
    .add(new CylinderGeometry(0.3, 0.3, 0.02, 8), 0xc8a070, [0, 0.56, 0])
    .add(new BoxGeometry(0.28, 0.16, 0.3), 0x3e444c, [0, 0.64, 0])
    .add(new BoxGeometry(0.2, 0.1, 0.22), 0x3e444c, [0, 0.76, 0])
    .add(new BoxGeometry(0.62, 0.14, 0.26), 0x4a5058, [0.04, 0.87, 0], [0, 0, 0], [1, 1, 1], 0.02)
    .add(new ConeGeometry(0.1, 0.34, 6), 0x4a5058, [-0.42, 0.87, 0], [0, 0, Math.PI / 2])
    .add(new BoxGeometry(0.6, 0.01, 0.24), 0x8a949e, [0.04, 0.945, 0], [0, 0, 0], [1, 1, 1], 0.02)
    .build();
}

/** A grindstone: a stone wheel on an axle in a frame of logs, a crank at one side. */
export function grindstoneModel() {
  const b = new Parts(91)
    .add(new CylinderGeometry(0.42, 0.42, 0.14, 12), 0x9a968e, [0, 0.8, 0], [0, 0, Math.PI / 2])
    .add(new CylinderGeometry(0.04, 0.04, 0.6, 5), 0x5a3c24, [0, 0.8, 0], [0, 0, Math.PI / 2])
    .add(new BoxGeometry(0.04, 0.24, 0.04), 0x5a3c24, [0.3, 0.7, 0])
    .add(new BoxGeometry(0.14, 0.04, 0.04), 0x5a3c24, [0.34, 0.58, 0]);
  for (const x of [-0.22, 0.22]) {
    b.log([x, 0, -0.35], [x, 0.85, 0], 0.05, 0x7a5232, 0xc8a070, 5);
    b.log([x, 0, 0.35], [x, 0.85, 0], 0.05, 0x7a5232, 0xc8a070, 5);
  }
  return b.build();
}

/** A tanning rack: a frame of poles, a hide stretched in it on thongs. */
export function tanningRackModel() {
  const b = new Parts(93);
  b.log([-0.8, 0, 0], [-0.8, 1.9, 0], 0.045, 0x8a5d38, 0xc8a070, 5);
  b.log([0.8, 0, 0], [0.8, 1.9, 0], 0.045, 0x8a5d38, 0xc8a070, 5);
  b.log([-0.9, 1.8, 0], [0.9, 1.8, 0], 0.04, 0x8a5d38, 0xc8a070, 5);
  b.log([-0.9, 0.3, 0], [0.9, 0.3, 0], 0.04, 0x8a5d38, 0xc8a070, 5);
  b.log([-0.8, 0, 0], [-0.6, 0, -0.6], 0.03, 0x8a5d38, 0xc8a070, 4);
  b.log([0.8, 0, 0], [0.6, 0, -0.6], 0.03, 0x8a5d38, 0xc8a070, 4);
  return b.build();
}
/** The hide on it (raw: pink and pale; tanned: brown). */
export const stretchedHideModel = (tanned = false) =>
  new Parts(95)
    .add(new BoxGeometry(1.2, 1.2, 0.03), tanned ? 0xb8804a : 0xc89080, [0, 1.05, 0.02])
    .add(new BoxGeometry(0.8, 0.8, 0.035), tanned ? 0xa06a38 : 0xe0b0a0, [0, 1.05, 0.02])
    .build();

/**
 * A thatched roof on four posts, 4 m square, the thatch pitched from a
 * ridge: stood over the walls, a shelter.
 */
export const ROOF_SIZE = 4;
export function roofModel() {
  const b = new Parts(97), h = ROOF_SIZE / 2;
  for (const [x, z] of [[-h + 0.15, -h + 0.15], [h - 0.15, -h + 0.15], [-h + 0.15, h - 0.15], [h - 0.15, h - 0.15]]) b.log([x, -0.2, z], [x, 2.9, z], 0.1, 0x6e5234, 0xc8a070, 6);
  b.log([-h - 0.2, 3.9, 0], [h + 0.2, 3.9, 0], 0.1, 0x6a5238, 0xc8a070, 6); // the ridge
  for (const side of [-1, 1]) {
    b.log([-h - 0.2, 2.9, side * h], [h + 0.2, 2.9, side * h], 0.09, 0x6a5238, 0xc8a070, 6);
    // Thatch, in courses.
    for (let k = 0; k < 4; k++) {
      const t = (k + 0.5) / 4, y = 3.9 - t * 1.15, z = side * t * (h + 0.4);
      b.add(new BoxGeometry(ROOF_SIZE + 0.6, 0.14, (h + 0.4) / 3.4), k % 2 ? 0xc8a860 : 0xb89850, [0, y, z], [side * 0.52, 0, 0]);
    }
  }
  // The gable ends, woven.
  for (const x of [-h + 0.02, h - 0.02]) b.add(new ConeGeometry(h + 0.2, 1.0, 3), 0xa88a4a, [x, 3.35, 0], [0, 0, Math.PI / 2], [0.12, 1, 1.9]);
  return b.build();
}

/** A section of fence, 3 m long: three posts and two rails, low (a sheep can't get over it). */
export const FENCE_LENGTH = 3;
export function fenceModel() {
  const b = new Parts(99), h = FENCE_LENGTH / 2;
  for (const x of [-h + 0.08, 0, h - 0.08]) b.log([x, -0.2, 0], [x, 1.15, 0], 0.07, 0x7a6448, 0xc8a070, 6);
  for (const y of [0.45, 0.95]) b.log([-h, y, 0.06], [h, y, 0.06], 0.05, 0x8a6a44, 0xc8a070, 5);
  return b.build();
}
/** A fence gate: its two posts... */
export function fenceGatePostsModel() {
  const b = new Parts(101), h = FENCE_LENGTH / 2;
  for (const x of [-h + 0.08, h - 0.08]) b.log([x, -0.2, 0], [x, 1.25, 0], 0.08, 0x6e5438, 0xc8a070, 6);
  return b.build();
}
/** ...and the gate (hinged at x = 0). */
export function fenceGateDoorModel() {
  const b = new Parts(103), w = FENCE_LENGTH - 0.3;
  for (const y of [0.35, 0.95]) b.add(new BoxGeometry(w, 0.1, 0.05), 0x8a6a44, [w / 2, y, 0]);
  for (const x of [0.05, w - 0.05]) b.add(new BoxGeometry(0.08, 0.8, 0.05), 0x7a5a38, [x, 0.65, 0]);
  b.add(new BoxGeometry(0.06, 0.9, 0.04), 0x5a3c24, [w / 2, 0.65, -0.03], [0, 0, 1.0]);
  return b.build();
}

/** A rope hanging from a stake at a cliff's top: the stake (its length drawn separately). */
export function ropeStakeModel() {
  return new Parts(105)
    .add(new CylinderGeometry(0.05, 0.03, 0.7, 5), 0x8a6038, [0, 0.15, 0])
    .add(new CylinderGeometry(0.07, 0.07, 0.08, 6), 0xb89a60, [0, 0.3, 0])
    .build();
}
/** A metre of rope, hanging (drawn stretched to its length). */
export const ropeLengthModel = () => new Parts(107).add(new CylinderGeometry(0.025, 0.025, 1, 5), 0xb89a60, [0, -0.5, 0], [0, 0, 0], [1, 1, 1], 0.05).build();

/** A dug plot, 2 m square: dark turned earth in furrows. */
export const PLOT_SIZE = 2;
export function plotModel() {
  // (The soil itself is painted onto the ground: see render/tilledSoil.
  // Here, only a few low clods along the rows, sunk into it.)
  const b = new Parts(109);
  const rand = mulberry32(1091);
  for (let k = 0; k < 10; k++) b.add(new BoxGeometry(0.12, 0.05, 0.1), 0x3c2a1c, [(rand() - 0.5) * 1.8, -0.01, -0.75 + Math.floor(rand() * 4) * 0.5], [0, rand() * 3, 0], [1, 1, 1], 0.1);
  return b.build();
}

/**
 * A crop at its full height (drawn scaled up as it grows): wheat (a stand
 * of golden stalks with their ears), corn (tall stalks with long leaves and
 * a cob or two), potatoes (a low bushy leafy plant), carrots (feathery tops).
 * Several of them in a plot's rows.
 */
export function cropModel(kind, ripe = false) {
  const b = new Parts(111 + kind.length);
  const rand = mulberry32(kind.length * 7 + (ripe ? 1 : 0));
  const green = ripe ? 0x8a8a34 : 0x5a8a34;
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const x = -0.75 + c * 0.5 + (rand() - 0.5) * 0.1, z = -0.75 + r * 0.5 + (rand() - 0.5) * 0.1;
      if (kind === 'wheat') {
        for (let k = 0; k < 4; k++) {
          const dx = (rand() - 0.5) * 0.2, dz = (rand() - 0.5) * 0.2, h = 0.8 + rand() * 0.2, lean = (rand() - 0.5) * 0.2;
          b.add(new BoxGeometry(0.015, h, 0.015), ripe ? 0xc8a050 : 0x6a9a3a, [x + dx, h / 2, z + dz], [lean, 0, lean]);
          b.add(new BoxGeometry(0.04, 0.14, 0.04), ripe ? 0xe0bc64 : 0x8aba4a, [x + dx + lean * 0.4, h + 0.05, z + dz + lean * 0.4], [lean, 0, lean]);
        }
      } else if (kind === 'corn') {
        if ((r + c) % 2) continue;
        b.add(new BoxGeometry(0.05, 2.0, 0.05), ripe ? 0x9a9a44 : 0x5a9a34, [x, 1.0, z]);
        for (let k = 0; k < 4; k++) b.add(new BoxGeometry(0.5, 0.02, 0.08), green, [x + 0.2 * Math.cos(k * 1.9), 0.5 + k * 0.35, z + 0.2 * Math.sin(k * 1.9)], [0, k * 1.9, -0.4]);
        b.add(new BoxGeometry(0.08, 0.26, 0.08), ripe ? 0xf0c830 : 0x8aba4a, [x + 0.06, 1.1, z], [0, 0, 0.3]);
        b.add(new BoxGeometry(0.04, 0.2, 0.04), 0xc8a060, [x, 2.05, z]);
      } else if (kind === 'potato') {
        b.add(new DodecahedronGeometry(0.2, 0), green, [x, 0.18, z], [rand(), rand(), 0], [1, 0.8, 1]);
        if (!ripe) b.add(new DodecahedronGeometry(0.05, 0), 0xe8e0f0, [x, 0.36, z]);
      } else {
        for (let k = 0; k < 5; k++) b.add(new BoxGeometry(0.02, 0.3, 0.06), green, [x + (rand() - 0.5) * 0.08, 0.15, z + (rand() - 0.5) * 0.08], [(rand() - 0.5) * 0.6, rand() * 3, (rand() - 0.5) * 0.6]);
        if (ripe) b.add(new ConeGeometry(0.03, 0.06, 5), 0xe8762a, [x, 0.03, z], [Math.PI, 0, 0]);
      }
    }
  }
  return b.build();
}

// --- Everything else you carry (base at y = 0, lying on the ground) ---------------
// Each thing its own shape, so what's in your hand reads as what it is.

const R = (seed) => new Parts(seed);

/** A coil of something (a vine, a rope): loops lying flat. */
const coil = (seed, colour, r = 0.12, t = 0.02, leaves = 0) => {
  const b = R(seed);
  for (let k = 0; k < 3; k++) b.add(new TorusGeometry(r - k * 0.012, t, 4, 10), colour, [k * 0.01, t + k * t * 1.4, 0], [Math.PI / 2, 0, k * 0.4]);
  for (let k = 0; k < leaves; k++) {
    const a = k * 2.1;
    b.add(new BoxGeometry(0.06, 0.008, 0.035), 0x5f9a3c, [Math.cos(a) * r, t * 3, Math.sin(a) * r], [0, a, 0.3]);
  }
  return b.build();
};

/** A folded skin or pelt, with tufts if it's fur; stripes, a mane... */
const pelt = (seed, colour, { tufts = 0, tuft = colour, stripes = 0, stripe = 0x1e1612, size = 1, scales = false } = {}) => {
  const b = R(seed);
  b.add(new BoxGeometry(0.5 * size, 0.05, 0.36 * size), colour, [0, 0.025, 0], [0, 0.2, 0]);
  b.add(new BoxGeometry(0.42 * size, 0.05, 0.3 * size), colour, [0.02, 0.07, 0.01], [0, 0.35, 0.03]); // (folded over)
  const rand = mulberry32(seed);
  for (let k = 0; k < tufts; k++) b.add(new ConeGeometry(0.03 * size, 0.07 * size, 4), tuft, [(rand() - 0.5) * 0.36 * size, 0.11, (rand() - 0.5) * 0.24 * size], [(rand() - 0.5) * 0.8, 0, (rand() - 0.5) * 0.8]);
  for (let k = 0; k < stripes; k++) b.add(new BoxGeometry(0.035 * size, 0.012, 0.26 * size), stripe, [(-0.15 + k * 0.1) * size, 0.1, 0], [0, 0.35 + (rand() - 0.5) * 0.3, 0]);
  if (scales) for (let k = 0; k < 8; k++) b.add(new BoxGeometry(0.05, 0.03, 0.05), 0x3a4a2e, [(-0.15 + (k % 4) * 0.1) * size, 0.11, (k < 4 ? -0.05 : 0.06) * size], [0, 0.35, 0]);
  return b.build();
};

/** A small cloth sack tied at the neck (seeds, guano...), a few of what's in it beside it. */
const sack = (seed, cloth, bits) => {
  const b = R(seed)
    .add(new DodecahedronGeometry(0.1, 0), cloth, [0, 0.09, 0], [0, 0.3, 0], [1, 1.1, 0.9])
    .add(new CylinderGeometry(0.035, 0.05, 0.06, 6), cloth, [0, 0.2, 0])
    .add(new TorusGeometry(0.04, 0.008, 3, 8), 0x8a6a44, [0, 0.18, 0], [Math.PI / 2, 0, 0]);
  for (const [x, z] of [[0.13, 0.04], [0.15, -0.03], [0.11, -0.07]]) b.add(new OctahedronGeometry(0.014, 0), bits, [x, 0.012, z]);
  return b.build();
};

export const vineModel = () => coil(201, 0x4f8a34, 0.12, 0.014, 5);
export const ropeModel = () => coil(203, 0xb89a60, 0.13, 0.022);
export const hideModel = () => pelt(205, 0xb06a58);
export const furModel = () => pelt(207, 0x7a6a58, { tufts: 10 });
export const tannedFurModel = () => pelt(209, 0xc4a47a, { tufts: 8, tuft: 0xb8966a });
export const woolModel = () => {
  const b = R(211);
  for (const [x, y, z, r] of [[0, 0.08, 0, 0.09], [0.08, 0.06, 0.04, 0.07], [-0.07, 0.06, 0.03, 0.065], [0.02, 0.12, -0.05, 0.06], [-0.03, 0.05, -0.07, 0.06]]) b.add(new IcosahedronGeometry(r, 0), 0xf0ece0, [x, y, z]);
  return b.build();
};
export const featherModel = () =>
  R(213)
    .add(new BoxGeometry(0.06, 0.006, 0.26), 0xe8e0d0, [0, 0.006, 0.02], [0, 0, 0], [1, 1, 1], 0.04)
    .add(new ConeGeometry(0.03, 0.06, 4), 0xe8e0d0, [0, 0.006, 0.18], [Math.PI / 2, 0, 0], [1, 1, 0.2])
    .add(new CylinderGeometry(0.004, 0.004, 0.34, 3), 0xc8b8a0, [0, 0.01, 0], [Math.PI / 2, 0, 0])
    .build();
export const charcoalModel = () =>
  R(215)
    .add(new DodecahedronGeometry(0.08, 0), 0x2a2624, [0, 0.05, 0], [0.4, 0.2, 0], [1.4, 0.8, 0.9])
    .add(new DodecahedronGeometry(0.06, 0), 0x1e1a18, [0.09, 0.04, 0.05], [0.1, 0.6, 0.3], [1.2, 0.8, 1])
    .add(new BoxGeometry(0.03, 0.005, 0.06), 0x4a4440, [0, 0.1, 0])
    .build();

// The great beasts' trophies.
export const grizzlyPeltModel = () => pelt(221, 0x4a3426, { tufts: 14, tuft: 0x3a281c, size: 1.2 });
export const paleFurModel = () => pelt(223, 0xece8e2, { tufts: 12, tuft: 0xd8d4ce });
export const greatHideModel = () => pelt(225, 0x4a3a30, { size: 1.35, tufts: 6, tuft: 0x2e241e });
export const crocHideModel = () => pelt(227, 0x5a6a44, { scales: true });
export const lionPeltModel = () => pelt(229, 0xc89a5a, { tufts: 10, tuft: 0x6a4026 });
export const tigerPeltModel = () => pelt(231, 0xd8823a, { stripes: 4 });
export const caveBearPeltModel = () => pelt(233, 0x3a3634, { tufts: 14, tuft: 0x2a2624, size: 1.25 });
export const fangModel = () =>
  R(235)
    .add(new ConeGeometry(0.04, 0.26, 5), 0xf0e8d4, [0, 0.04, 0], [Math.PI / 2 - 0.25, 0, 0.3], [1, 1, 0.7])
    .add(new CylinderGeometry(0.035, 0.04, 0.05, 5), 0xd8ccb0, [0, 0.04, -0.14], [Math.PI / 2, 0, 0])
    .build();
export const antlersModel = () => {
  const b = R(237);
  b.add(new CylinderGeometry(0.025, 0.035, 0.6, 5), 0xcbb690, [0, 0.03, 0], [Math.PI / 2, 0, 0.1]);
  for (const [z, a] of [[-0.15, 0.6], [0.02, -0.7], [0.18, 0.5]]) b.add(new CylinderGeometry(0.012, 0.02, 0.24, 4), 0xd8c6a0, [a * 0.12, 0.04, z], [0, 0, Math.PI / 2 - a]);
  b.add(new BoxGeometry(0.22, 0.03, 0.18), 0xcbb690, [0.06, 0.03, 0.28], [0, 0.4, 0]); // (the palm of it)
  return b.build();
};
export const venomSacModel = () =>
  R(239)
    .add(new DodecahedronGeometry(0.07, 0), 0x8ab04a, [0, 0.06, 0], [0, 0, 0], [1, 0.8, 1.3])
    .add(new DodecahedronGeometry(0.04, 0), 0xb8d870, [0.03, 0.09, 0.03])
    .add(new CylinderGeometry(0.015, 0.02, 0.06, 4), 0x6a8a3a, [0, 0.06, -0.1], [Math.PI / 2, 0, 0])
    .build();
export const tusksModel = () =>
  R(241)
    .add(new ConeGeometry(0.035, 0.24, 5), 0xf0e6d0, [0.06, 0.03, 0], [Math.PI / 2, 0.3, 0.4])
    .add(new ConeGeometry(0.035, 0.24, 5), 0xf0e6d0, [-0.06, 0.03, 0.02], [Math.PI / 2, -0.4, -0.3])
    .build();

// Seeds, crops and food.
export const seedsModel = (bit) => sack(243, 0xc8b48a, bit);
export const wheatModel = () => {
  const b = R(245);
  for (let k = 0; k < 6; k++) {
    const a = (k - 2.5) * 0.06;
    b.add(new CylinderGeometry(0.006, 0.006, 0.4, 3), 0xd8b45a, [a * 0.6, 0.02, 0], [Math.PI / 2, a, 0]);
    b.add(new BoxGeometry(0.025, 0.025, 0.08), 0xe0bc64, [a * 1.4, 0.03, 0.22], [0, a, 0]);
  }
  return b.add(new TorusGeometry(0.03, 0.008, 3, 8), 0x8a6a44, [0, 0.02, -0.04]).build();
};
export const berriesModel = () => {
  const b = R(247);
  for (const [x, y, z] of [[0, 0.03, 0], [0.04, 0.03, 0.02], [-0.03, 0.03, 0.03], [0.01, 0.03, -0.04], [0.02, 0.065, 0.01], [-0.03, 0.03, -0.02]]) b.add(new IcosahedronGeometry(0.028, 0), 0xa01830, [x, y, z]);
  return b.add(new BoxGeometry(0.07, 0.005, 0.04), 0x4f8a34, [0.04, 0.09, 0], [0, 0.5, 0.3]).build();
};
export const appleModel = () =>
  R(249)
    .add(new IcosahedronGeometry(0.06, 1), 0xc8261c, [0, 0.06, 0], [0, 0, 0], [1, 0.9, 1])
    .add(new CylinderGeometry(0.004, 0.005, 0.04, 3), 0x5a3c24, [0, 0.125, 0], [0, 0, 0.2])
    .add(new BoxGeometry(0.035, 0.004, 0.018), 0x4f8a34, [0.015, 0.13, 0], [0, 0.3, 0.4])
    .build();
export const mushroomModel = (cap = 0xc49a60, stem = 0xece4d0, spots = 0) => {
  const b = R(251)
    .add(new CylinderGeometry(0.018, 0.024, 0.08, 6), stem, [0, 0.04, 0])
    .add(new ConeGeometry(0.06, 0.045, 7), cap, [0, 0.095, 0])
    .add(new CylinderGeometry(0.06, 0.06, 0.012, 7), cap, [0, 0.072, 0]);
  for (let k = 0; k < spots; k++) b.add(new BoxGeometry(0.012, 0.004, 0.012), 0xf4f0e8, [Math.cos(k * 2.3) * 0.03, 0.105, Math.sin(k * 2.3) * 0.03]);
  return b.build();
};
export const jerkyModel = () =>
  R(253)
    .add(new BoxGeometry(0.05, 0.012, 0.2), 0x6a2e18, [0, 0.01, 0], [0, 0.2, 0.05])
    .add(new BoxGeometry(0.045, 0.012, 0.18), 0x5a2614, [0.05, 0.022, 0.01], [0, -0.15, -0.05])
    .build();
export const cornModel = (roast = false) =>
  R(255)
    .add(new CylinderGeometry(0.03, 0.025, 0.2, 7), roast ? 0xd89a28 : 0xf0c830, [0, 0.03, 0], [Math.PI / 2, 0, 0])
    .add(new BoxGeometry(0.04, 0.01, 0.16), roast ? 0x6a5a30 : 0x8ab04a, [0.03, 0.02, -0.04], [0, 0.2, 0.4])
    .add(new BoxGeometry(0.04, 0.01, 0.16), roast ? 0x6a5a30 : 0x8ab04a, [-0.03, 0.02, -0.04], [0, -0.2, -0.4])
    .build();
export const potatoModel = (baked = false) =>
  R(257)
    .add(new DodecahedronGeometry(0.055, 0), baked ? 0x8a5a30 : 0xb89060, [0, 0.045, 0], [0.3, 0.6, 0.1], [1.3, 0.85, 1])
    .add(baked ? new BoxGeometry(0.06, 0.01, 0.03) : new OctahedronGeometry(0.008, 0), baked ? 0xf0e0a0 : 0x7a5a38, [0.01, 0.09, 0])
    .build();
export const carrotModel = () =>
  R(259)
    .add(new ConeGeometry(0.026, 0.2, 6), 0xe8762a, [0, 0.026, 0.02], [-Math.PI / 2, 0, 0])
    .add(new ConeGeometry(0.03, 0.08, 4), 0x5f9a3c, [0, 0.03, -0.11], [Math.PI / 2, 0, 0], [1, 1, 0.4])
    .build();
export const doughModel = () => R(261).add(new DodecahedronGeometry(0.08, 0), 0xece0c4, [0, 0.04, 0], [0.2, 0.3, 0], [1.2, 0.5, 1.1]).build();
export const breadModel = () =>
  R(263)
    .add(new BoxGeometry(0.22, 0.09, 0.12), 0xb8763a, [0, 0.045, 0], [0, 0, 0], [1, 1, 1], 0.04)
    .add(new BoxGeometry(0.2, 0.03, 0.1), 0xc88a48, [0, 0.1, 0], [0, 0, 0], [1, 1, 1], 0.03)
    .add(new BoxGeometry(0.012, 0.01, 0.08), 0xe8c88a, [-0.05, 0.12, 0], [0, 0.4, 0])
    .add(new BoxGeometry(0.012, 0.01, 0.08), 0xe8c88a, [0.03, 0.12, 0], [0, 0.4, 0])
    .build();
export const stewModel = () =>
  R(265)
    .add(new CylinderGeometry(0.1, 0.06, 0.07, 8), 0x7a5232, [0, 0.035, 0])
    .add(new CylinderGeometry(0.088, 0.088, 0.01, 8), 0x8a4a2a, [0, 0.065, 0])
    .add(new BoxGeometry(0.03, 0.02, 0.03), 0xe8762a, [0.03, 0.072, 0.01])
    .add(new BoxGeometry(0.03, 0.02, 0.03), 0x7a3e1e, [-0.03, 0.072, -0.02])
    .build();

// Tools and gear.
export const flintSteelModel = (fine = false) =>
  R(267)
    .add(new OctahedronGeometry(0.05, 0), 0x3a3e4c, [-0.05, 0.03, 0], [0.4, 0.3, 0.2], [1.3, 0.8, 1])
    .add(new TorusGeometry(0.045, 0.01, 3, 8, Math.PI * 1.4), fine ? 0xd8e0ea : 0x6a707a, [0.06, 0.012, 0], [Math.PI / 2, 0, 0])
    .add(new BoxGeometry(0.06, 0.02, 0.02), 0x5a3c24, [0.06, 0.012, 0.045])
    .build();
export const saddleModel = (great = false) =>
  R(269)
    .add(new BoxGeometry(0.5, 0.03, 0.4), great ? 0x4a3a30 : 0x6a3a2a, [0, 0.015, 0])
    .add(new BoxGeometry(0.34, 0.1, 0.3), great ? 0x3a2a20 : 0x5a3a20, [0, 0.08, 0], [0, 0, 0], [0.9, 1, 0.85])
    .add(new BoxGeometry(0.08, 0.1, 0.24), 0x4a2e18, [0.15, 0.14, 0])
    .add(new BoxGeometry(0.08, 0.08, 0.26), 0x4a2e18, [-0.15, 0.13, 0])
    .add(new BoxGeometry(0.05, 0.03, 0.08), 0x8a949e, [0, 0.015, 0.26])
    .build();
export const bandageModel = () =>
  R(271)
    .add(new CylinderGeometry(0.045, 0.045, 0.07, 8), 0xece6d8, [0, 0.045, 0], [Math.PI / 2, 0, 0])
    .add(new BoxGeometry(0.06, 0.004, 0.12), 0xe0d8c8, [0, 0.003, 0.08])
    .build();
export const torchModel = () =>
  R(273)
    .add(new CylinderGeometry(0.022, 0.03, 0.55, 5), 0x7a5634, [0, 0.03, 0], [Math.PI / 2, 0, 0])
    .add(new CylinderGeometry(0.04, 0.035, 0.1, 6), 0x5a4030, [0, 0.03, 0.26], [Math.PI / 2, 0, 0])
    .add(new CylinderGeometry(0.03, 0.04, 0.03, 6), 0x2a2420, [0, 0.03, 0.32], [Math.PI / 2, 0, 0])
    .build();

// Worn things, folded: a coat, a cloak, armour.
export const coatModel = (colour, collar = colour, metal = null) => {
  const b = R(275)
    .add(new BoxGeometry(0.42, 0.06, 0.34), colour, [0, 0.03, 0])
    .add(new BoxGeometry(0.42, 0.05, 0.08), collar, [0, 0.08, -0.13])
    .add(new BoxGeometry(0.1, 0.05, 0.26), colour, [0.2, 0.07, 0.02], [0, 0.2, 0])
    .add(new BoxGeometry(0.1, 0.05, 0.26), colour, [-0.2, 0.07, 0.02], [0, -0.2, 0]);
  if (metal) b.add(new BoxGeometry(0.3, 0.06, 0.22), metal, [0, 0.1, 0.03], [0, 0, 0], [1, 1, 1], 0.03).add(new BoxGeometry(0.32, 0.03, 0.03), 0x4a5058, [0, 0.14, -0.06]);
  return b.build();
};

// Cave finds you can carry.
export const crystalItemModel = () =>
  R(277)
    .add(new ConeGeometry(0.035, 0.18, 5), 0x9ae8ff, [0, 0.09, 0], [0.15, 0, 0.1], [1, 1, 1], 0.1)
    .add(new ConeGeometry(0.025, 0.12, 5), 0xc0a0ff, [0.04, 0.06, 0.02], [0.2, 0, -0.5], [1, 1, 1], 0.1)
    .add(new DodecahedronGeometry(0.04, 0), 0x6a6572, [0, 0.02, 0], [0, 0, 0], [1.4, 0.5, 1.2])
    .build();
export const caveLampModel = () =>
  R(279)
    .add(new CylinderGeometry(0.07, 0.08, 0.04, 6), 0x5a5058, [0, 0.02, 0])
    .add(new ConeGeometry(0.035, 0.16, 5), 0x9ae8ff, [0, 0.12, 0], [0, 0, 0], [1, 1, 1], 0.1)
    .add(new ConeGeometry(0.025, 0.1, 5), 0xb8f0ff, [0.03, 0.09, 0.02], [0.2, 0, -0.4])
    .add(new TorusGeometry(0.06, 0.008, 3, 8), 0x8a949e, [0, 0.06, 0], [Math.PI / 2, 0, 0])
    .build();
export const guanoModel = () => sack(281, 0x7a6a50, 0x4a4030);

/** Anything else: a cloth parcel tied up with cord (never a round lump). */
export const parcelModel = (colour = 0x9a8a6a) =>
  R(283)
    .add(new BoxGeometry(0.2, 0.1, 0.15), colour, [0, 0.05, 0], [0, 0.2, 0])
    .add(new BoxGeometry(0.205, 0.012, 0.02), 0x5a3c24, [0, 0.1, 0], [0, 0.2, 0])
    .add(new BoxGeometry(0.02, 0.012, 0.155), 0x5a3c24, [0, 0.1, 0], [0, 0.2, 0])
    .build();

/** A spawner (testing): a little wooden cage. */
export const spawnerModel = () => {
  const b = R(285).add(new BoxGeometry(0.24, 0.02, 0.24), 0x7a5232, [0, 0.01, 0]).add(new BoxGeometry(0.24, 0.02, 0.24), 0x7a5232, [0, 0.21, 0]);
  for (const [x, z] of [[0.11, 0.11], [-0.11, 0.11], [0.11, -0.11], [-0.11, -0.11], [0, 0.11], [0, -0.11], [0.11, 0], [-0.11, 0]]) b.add(new BoxGeometry(0.015, 0.2, 0.015), 0x8a6038, [x, 0.11, z]);
  return b.build();
};

/** A thing that's built, small: a model scaled down to fit in a hand (and to lie on the ground as a bundle of its parts would). */
export function miniature(geometry, size = 0.28) {
  const g = geometry.clone();
  g.computeBoundingSphere();
  const k = size / g.boundingSphere.radius;
  g.scale(k, k, k);
  g.computeBoundingBox();
  g.translate(0, -g.boundingBox.min.y, 0);
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

/**
 * A vein of ore in a lump of rock, to break out with a pickaxe (see
 * Game.#mine): each its own look. Iron, rust-red blotches in grey stone;
 * coal, glossy black seams; gold, white quartz flecked with yellow; the
 * mountain ore that steel is made from, dark slate with silver-blue
 * crystals.
 */
export function oreNodeModel(id) {
  const look = {
    iron: { rock: 0x7a746c, bits: [0xa0502c, 0xb8683a, 0x8a3e24], n: 8, shape: 'dodeca' },
    coal: { rock: 0x6a6662, bits: [0x1a1816, 0x24201e, 0x0e0c0c], n: 9, shape: 'box' },
    goldOre: { rock: 0xe8e2d4, bits: [0xf0c030, 0xe0a820, 0xffd860], n: 9, shape: 'octa' },
    mountainOre: { rock: 0x3a3e48, bits: [0xc8d4e4, 0x9ab0c8, 0xe8f0f8], n: 8, shape: 'octa' },
  }[id] ?? { rock: 0x8e8a82, bits: [0x9a968e], n: 0, shape: 'octa' };
  const b = R(301 + id.length);
  const rand = mulberry32(17 + id.length * 7);
  b.add(new DodecahedronGeometry(0.34, 0), look.rock, [0, 0.2, 0], [0.3, 0.5, 0.2], [1.25, 0.8, 1.05]);
  b.add(new DodecahedronGeometry(0.2, 0), look.rock, [0.26, 0.12, 0.14], [0.5, 0.1, 0.4], [1, 0.8, 1]);
  for (let k = 0; k < look.n; k++) {
    const a = rand() * Math.PI * 2, el = 0.25 + rand() * 1.0;
    const x = Math.cos(a) * Math.cos(el) * 0.38, y = 0.2 + Math.sin(el) * 0.26, z = Math.sin(a) * Math.cos(el) * 0.33;
    const size = 0.05 + rand() * 0.05, c = look.bits[k % look.bits.length];
    const geo = look.shape === 'box' ? new BoxGeometry(size * 2, size * 1.2, size * 1.6) : look.shape === 'dodeca' ? new DodecahedronGeometry(size, 0) : new OctahedronGeometry(size, 0);
    b.add(geo, c, [x, y, z], [rand() * 3, rand() * 3, rand() * 3], [1, look.shape === 'octa' ? 1.6 : 1, 1], 0.06);
  }
  return b.build();
}
