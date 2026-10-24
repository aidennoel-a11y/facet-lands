import { BoxGeometry, BufferAttribute, BufferGeometry, Color, ConeGeometry, CylinderGeometry, DodecahedronGeometry, Euler, IcosahedronGeometry, Matrix4, OctahedronGeometry, Quaternion, TorusGeometry, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../noise/random.js';

const tint = new Color(), m4 = new Matrix4(), q = new Quaternion(), e = new Euler(), p = new Vector3(), s = new Vector3();
const tint2 = new Color();

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

/** A sickle: a short handle, a thin blade curving round in a crescent. */
export const sickleModel = () => {
  const b = new Parts(86).add(new CylinderGeometry(0.02, 0.024, 0.3, 5), 0x8a6038, [0, 0.15, 0]);
  for (let k = 0; k < 7; k++) {
    const a = 0.2 + (k / 6) * 2.6, r = 0.16;
    b.add(new BoxGeometry(0.075, 0.012, 0.022), 0xc8ccd0, [Math.sin(a) * r * 0.9, 0.3 + r - Math.cos(a) * r, 0], [0, 0, -a], [1, 1, 1], 0.04);
  }
  return b.build();
};

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
/**
 * A lean-to: two forked poles in front holding a ridge pole, long poles
 * leaning from it back down to the ground, and leafy boughs laid over
 * them, thick enough to shed the rain.
 */
export function leanToModel() {
  const b = new Parts(141);
  const rand = mulberry32(141);
  const bark = 0x6e4c32;
  for (const x of [-1.2, 1.2]) b.log([x, -0.1, 0.9], [x, 1.85, 0.9], 0.06, bark);
  b.log([-1.45, 1.8, 0.9], [1.45, 1.8, 0.9], 0.055, bark);
  for (let k = 0; k < 6; k++) {
    const x = -1.2 + k * 0.48;
    b.log([x, 1.82, 0.95], [x, -0.05, -1.3], 0.04, 0x7a5638);
  }
  // (The boughs: green, overlapping, a little ragged.)
  const leaf = [0x4f7a34, 0x5c8a3c, 0x46702e];
  for (let row = 0; row < 5; row++) {
    for (let k = 0; k < 6; k++) {
      const t = (row + 0.5) / 5, y = 1.82 - t * 1.85, z = 0.95 - t * 2.25;
      b.add(new BoxGeometry(0.62 + rand() * 0.2, 0.06, 0.55), leaf[(row + k) % 3], [-1.25 + k * 0.5 + (rand() - 0.5) * 0.1, y + 0.08, z], [0.68 + (rand() - 0.5) * 0.15, (rand() - 0.5) * 0.3, (rand() - 0.5) * 0.2], [1, 1, 1], 0.15);
    }
  }
  return b.build();
}

/** A water filter: a bark cone on a little tripod, sand and charcoal in it, a pot under it to catch the water. */
/** A repair bench: a heavy plank top on log legs, a vice at one end, a whetstone and a few tools laid on it. */
/** Heights along something laid over the land, one a metre (`ys`, from its start), at `t` metres along. */
const alongYs = (ys, t) => {
  const i = Math.min(ys.length - 2, Math.max(0, Math.floor(t))), f = Math.min(1, Math.max(0, t - i));
  return ys.length < 2 ? 0 : ys[i] + (ys[i + 1] - ys[i]) * f;
};

/** A paved road `len` m long, 2.4 m wide, over the lie of the land (`ys`): flagstones in rows, kerbstones along its sides. */
export function stoneRoadModel(len, ys) {
  const b = new Parts(291), rand = mulberry32(291 + Math.round(len)), FLAG = [0x9a968e, 0x8e8a82, 0xa6a298, 0x88847c];
  for (let z = 0.25, row = 0; z < len; z += 0.5, row++) {
    const y = alongYs(ys, z), slope = Math.atan2(alongYs(ys, z + 0.25) - alongYs(ys, z - 0.25), 0.5);
    for (let x = -0.9 + (row % 2) * 0.15; x < 1.0; x += 0.6) {
      const w = Math.min(0.58, 1.05 - x);
      if (w < 0.15) continue;
      b.add(new BoxGeometry(w - 0.04, 0.12, 0.46), FLAG[Math.floor(rand() * FLAG.length)], [x + w / 2 - 0.3, y + 0.02, z], [-slope, (rand() - 0.5) * 0.06, 0], [1, 1, 1], 0.06);
    }
    for (const x of [-1.2, 1.2]) b.add(new BoxGeometry(0.22, 0.2, 0.48), 0x6e6a64, [x, y + 0.04, z], [-slope, 0, 0], [1, 1, 1], 0.08);
  }
  return b.build();
}

/** A zip line: a tall post at its top end, a lower one at the foot (`rise` m lower, `len` m on), the steel cable between, a pulley on it. */
export function zipLineModel(len, rise) {
  const b = new Parts(293), top = 4.2, low = 2.8, sag = Math.min(2, len * 0.025);
  for (const [z, y0, h] of [[0, 0, top], [len, rise, low]]) {
    b.log([0, y0 - 0.6, z], [0, y0 + h + 0.3, z], 0.16, 0x6e4c32, 0xc8a070, 8);
    b.log([-0.6, y0 + h - 0.2, z], [0.6, y0 + h - 0.2, z], 0.08, 0x6e4c32, 0xc8a070, 6);
    for (const s of [-1, 1]) b.log([0, y0 + h, z], [s * 1.2, y0 - 0.3, z + (z ? 0.8 : -0.8)], 0.025, 0x8a8a8a, 0x8a8a8a, 4); // (guy wires)
  }
  // (A platform to step off from at the top.)
  b.add(new BoxGeometry(1.4, 0.1, 1.2), 0x8a6a48, [0, 1.6, -0.6]);
  for (const x of [-0.6, 0.6]) b.log([x, 0, -1.1], [x, 1.6, -1.1], 0.06, 0x6e4c32);
  const n = 20, at = (k) => [0, top + (rise + low - top) * (k / n) - sag * Math.sin((Math.PI * k) / n), (len * k) / n];
  for (let k = 0; k < n; k++) b.log(at(k), at(k + 1), 0.022, 0x9a9ea4, 0x9a9ea4, 4);
  b.add(new BoxGeometry(0.12, 0.18, 0.22), 0x4a4e54, [0, top - 0.12, 0.4]); // (the pulley, waiting at the top)
  b.add(new BoxGeometry(0.5, 0.05, 0.05), 0x3a2a1e, [0, top - 0.42, 0.4]);
  return b.build();
}

/** An irrigation ditch `len` m long over the land (`ys`): a trench of dark earth, water running in its bed, spoil banked either side. */
export function ditchModel(len, ys) {
  const b = new Parts(295), rand = mulberry32(295);
  for (let z = 0.5; z < len; z += 1) {
    const y = alongYs(ys, z), slope = Math.atan2(alongYs(ys, z + 0.5) - alongYs(ys, z - 0.5), 1);
    b.add(new BoxGeometry(0.7, 0.04, 1.02), 0x3a2a1e, [0, y - 0.18, z], [-slope, 0, 0], [1, 1, 1], 0.05);
    b.add(new BoxGeometry(0.62, 0.02, 1.02), 0x3e6a84, [0, y - 0.09, z], [-slope, 0, 0], [1, 1, 1], 0.05); // (the water)
    for (const s of [-1, 1]) b.add(new BoxGeometry(0.35, 0.16, 1.04), [0x5a4430, 0x4e3a28][Math.floor(rand() * 2)], [s * 0.52, y - 0.02, z], [-slope, 0, s * 0.35], [1, 1, 1], 0.08);
  }
  return b.build();
}

/**
 * A bridge `len` metres long, rising `rise` from where it starts to where
 * it ends, along +z: a log bridge (two big logs laid across, split planks
 * pegged over them, a pole rail each side) or a rope bridge (planks slung
 * on ropes, sagging in the middle, rope rails, posts at each end).
 */
export const BRIDGE_WIDTH = 1.6;
export function bridgeSag(style, len) {
  return style === 'rope' ? Math.min(1.2, 0.05 * len) : 0;
}
export function bridgeModel(style, len, rise) {
  const b = new Parts(151 + Math.round(len));
  const rand = mulberry32(151 + Math.round(len * 10));
  const sag = bridgeSag(style, len), W = BRIDGE_WIDTH / 2;
  const at = (t) => rise * t - sag * Math.sin(Math.PI * t);
  if (style === 'log') {
    for (const x of [-0.5, 0.5]) b.log([x, at(0) - 0.25, -0.4], [x, at(1) - 0.25, len + 0.4], 0.22, 0x6e4c32, 0xc8a070, 8);
  }
  // (The deck: a plank every 0.33 m, each its own shade, a little askew.)
  const n = Math.ceil(len / 0.33);
  for (let k = 0; k <= n; k++) {
    const t = k / n, z = t * len, slope = Math.atan2(rise - sag * Math.PI * Math.cos(Math.PI * t), len);
    b.add(new BoxGeometry(BRIDGE_WIDTH + (rand() - 0.5) * 0.15, 0.06, 0.28), [0x9a7048, 0x8a6040, 0xa87a50][k % 3], [(rand() - 0.5) * 0.06, at(t) + (style === 'log' ? 0 : -0.03), z], [-slope, (rand() - 0.5) * 0.06, 0], [1, 1, 1], 0.1);
  }
  // (Rails: rope for a rope bridge, poles for a log one; a post at each end, each side.)
  const rail = style === 'rope' ? 0xc8a878 : 0x7a5638, rr = style === 'rope' ? 0.025 : 0.05;
  for (const x of [-W, W]) {
    const steps = 12;
    for (let k = 0; k < steps; k++) {
      const t0 = k / steps, t1 = (k + 1) / steps;
      b.log([x, at(t0) + 0.95, t0 * len], [x, at(t1) + 0.95, t1 * len], rr, rail, rail, 5);
      if (style === 'rope') b.log([x, at(t0) + 0.02, t0 * len], [x, at(t0) + 0.95, t0 * len], 0.012, rail, rail, 4);
      else if (k % 3 === 0) b.log([x, at(t0) - 0.05, t0 * len], [x, at(t0) + 0.95, t0 * len], 0.04, rail, rail, 5);
    }
    for (const t of [0, 1]) b.log([x, at(t) - 0.6, t * len], [x, at(t) + 1.15, t * len], 0.08, 0x6e4c32);
  }
  return b.build();
}

/** A chair: a seat, four legs, a slatted back. */
/** An egg (or a cooked one, cut open). */
/** A bird's nest: a bowl of woven twigs. (Its eggs: nestEggsModel, drawn while there are some.) */
export function nestModel() {
  const b = new Parts(171);
  const rand = mulberry32(171);
  b.add(new CylinderGeometry(0.2, 0.12, 0.1, 9, 1, true), 0x7a5a38, [0, 0.05, 0]);
  b.add(new CylinderGeometry(0.12, 0.12, 0.02, 9), 0x6a4a2c, [0, 0.01, 0]);
  for (let k = 0; k < 10; k++) {
    const a = rand() * 6.28;
    b.add(new BoxGeometry(0.22, 0.015, 0.015), [0x8a6a44, 0x6a4a2c, 0x9a7a50][k % 3], [Math.cos(a) * 0.16, 0.06 + rand() * 0.04, Math.sin(a) * 0.16], [0, -a + 1.57, rand() * 0.3]);
  }
  return b.build();
}
export function nestEggsModel() {
  const b = new Parts(172);
  for (const [x, z] of [[-0.04, 0.02], [0.04, 0.03], [0, -0.05]]) b.add(new DodecahedronGeometry(0.035, 1), 0xb8d4e0, [x, 0.06, z], [0, 0, 0], [0.85, 1.1, 0.85], 0.04);
  return b.build();
}

/** A wild bees' nest: a grey papery comb hanging in tiers under a bough. */
export function beehiveModel() {
  const b = new Parts(173);
  b.add(new BoxGeometry(0.06, 0.12, 0.06), 0x6e4c32, [0, 0.3, 0]);
  for (const [y, r] of [[0.15, 0.2], [0, 0.26], [-0.16, 0.24], [-0.3, 0.17], [-0.4, 0.08]]) b.add(new DodecahedronGeometry(r, 0), [0x9a8a70, 0x8a7a62, 0xa89878][Math.round(r * 100) % 3], [0, y, 0], [0, y * 3, 0], [1, 0.7, 1], 0.12);
  b.add(new CylinderGeometry(0.04, 0.04, 0.02, 6), 0x2a2018, [0.2, -0.05, 0.12], [0, 0, 1.2]);
  return b.build();
}

/** An oyster (rough grey shell, a pearly lip), a seashell (a fan, ridged), a pearl. */
export function oysterModel() {
  const b = new Parts(167);
  b.add(new DodecahedronGeometry(0.07, 0), 0x7a7468, [0, 0.03, 0], [0, 0, 0], [1.2, 0.45, 0.9], 0.02);
  b.add(new DodecahedronGeometry(0.06, 0), 0xd8d0c4, [0, 0.045, 0.005], [0, 0.4, 0], [1.05, 0.25, 0.8]);
  return b.build();
}
export function seashellModel() {
  const b = new Parts(168);
  b.add(new ConeGeometry(0.06, 0.09, 6, 1), 0xf0d8c4, [0, 0.02, 0], [Math.PI / 2, 0, 0], [1, 1, 0.35]);
  return b.build();
}
export function pearlModel() {
  const b = new Parts(169);
  b.add(new IcosahedronGeometry(0.02, 1), 0xf4f0ea, [0, 0.02, 0]);
  return b.build();
}

export function eggModel(cooked) {
  const b = new Parts(166);
  b.add(new DodecahedronGeometry(0.05, 1), cooked ? 0xfafaf4 : 0xf0e6d2, [0, 0.05, 0], [0, 0, 0], [0.85, 1.15, 0.85], 0.03);
  if (cooked) b.add(new CylinderGeometry(0.025, 0.025, 0.01, 8), 0xf0b830, [0, 0.1, 0]);
  return b.build();
}

/** A chair: a seat, four legs, a slatted back. */
export function chairModel() {
  const b = new Parts(161);
  b.add(new BoxGeometry(0.5, 0.06, 0.5), 0x9a7048, [0, 0.46, 0]);
  for (const [x, z] of [[-0.21, -0.21], [0.21, -0.21], [-0.21, 0.21], [0.21, 0.21]]) b.add(new BoxGeometry(0.05, 0.46, 0.05), 0x7a5638, [x, 0.23, z]);
  for (const x of [-0.21, 0.21]) b.add(new BoxGeometry(0.05, 0.5, 0.05), 0x7a5638, [x, 0.72, -0.21]);
  for (const y of [0.62, 0.78, 0.92]) b.add(new BoxGeometry(0.42, 0.06, 0.03), 0x8a6040, [0, y, -0.21]);
  return b.build();
}

/** A table: a plank top on four legs, with a jug and a cup. */
export function tableModel() {
  const b = new Parts(162);
  b.add(new BoxGeometry(1.4, 0.07, 0.85), 0x9a7048, [0, 0.76, 0]);
  for (const [x, z] of [[-0.6, -0.35], [0.6, -0.35], [-0.6, 0.35], [0.6, 0.35]]) b.add(new BoxGeometry(0.07, 0.76, 0.07), 0x7a5638, [x, 0.38, z]);
  b.add(new CylinderGeometry(0.07, 0.09, 0.2, 7), 0xa86a44, [0.35, 0.89, 0.1]);
  b.add(new CylinderGeometry(0.04, 0.035, 0.08, 6), 0xc8b090, [0.1, 0.83, -0.15]);
  return b.build();
}

/** Shelves: an open frame of three boards against a wall: storage (six slots). */
export function shelfModel() {
  const b = new Parts(163);
  for (const x of [-0.6, 0.6]) b.add(new BoxGeometry(0.06, 1.6, 0.36), 0x7a5638, [x, 0.8, 0]);
  for (const y of [0.1, 0.6, 1.1, 1.58]) b.add(new BoxGeometry(1.26, 0.05, 0.36), 0x9a7048, [0, y, 0]);
  b.add(new BoxGeometry(1.26, 1.6, 0.03), 0x6a4a30, [0, 0.8, -0.17]);
  return b.build();
}

/** A trophy rack: a board on a post, to hang one of the great beasts' trophies on. */
export function trophyRackModel() {
  const b = new Parts(164);
  b.log([0, 0, 0], [0, 1.9, 0], 0.07, 0x6e4c32);
  b.add(new BoxGeometry(1.1, 0.75, 0.08), 0x8a6040, [0, 1.55, 0.08]);
  b.add(new BoxGeometry(0.04, 0.12, 0.12), 0x5a3a24, [0, 1.45, 0.16]);
  for (const [x, z] of [[-0.35, 0.3], [0.35, 0.3], [0, -0.35]]) b.log([0, 0.5, 0], [x, -0.05, z], 0.04, 0x6e4c32);
  return b.build();
}

/** A gatehouse over a palisade's gateway, 4 m: a squat log tower each side, a walkway across over the gate, a stake parapet, little roofs on the towers. (The gate's leaves swing in it: see gateDoorModel.) */
export function gatehouseModel() {
  const b = new Parts(301), rand = mulberry32(301), L = WALL_LENGTH;
  for (const sx of [-1, 1]) {
    const x = sx * (L / 2 + 0.25);
    b.add(new BoxGeometry(1.5, 0.5, 1.5), 0x7e7a72, [x, 0.1, 0]); // (the footing)
    // (Log courses on the outer faces; a solid core behind them.)
    b.add(new BoxGeometry(1.3, 4.8, 1.3), 0x5e4630, [x, 2.8, 0]);
    for (let y = 0.45; y < 5.2; y += 0.42) {
      for (const dz of [-0.62, 0.62]) b.log([x - 0.75, y, dz], [x + 0.75, y, dz], 0.19, [0x7a5a3a, 0x6e5034][Math.floor(rand() * 2)], 0xc8a070, 5);
      b.log([x + sx * 0.62, y + 0.21, -0.75], [x + sx * 0.62, y + 0.21, 0.75], 0.19, [0x7a5a3a, 0x6e5034][Math.floor(rand() * 2)], 0xc8a070, 5);
    }
    b.add(new ConeGeometry(1.25, 1.2, 4), 0x5a4232, [x, 6.0, 0], [0, Math.PI / 4, 0]);
    b.add(new BoxGeometry(0.4, 0.3, 0.06), 0x1a1410, [x, 3.8, 0.66]); // (an arrow slit)
  }
  // The walkway over the gate, and its parapet of sharpened stakes.
  b.add(new BoxGeometry(L + 0.4, 0.16, 1.4), 0x8a6a48, [0, 3.6, 0]);
  for (const z of [-0.65, 0.65]) b.log([-L / 2, 3.6, z], [L / 2, 3.6, z], 0.12, 0x6e4c32);
  for (let x = -L / 2 + 0.2; x < L / 2; x += 0.34) {
    b.add(new CylinderGeometry(0.12, 0.13, 1.1, 6), 0x7a6448, [x, 4.2, 0.62]);
    b.add(new ConeGeometry(0.12, 0.3, 6), 0xb0946a, [x, 4.9, 0.62]);
  }
  b.log([-L / 2 + 0.2, 3.5, -0.3], [L / 2 - 0.2, 3.5, -0.3], 0.18, 0x6e4c32); // (the lintel beam over the gate)
  return b.build();
}

/** A stone fireplace and chimney: a hearth, a firebox open at the front, the stack going up, a crane for a pot. */
export function fireplaceModel() {
  const b = new Parts(303), rand = mulberry32(303), ST = [0x8a867c, 0x7e7a72, 0x96928a, 0x726e66];
  const stone = (w, h, d, x, y, z) => b.add(new BoxGeometry(w, h, d), ST[Math.floor(rand() * ST.length)], [x, y, z], [0, (rand() - 0.5) * 0.05, 0], [1, 1, 1], 0.05);
  stone(1.9, 0.2, 1.3, 0, 0.1, 0.1); // (the hearth)
  for (let y = 0.3; y < 1.4; y += 0.28) for (const x of [-0.7, 0.7]) stone(0.46, 0.28, 0.9, x, y, -0.05);
  stone(1.9, 0.3, 0.9, 0, 1.45, -0.05); // (the lintel)
  stone(1.9, 1.3, 0.25, 0, 0.75, -0.42); // (the back of the firebox)
  for (let y = 1.75, w = 1.6; y < 4.6; y += 0.3, w = Math.max(0.8, w - 0.12)) stone(w, 0.3, 0.8, 0, y, -0.1);
  b.add(new BoxGeometry(0.85, 0.12, 0.85), 0x5e5a54, [0, 4.65, -0.1]);
  b.add(new BoxGeometry(0.9, 0.08, 0.6), 0x2a2420, [0, 0.24, 0.0]); // (the ashes)
  b.log([0.55, 0.25, 0.1], [0.55, 1.2, 0.1], 0.025, 0x3a3a3a, 0x3a3a3a, 4); // (the crane)
  b.log([0.55, 1.15, 0.1], [0, 1.15, 0.1], 0.02, 0x3a3a3a, 0x3a3a3a, 4);
  return b.build();
}

/** A lantern on a post: a squared post, an arm, the iron lantern hanging, its glass glowing. */
export function lanternPostModel() {
  const b = new Parts(305);
  b.add(new BoxGeometry(0.18, 2.7, 0.18), 0x6e4c32, [0, 1.35, 0]);
  b.add(new BoxGeometry(0.7, 0.1, 0.1), 0x6e4c32, [0.3, 2.55, 0]);
  b.add(new BoxGeometry(0.06, 0.4, 0.06), 0x5a3c24, [0.15, 2.35, 0], [0, 0, 0.8]);
  b.add(new BoxGeometry(0.03, 0.2, 0.03), 0x2a2a2a, [0.55, 2.42, 0]);
  b.add(new BoxGeometry(0.24, 0.3, 0.24), 0xffd890, [0.55, 2.16, 0], [0, 0, 0], [1, 1, 1], 0); // (the glass: lit)
  b.add(new ConeGeometry(0.2, 0.16, 4), 0x2a2a2a, [0.55, 2.38, 0], [0, Math.PI / 4, 0]);
  b.add(new BoxGeometry(0.26, 0.04, 0.26), 0x2a2a2a, [0.55, 2.0, 0]);
  b.add(new BoxGeometry(0.4, 0.12, 0.4), 0x7e7a72, [0, 0.06, 0]);
  return b.build();
}

/** A flower bed: a low border of stones round turned earth, wildflowers growing thick in it. */
export function flowerBedModel() {
  const b = new Parts(307), rand = mulberry32(307), W = 1.2, D = 0.7;
  for (let a = 0; a < Math.PI * 2; a += 0.36) b.add(new OctahedronGeometry(0.15, 0), [0x8a867c, 0x96928a, 0x7e7a72][Math.floor(rand() * 3)], [Math.cos(a) * W, 0.08, Math.sin(a) * D], [rand(), rand(), 0], [1.2, 0.7, 1]);
  b.add(new CylinderGeometry(1, 1, 0.16, 12), 0x4a3424, [0, 0.08, 0], [0, 0, 0], [W * 0.95, 1, D * 0.95]);
  const PETAL = [0xd83a4a, 0xf0c838, 0x8a5ad0, 0xf4f0e8, 0xf08a30, 0xe86aa8, 0x4a7ad8];
  for (let k = 0; k < 28; k++) {
    const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * 0.85, x = Math.cos(a) * r * W, z = Math.sin(a) * r * D, h = 0.25 + rand() * 0.35;
    b.add(new CylinderGeometry(0.012, 0.015, h, 3, 1, true), 0x4a7a32, [x, 0.16 + h / 2, z]);
    b.add(new OctahedronGeometry(0.07 + rand() * 0.04, 0), PETAL[Math.floor(rand() * PETAL.length)], [x, 0.18 + h, z], [rand(), rand(), 0], [1, 0.6, 1]);
    if (rand() < 0.5) b.add(new BoxGeometry(0.12, 0.01, 0.05), 0x5a8a3a, [x, 0.22 + h * 0.4, z], [0, rand() * 3, 0.4]);
  }
  return b.build();
}

/** A dock: piles driven down into the bed, a plank deck out over the water 8 m (along +z from the bank), a rail along one side, a mooring post at the end. */
export function dockModel() {
  const b = new Parts(309), rand = mulberry32(309), L = 8, W = 2.4, top = 0.2;
  for (let z = 0.6; z <= L; z += 2.4) for (const x of [-W / 2 + 0.1, W / 2 - 0.1]) b.log([x, -3.2, z], [x, top - 0.05, z], 0.13, 0x5e4430, 0xb89468, 7);
  for (const x of [-W / 2 + 0.1, W / 2 - 0.1]) b.log([x, top - 0.15, 0], [x, top - 0.15, L], 0.1, 0x6e4c32);
  for (let z = 0.15; z < L; z += 0.3) b.add(new BoxGeometry(W + (rand() - 0.5) * 0.1, 0.06, 0.27), [0x9a7048, 0x8a6040, 0xa87a50][Math.floor(rand() * 3)], [(rand() - 0.5) * 0.05, top, z], [0, (rand() - 0.5) * 0.04, 0], [1, 1, 1], 0.08);
  for (let z = 0.6; z <= L; z += 2.4) b.log([W / 2 - 0.1, top, z], [W / 2 - 0.1, top + 0.95, z], 0.05, 0x6e4c32);
  b.log([W / 2 - 0.1, top + 0.95, 0.5], [W / 2 - 0.1, top + 0.95, L], 0.04, 0x7a5638);
  b.log([-W / 2 + 0.2, top, L - 0.3], [-W / 2 + 0.2, top + 0.7, L - 0.3], 0.1, 0x5e4430, 0xb89468, 7);
  b.add(new TorusGeometry(0.12, 0.025, 4, 8), 0xc8a878, [-W / 2 + 0.2, top + 0.45, L - 0.3], [Math.PI / 2, 0, 0]);
  return b.build();
}

/** Scaffolding round a building going up: poles at its corners and between, boards across every metre and a half up, braces. */
export function scaffoldModel(w, d, h) {
  const b = new Parts(181), pole = 0x8a6a48, board = 0xa8845a;
  const xs = [-w / 2 - 0.4, w / 2 + 0.4], zs = [-d / 2 - 0.4, d / 2 + 0.4];
  for (const x of xs) for (const z of zs) b.log([x, 0, z], [x, h + 0.6, z], 0.06, pole, 0xc8a070, 5);
  for (let y = 1.4; y < h + 0.4; y += 1.5) {
    for (const z of zs) b.add(new BoxGeometry(w + 1, 0.06, 0.3), board, [0, y, z]);
    for (const x of xs) b.add(new BoxGeometry(0.3, 0.06, d + 1), board, [x, y, 0]);
  }
  for (const z of zs) b.log([xs[0], 0.2, z], [xs[1], Math.min(h, 3), z], 0.035, pole, 0xc8a070, 4);
  return b.build();
}

/** A water mill's house: a stone footing on the bank, a timber mill house, a shingled roof; the wheel turns on its side (see millWheelModel). */
export function waterMillModel() {
  const b = new Parts(171);
  b.add(new BoxGeometry(2.6, 0.7, 2.4), 0x7e7a72, [0, 0.35, 0]);
  b.add(new BoxGeometry(2.4, 2.1, 2.2), 0x9a7048, [0, 1.75, 0]);
  for (const x of [-1.18, 1.18]) for (const z of [-1.08, 1.08]) b.add(new BoxGeometry(0.14, 2.1, 0.14), 0x6e4c32, [x, 1.75, z]);
  b.add(new BoxGeometry(2.8, 0.08, 1.5), 0x5a4232, [0, 3.15, -0.6], [0.6, 0, 0]);
  b.add(new BoxGeometry(2.8, 0.08, 1.5), 0x5a4232, [0, 3.15, 0.6], [-0.6, 0, 0]);
  b.add(new BoxGeometry(0.6, 1.1, 0.06), 0x3a2a1e, [0, 1.25, 1.12]);
  b.add(new CylinderGeometry(0.1, 0.1, 0.9, 6), 0x5a4232, [1.55, 1.3, 0], [0, 0, Math.PI / 2]); // (the axle out to the wheel)
  return b.build();
}

/** A mill's water wheel: a rim of boards on spokes, paddles all round (it turns about x). */
export function millWheelModel() {
  const b = new Parts(173), R = 1.25;
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    b.add(new BoxGeometry(0.5, 0.06, 0.42), 0x7a5a3c, [0, Math.cos(a) * R, Math.sin(a) * R], [a, 0, 0]); // (paddles)
    b.add(new BoxGeometry(0.08, 0.68, 0.1), 0x8a6a48, [0.2, Math.cos(a + 0.26) * R * 0.98, Math.sin(a + 0.26) * R * 0.98], [a + 0.26, 0, 0]); // (the rim)
    b.add(new BoxGeometry(0.08, 0.68, 0.1), 0x8a6a48, [-0.2, Math.cos(a + 0.26) * R * 0.98, Math.sin(a + 0.26) * R * 0.98], [a + 0.26, 0, 0]);
  }
  for (let k = 0; k < 4; k++) b.add(new BoxGeometry(0.07, R * 2, 0.08), 0x6e4c32, [0, 0, 0], [(k / 4) * Math.PI, 0, 0]); // (spokes)
  b.add(new CylinderGeometry(0.16, 0.16, 0.5, 6), 0x5a4232, [0, 0, 0], [0, 0, Math.PI / 2]);
  return b.build();
}

/** A windmill: a tapering tower of stone and plaster, a wooden cap; its sails turn at the front (see windmillSailsModel). */
export function windmillModel() {
  const b = new Parts(175);
  b.add(new CylinderGeometry(1.15, 1.55, 2.2, 8), 0x8a867c, [0, 1.1, 0]);
  b.add(new CylinderGeometry(0.95, 1.15, 3.6, 8), 0xd8d0bc, [0, 4.0, 0]);
  b.add(new ConeGeometry(1.25, 1.4, 8), 0x6a4a34, [0, 6.5, 0]);
  b.add(new BoxGeometry(0.7, 1.2, 0.08), 0x3a2a1e, [0, 0.7, 1.45], [0.1, 0, 0]);
  b.add(new BoxGeometry(0.4, 0.5, 0.06), 0x3a3430, [0, 3.8, 1.02], [0.06, 0, 0]);
  b.add(new CylinderGeometry(0.12, 0.12, 0.9, 6), 0x5a4232, [0, 5.9, 1.1], [Math.PI / 2, 0, 0]); // (the windshaft out to the sails)
  return b.build();
}

/** A windmill's four sails: lattice arms with cloth on them (it turns about z). */
export function windmillSailsModel() {
  const b = new Parts(177), L = 3.4;
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2, cx = Math.sin(a), cy = Math.cos(a);
    b.add(new BoxGeometry(0.12, L, 0.1), 0x6e4c32, [cx * L * 0.5, cy * L * 0.5, 0], [0, 0, -a]);
    b.add(new BoxGeometry(0.75, L * 0.78, 0.03), 0xece4d0, [cx * L * 0.56 + cy * 0.42, cy * L * 0.56 - cx * 0.42, 0.04], [0, 0, -a]);
  }
  b.add(new CylinderGeometry(0.22, 0.22, 0.3, 6), 0x5a4232, [0, 0, 0], [Math.PI / 2, 0, 0]);
  return b.build();
}

/** Where something's planted: a ring of turned earth, and a stake. */
export function plantingModel() {
  const b = new Parts(166);
  b.add(new CylinderGeometry(0.55, 0.65, 0.08, 7), 0x5a4030, [0, 0.03, 0]);
  b.add(new CylinderGeometry(0.02, 0.025, 0.9, 4), 0x9a7a54, [0.18, 0.45, 0.05]);
  return b.build();
}

/** A hen-house for turkeys and ducks: a little plank hut on legs, a ramp up, a nesting box with straw. */
export function coopModel() {
  const b = new Parts(165);
  for (const [x, z] of [[-0.75, -0.6], [0.75, -0.6], [-0.75, 0.6], [0.75, 0.6]]) b.add(new BoxGeometry(0.08, 0.5, 0.08), 0x6e4c32, [x, 0.25, z]);
  b.add(new BoxGeometry(1.6, 0.9, 1.3), 0x9a7048, [0, 0.95, 0]);
  b.add(new BoxGeometry(1.8, 0.06, 0.9), 0x6a4a30, [0, 1.55, -0.35], [0.5, 0, 0]);
  b.add(new BoxGeometry(1.8, 0.06, 0.9), 0x6a4a30, [0, 1.55, 0.35], [-0.5, 0, 0]);
  b.add(new BoxGeometry(0.4, 0.45, 0.04), 0x2a2018, [0.3, 0.85, 0.66]);
  b.add(new BoxGeometry(0.36, 0.04, 1.1), 0x8a6040, [0.3, 0.3, 1.15], [0.45, 0, 0]);
  b.add(new BoxGeometry(0.5, 0.3, 0.4), 0x8a6040, [-0.6, 0.95, 0.86]);
  b.add(new BoxGeometry(0.44, 0.08, 0.34), 0xd8c070, [-0.6, 1.1, 0.86]);
  return b.build();
}

export function repairBenchModel() {
  const b = new Parts(143);
  b.add(new BoxGeometry(1.6, 0.12, 0.6), 0x9a7048, [0, 0.82, 0]);
  for (const [x, z] of [[-0.68, -0.22], [0.68, -0.22], [-0.68, 0.22], [0.68, 0.22]]) b.log([x, 0, z], [x, 0.78, z], 0.06, 0x6e4c32);
  b.add(new BoxGeometry(1.4, 0.06, 0.06), 0x6e4c32, [0, 0.3, 0.22]);
  b.add(new BoxGeometry(0.22, 0.18, 0.2), 0x7a7e84, [0.62, 0.97, 0]);
  b.add(new BoxGeometry(0.06, 0.08, 0.3), 0x5a5e64, [0.62, 1.08, 0]);
  b.add(new BoxGeometry(0.3, 0.06, 0.1), 0xb8b4a8, [-0.4, 0.91, 0.1]);
  b.add(new BoxGeometry(0.04, 0.03, 0.34), 0x8a5d38, [-0.05, 0.9, -0.12], [0, 0.4, 0]);
  b.add(new BoxGeometry(0.1, 0.05, 0.06), 0x9aa0a8, [0.08, 0.91, -0.24], [0, 0.4, 0]);
  return b.build();
}

export function waterFilterModel() {
  const b = new Parts(142);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    b.log([Math.cos(a) * 0.4, 0, Math.sin(a) * 0.4], [Math.cos(a) * 0.08, 1.25, Math.sin(a) * 0.08], 0.03, 0x7a5638);
  }
  b.add(new ConeGeometry(0.28, 0.5, 8, 1, true), 0x8a6a48, [0, 0.95, 0], [Math.PI, 0, 0]);
  b.add(new CylinderGeometry(0.25, 0.22, 0.06, 8), 0xe2c88a, [0, 1.18, 0]);
  b.add(new CylinderGeometry(0.2, 0.18, 0.05, 8), 0x2a2420, [0, 1.07, 0]);
  b.add(new CylinderGeometry(0.17, 0.14, 0.22, 8), 0x8a5a3a, [0, 0.11, 0]);
  b.add(new CylinderGeometry(0.15, 0.15, 0.02, 8), 0x5a9ac8, [0, 0.2, 0]);
  return b.build();
}

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
/**
 * A rope laid along its path from the stake ([distance out, height] at each
 * bend, in the stake's frame: out is +z): lying a hand's breadth off the
 * ground down a slope, hanging straight over a drop.
 */
export function ropePathModel(path) {
  const b = new Parts(108);
  const pts = path.map(([d, y]) => new Vector3(0, y + 0.1, d + 0.06));
  pts.unshift(new Vector3(0, 0.28, 0.0));
  for (let k = 1; k < pts.length; k++) {
    const from = pts[k - 1], to = pts[k];
    const dir = to.clone().sub(from), len = dir.length();
    if (len < 1e-3) continue;
    const g = new CylinderGeometry(0.025, 0.025, len + 0.03, 5, 1);
    g.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir.normalize()));
    const mid = from.clone().add(to).multiplyScalar(0.5);
    g.translate(mid.x, mid.y, mid.z);
    b.add(g, 0xb89a60, [0, 0, 0], [0, 0, 0], [1, 1, 1], 0.05);
  }
  return b.build();
}

/** A dug plot, 2 m square: dark turned earth in furrows. */
export const PLOT_SIZE = 2;
export function plotModel() {
  // The turned earth is the ground itself, painted dark in furrows (see
  // render/tilledSoil); only a few clods lie on it.
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

/**
 * A patch of a crop growing wild, fully grown: the plants scattered as
 * they seeded themselves, thick in the middle and thinning out at the
 * edges of a ragged patch some three or four metres across, each its own
 * height and lean (wheat golden and ripe, corn tall with its cobs out,
 * potatoes in leafy flowering clumps, carrots in feathery tops over their
 * orange shoulders).
 */
export function wildCropModel(kind) {
  const b = new Parts(131 + kind.length);
  const rand = mulberry32(kind.length * 13 + 5);
  const count = { wheat: 70, corn: 12, potato: 18, carrot: 26 }[kind];
  // (The patch's ragged outline: a few lobes.)
  const lobes = [rand() * 6, rand() * 6, 0.25 + rand() * 0.2, 0.15 + rand() * 0.15];
  const edge = (a) => 1.7 * (1 + lobes[2] * Math.sin(2 * a + lobes[0]) + lobes[3] * Math.sin(3 * a + lobes[1]));
  for (let n = 0; n < count; n++) {
    const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * edge(a) * (0.35 + 0.65 * rand());
    const x = Math.cos(a) * d, z = Math.sin(a) * d, big = 0.8 + 0.4 * rand() - 0.15 * (d / 1.8);
    if (kind === 'wheat') {
      for (let k = 0; k < 3; k++) {
        const dx = (rand() - 0.5) * 0.25, dz = (rand() - 0.5) * 0.25, h = (0.85 + rand() * 0.3) * big, lx = (rand() - 0.5) * 0.3, lz = (rand() - 0.5) * 0.3;
        b.add(new BoxGeometry(0.015, h, 0.015), 0xe2c470, [x + dx, h / 2, z + dz], [lx, 0, lz]);
        b.add(new BoxGeometry(0.04, 0.15, 0.04), 0xf4d888, [x + dx + lz * h * 0.5, h + 0.04, z + dz - lx * h * 0.5], [lx, 0, lz]);
      }
    } else if (kind === 'corn') {
      const h = 2.0 * big, lean = [(rand() - 0.5) * 0.12, (rand() - 0.5) * 0.12];
      b.add(new BoxGeometry(0.05, h, 0.05), 0x5a9a34, [x, h / 2, z], [lean[0], 0, lean[1]]);
      const t = rand() * 6;
      for (let k = 0; k < 5; k++) b.add(new BoxGeometry(0.55, 0.02, 0.08), 0x4e8c30, [x + 0.22 * Math.cos(t + k * 1.9), (0.35 + k * 0.32) * big, z + 0.22 * Math.sin(t + k * 1.9)], [0, -(t + k * 1.9), -0.45]);
      b.add(new BoxGeometry(0.09, 0.28, 0.09), 0xf0c830, [x + 0.07, 1.05 * big, z], [0, 0, 0.35]);
      if (rand() < 0.6) b.add(new BoxGeometry(0.09, 0.26, 0.09), 0xe8c028, [x - 0.06, 0.85 * big, z + 0.03], [0.2, 0, -0.35]);
      b.add(new BoxGeometry(0.04, 0.22, 0.04), 0xc8a060, [x, h + 0.08, z]);
    } else if (kind === 'potato') {
      for (let k = 0; k < 3; k++) b.add(new DodecahedronGeometry(0.2 * big, 0), k ? 0x4e8a30 : 0x5a9a38, [x + (rand() - 0.5) * 0.25, 0.2 * big, z + (rand() - 0.5) * 0.25], [rand(), rand(), 0], [1, 0.75, 1]);
      for (let k = 0; k < 3; k++) b.add(new DodecahedronGeometry(0.04, 0), 0xf0e8f8, [x + (rand() - 0.5) * 0.3, 0.38 * big, z + (rand() - 0.5) * 0.3]);
    } else {
      for (let k = 0; k < 7; k++) b.add(new BoxGeometry(0.02, 0.4 * big, 0.07), 0x4e9a34, [x + (rand() - 0.5) * 0.1, 0.2 * big, z + (rand() - 0.5) * 0.1], [(rand() - 0.5) * 0.8, rand() * 3, (rand() - 0.5) * 0.8]);
      b.add(new ConeGeometry(0.04, 0.08, 5), 0xe8762a, [x, 0.03, z], [Math.PI, 0, 0]);
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
/** Antlers for the wall: a pair, rising from the skull plate, tines on each (bigger and broader for an elk, palmate for a moose). */
export function trophyAntlersModel(kind = 'deer') {
  const b = R(kind === 'moose' ? 251 : kind === 'elk' ? 253 : 255), s = kind === 'moose' ? 1.5 : kind === 'elk' ? 1.35 : 1, col = 0xcbb690;
  b.add(new BoxGeometry(0.16, 0.08, 0.12), 0xe8e0cc, [0, 0, 0]);
  for (const side of [-1, 1]) {
    if (kind === 'moose') {
      b.add(new CylinderGeometry(0.025, 0.035, 0.22, 5), col, [side * 0.12, 0.02, 0], [0, 0, side * 1.2]);
      b.add(new BoxGeometry(0.4, 0.03, 0.26), col, [side * 0.38, 0.1, 0], [0, 0, side * 0.35]);
      for (let k = 0; k < 4; k++) b.add(new ConeGeometry(0.02, 0.12, 4), 0xd8c6a0, [side * (0.24 + k * 0.08), 0.22 + k * 0.03, 0.05], [0, 0, -side * 0.3]);
    } else {
      const lean = side * 0.55;
      b.add(new CylinderGeometry(0.018 * s, 0.03 * s, 0.5 * s, 5), col, [side * 0.16 * s, 0.2 * s, 0], [0, 0, -lean]);
      b.add(new CylinderGeometry(0.014 * s, 0.022 * s, 0.32 * s, 5), col, [side * 0.33 * s, 0.48 * s, 0], [0, 0, side * 0.25]);
      for (const [h, o] of [[0.18, 0.12], [0.32, 0.22], [0.46, 0.3]]) b.add(new ConeGeometry(0.012 * s, 0.16 * s, 4), 0xd8c6a0, [side * o * s, (h + 0.08) * s, 0.04], [0.2, 0, side * 0.1]);
    }
  }
  return b.build();
}

/** A skull for the wall (a wolf's, a cougar's): long-snouted, the eye sockets dark. */
export function skullModel(cat = false) {
  const b = R(cat ? 257 : 259), bone = 0xece4d4;
  b.add(new DodecahedronGeometry(0.1, 0), bone, [0, 0.08, 0], [0, 0, 0], [1, 0.8, 1.1]);
  b.add(new BoxGeometry(0.08, 0.06, cat ? 0.1 : 0.18), bone, [0, 0.05, cat ? 0.12 : 0.16]);
  for (const sx of [-1, 1]) {
    b.add(new BoxGeometry(0.035, 0.03, 0.02), 0x2a2420, [sx * 0.045, 0.1, 0.09]);
    b.add(new ConeGeometry(0.01, 0.05, 4), 0xf4ecdc, [sx * 0.03, 0.01, cat ? 0.15 : 0.22], [Math.PI, 0, 0]);
  }
  return b.build();
}

/** A bear's claws: five dark hooked claws on a thong. */
export function clawsModel() {
  const b = R(261);
  b.add(new CylinderGeometry(0.008, 0.008, 0.3, 4), 0x8a6a4a, [0, 0.05, 0], [0, 0, Math.PI / 2]);
  for (let k = 0; k < 5; k++) b.add(new ConeGeometry(0.018, 0.1, 4), 0x2e2622, [(k - 2) * 0.055, 0.0, 0.01], [0.3, 0, Math.PI]);
  return b.build();
}

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
/**
 * A boulder with iron in it, as the grey boulders lying about the land but
 * shot through with rusty ore: orange-brown lumps and streaks showing in
 * its faces, a stain run down from them.
 */
export function ironBoulderModel() {
  const b = R(331);
  const rand = mulberry32(331);
  b.add(new DodecahedronGeometry(0.7, 0), 0x8a867e, [0, 0.38, 0], [0.3, 0.5, 0.2], [1.3, 0.78, 1.08]);
  b.add(new DodecahedronGeometry(0.42, 0), 0x7e7a72, [0.62, 0.2, 0.3], [0.5, 0.1, 0.4], [1, 0.75, 1]);
  b.add(new DodecahedronGeometry(0.3, 0), 0x928e86, [-0.55, 0.14, -0.35], [0.2, 0.7, 0.1], [1, 0.7, 1.1]);
  const rust = [0xa0502c, 0xb8683a, 0x8a3e24, 0xc07040];
  for (let k = 0; k < 16; k++) {
    // (Set into the rock's faces: half sunk, half showing.)
    const a = rand() * Math.PI * 2, el = -0.1 + rand() * 1.1;
    const x = Math.cos(a) * Math.cos(el) * 0.82, y = 0.38 + Math.sin(el) * 0.48, z = Math.sin(a) * Math.cos(el) * 0.68;
    const size = 0.07 + rand() * 0.09;
    b.add(new DodecahedronGeometry(size, 0), rust[k % rust.length], [x, y, z], [rand() * 3, rand() * 3, rand() * 3], [1.4, 0.7, 1], 0.05);
  }
  // (Rust stains run down the sides.)
  for (let k = 0; k < 5; k++) {
    const a = rand() * Math.PI * 2;
    b.add(new BoxGeometry(0.1, 0.35, 0.03), 0x9a5a38, [Math.cos(a) * 0.86, 0.3, Math.sin(a) * 0.72], [0, -a + Math.PI / 2, 0.15], [1, 1, 1], 0.03);
  }
  return b.build();
}

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

// --- Building in stone, and floors ---------------------------------------------

// (Stone, a block at a time: rough-cut, each its own grey, a few mossed over.)
const STONE_GREYS = [0x8a8780, 0x7c7a74, 0x96928a, 0x6e6c68, 0x84806e, 0x9a968c];
const MOSS_GREENS = [0x4f6a34, 0x5c7a3a, 0x46602e];
function stoneCourses(b, rand, { length, height, depth, y0 = -0.3, course = 0.36, mossTop = 0.3, skip = null }) {
  for (let y = y0, row = 0; y < height - 0.05; y += course, row++) {
    const h = Math.min(course, height - y) - 0.03;
    let x = -length / 2 + (row % 2 ? 0.25 : 0);
    if (row % 2) {
      // (Each other course set over the joins beneath: a half block at its end.)
      b.add(new BoxGeometry(0.22, h, depth), STONE_GREYS[Math.floor(rand() * STONE_GREYS.length)], [-length / 2 + 0.11, y + h / 2, 0], [0, 0, 0], [1, 1, 1], 0.08);
    }
    while (x < length / 2 - 0.05) {
      const w = Math.min(0.45 + rand() * 0.45, length / 2 - x);
      const top = y + h > height - course;
      const colour = top && rand() < mossTop ? MOSS_GREENS[Math.floor(rand() * 3)] : STONE_GREYS[Math.floor(rand() * STONE_GREYS.length)];
      if (!skip?.(x + w / 2, y + h / 2)) b.add(new BoxGeometry(w - 0.03, h * (0.92 + rand() * 0.08), depth * (0.94 + rand() * 0.1)), colour, [x + w / 2, y + h / 2, (rand() - 0.5) * 0.04], [0, (rand() - 0.5) * 0.04, (rand() - 0.5) * 0.02], [1, 1, 1], 0.08);
      x += w;
    }
  }
  // (The mortar behind, so no light shows between the blocks.)
  if (!skip) b.add(new BoxGeometry(length - 0.02, height - y0 - 0.02, depth * 0.8), 0x5a5852, [0, (height + y0) / 2, 0], [0, 0, 0], [1, 1, 1], 0.02);
}

/** A section of stone wall, 4 m long (joins end to end like the palisade): courses of rough-cut blocks. */
export function stoneWallModel() {
  const b = new Parts(131), rand = mulberry32(131);
  stoneCourses(b, rand, { length: WALL_LENGTH, height: 3.2, depth: 0.6, mossTop: 0.35 });
  return b.build();
}

/** A low wall of field stones, 3 m long (joins end to end like a fence): dry-stacked, capped with flat stones. */
export function stoneFenceModel() {
  const b = new Parts(133), rand = mulberry32(133), L = FENCE_LENGTH;
  for (let y = -0.1, row = 0; y < 0.8; y += 0.28, row++) {
    for (let x = -L / 2 + 0.2 + (row % 2) * 0.15; x < L / 2 - 0.1; x += 0.32 + rand() * 0.12) {
      const r = 0.18 + rand() * 0.06;
      b.add(new DodecahedronGeometry(r, 0), STONE_GREYS[Math.floor(rand() * STONE_GREYS.length)], [x, y + r * 0.7, (rand() - 0.5) * 0.12], [rand() * 3, rand() * 3, rand() * 3], [1.2, 0.75, 1.1], 0.1);
    }
  }
  for (let x = -L / 2 + 0.25; x < L / 2; x += 0.5) {
    b.add(new BoxGeometry(0.52, 0.1, 0.5), rand() < 0.3 ? MOSS_GREENS[Math.floor(rand() * 3)] : STONE_GREYS[Math.floor(rand() * STONE_GREYS.length)], [x, 0.95, 0], [0, (rand() - 0.5) * 0.2, (rand() - 0.5) * 0.08], [1, 1, 1], 0.08);
  }
  b.add(new BoxGeometry(L - 0.1, 0.9, 0.36), 0x5a5852, [0, 0.45, 0], [0, 0, 0], [1, 1, 1], 0.02);
  return b.build();
}

/**
 * A chimney: a stone stack 5.5 m tall, its hearth open at the foot (set
 * your campfire in front of it, or a furnace beside it, and the smoke goes
 * up it: see Structures).
 */
export const CHIMNEY_TOP = 5.6;
export function chimneyModel() {
  const b = new Parts(135), rand = mulberry32(135), W = 1.2;
  for (let y = -0.3, row = 0; y < CHIMNEY_TOP - 0.3; y += 0.32, row++) {
    const w = y < 1.6 ? W : 0.8;
    const h = 0.29;
    for (const side of [0, 1, 2, 3]) {
      // (The hearth: the front left open, low down.)
      if (side === 0 && y > -0.1 && y < 1.0) continue;
      const along = side < 2;
      const off = (side % 2 ? -1 : 1) * (w / 2 - 0.12);
      const shift = (row % 2 ? 0.08 : -0.08) + (rand() - 0.5) * 0.04;
      b.add(new BoxGeometry(along ? w : 0.24, h, along ? 0.24 : w - 0.48), STONE_GREYS[Math.floor(rand() * STONE_GREYS.length)], along ? [shift, y + h / 2, off] : [off, y + h / 2, shift * 0.5], [0, 0, 0], [1, 1, 1], 0.08);
    }
  }
  // The lintel over the hearth, the soot inside it, and the stack's cap.
  b.add(new BoxGeometry(W + 0.06, 0.3, 0.3), 0x6e6c68, [0, 1.12, W / 2 - 0.12]);
  b.add(new BoxGeometry(W - 0.5, 1.0, W - 0.5), 0x24201c, [0, 0.4, 0]);
  b.add(new BoxGeometry(1.0, 0.14, 1.0), 0x7c7a74, [0, CHIMNEY_TOP - 0.25, 0]);
  b.add(new CylinderGeometry(0.16, 0.2, 0.4, 8), 0xa0603a, [0, CHIMNEY_TOP, 0]);
  return b.build();
}

/** A roof of slates on a timber frame, 4 m square: like the thatch, but stone, and keeps out every storm. */
export function slateRoofModel() {
  const b = new Parts(137), rand = mulberry32(137), h = ROOF_SIZE / 2;
  for (const [x, z] of [[-h + 0.15, -h + 0.15], [h - 0.15, -h + 0.15], [-h + 0.15, h - 0.15], [h - 0.15, h - 0.15]]) b.log([x, -0.2, z], [x, 2.9, z], 0.11, 0x5e4630, 0xc8a070, 6);
  b.log([-h - 0.2, 3.9, 0], [h + 0.2, 3.9, 0], 0.11, 0x5a4230, 0xc8a070, 6);
  const SLATE = [0x4e5560, 0x5a6270, 0x464c56, 0x626a74];
  for (const side of [-1, 1]) {
    b.log([-h - 0.2, 2.9, side * h], [h + 0.2, 2.9, side * h], 0.1, 0x5a4230, 0xc8a070, 6);
    for (let k = 0; k < 6; k++) {
      const t = (k + 0.5) / 6, y = 3.92 - t * 1.15, z = side * t * (h + 0.4);
      for (let x = -h - 0.25 + (k % 2) * 0.2; x < h + 0.25; x += 0.42) {
        b.add(new BoxGeometry(0.44, 0.05, (h + 0.4) / 4.6), SLATE[Math.floor(rand() * SLATE.length)], [x + 0.2, y + 0.03, z], [side * 0.52 + (rand() - 0.5) * 0.04, (rand() - 0.5) * 0.04, 0], [1, 1, 1], 0.05);
      }
    }
  }
  b.add(new BoxGeometry(ROOF_SIZE + 0.5, 0.14, 0.3), 0x3e444c, [0, 3.97, 0]);
  // The gable ends, in stone.
  for (const x of [-h + 0.05, h - 0.05]) b.add(new ConeGeometry(h + 0.2, 1.0, 3), 0x84806e, [x, 3.35, 0], [0, 0, Math.PI / 2], [0.2, 1, 1.9]);
  return b.build();
}

/**
 * A floor, 4 m square, to stand on and build on: of planks on joists and
 * posts, or of flagstones on a stone footing. Laid level, it stands up off
 * the slope on its footing (drawn down into the ground).
 */
export const FLOOR_SIZE = 4;
export const FLOOR_TOP = 0.2;
export function woodFloorModel(upper = false) {
  const b = new Parts(139), rand = mulberry32(139), h = FLOOR_SIZE / 2;
  const n = 10, w = FLOOR_SIZE / n;
  for (let k = 0; k < n; k++) {
    const shade = [0x9a7448, 0x8a663e, 0xa47e50, 0x84603a][Math.floor(rand() * 4)];
    b.add(new BoxGeometry(FLOOR_SIZE - 0.02, 0.06, w - 0.03), shade, [0, FLOOR_TOP - 0.03, -h + w * (k + 0.5)], [0, 0, 0], [1, 1, 1], 0.05);
  }
  for (const x of [-h + 0.12, 0, h - 0.12]) b.add(new BoxGeometry(0.16, 0.16, FLOOR_SIZE), 0x5e4630, [x, FLOOR_TOP - 0.14, 0]);
  if (upper) return b.build(); // (up on the walls: just the boards and joists)
  for (const x of [-h + 0.12, 0, h - 0.12]) for (const z of [-h + 0.12, 0, h - 0.12]) b.add(new CylinderGeometry(0.13, 0.14, 1.8, 6), 0x5a4230, [x, FLOOR_TOP - 1.1, z]);
  // (Boarded in round the sides, down to the ground.)
  for (const [x, z, sx, sz] of [[0, h - 0.03, FLOOR_SIZE, 0.05], [0, -h + 0.03, FLOOR_SIZE, 0.05], [h - 0.03, 0, 0.05, FLOOR_SIZE], [-h + 0.03, 0, 0.05, FLOOR_SIZE]]) {
    for (let k = 0; k < 6; k++) b.add(new BoxGeometry(sx, 0.27, sz), [0x7a5a36, 0x6e5030][k % 2], [x, FLOOR_TOP - 0.2 - k * 0.28, z], [0, 0, 0], [1, 1, 1], 0.05);
  }
  return b.build();
}
export function stoneFloorModel(upper = false) {
  const b = new Parts(141), rand = mulberry32(141), h = FLOOR_SIZE / 2;
  // Flagstones, in rows of uneven lengths.
  for (let z = -h, row = 0; z < h - 0.01; row++) {
    const d = Math.min(0.6 + rand() * 0.35, h - z);
    for (let x = -h; x < h - 0.01;) {
      const w = Math.min(0.55 + rand() * 0.6, h - x);
      const colour = rand() < 0.08 ? MOSS_GREENS[Math.floor(rand() * 3)] : STONE_GREYS[Math.floor(rand() * STONE_GREYS.length)];
      b.add(new BoxGeometry(w - 0.04, 0.08, d - 0.04), colour, [x + w / 2, FLOOR_TOP - 0.04 + rand() * 0.012, z + d / 2], [0, 0, 0], [1, 1, 1], 0.06);
      x += w;
    }
    z += d;
  }
  // The bed of mortar under them, and the footing round the edge, down into the ground.
  b.add(new BoxGeometry(FLOOR_SIZE, upper ? 0.3 : 0.1, FLOOR_SIZE), 0x5a5852, [0, FLOOR_TOP - (upper ? 0.2 : 0.1), 0]);
  if (upper) return b.build(); // (up on the walls: a slab, no footing)
  for (const [x, z, sx, sz] of [[0, h - 0.15, FLOOR_SIZE, 0.3], [0, -h + 0.15, FLOOR_SIZE, 0.3], [h - 0.15, 0, 0.3, FLOOR_SIZE], [-h + 0.15, 0, 0.3, FLOOR_SIZE]]) {
    b.add(new BoxGeometry(sx, 1.8, sz), 0x6e6c68, [x, FLOOR_TOP - 1.05, z], [0, 0, 0], [1, 1, 1], 0.05);
  }
  return b.build();
}

// --- Keeping food ---------------------------------------------------------------

/** A root cellar: a mound of turf over a stone-faced way down, a plank door in it. Cool and dark: food keeps. */
export function cellarModel() {
  const b = new Parts(143), rand = mulberry32(143);
  // The mound, turfed over.
  b.add(new IcosahedronGeometry(1.6, 1), 0x5c7a3a, [0, -0.25, -0.35], [0, 0.3, 0], [1.05, 0.75, 1.0], 0.12);
  b.add(new IcosahedronGeometry(1.2, 1), 0x6a8a44, [0.2, 0.15, -0.6], [0.2, 0.6, 0], [1, 0.6, 1], 0.12);
  // The stone face round the door.
  for (let y = -0.1, row = 0; y < 1.5; y += 0.3, row++) {
    for (let x = -1.0 + (row % 2) * 0.18; x < 1.0; x += 0.36 + rand() * 0.1) {
      if (Math.abs(x) < 0.42 && y < 1.2) continue; // (the doorway)
      b.add(new BoxGeometry(0.34, 0.27, 0.3), STONE_GREYS[Math.floor(rand() * STONE_GREYS.length)], [x, y + 0.14, 0.95], [0, (rand() - 0.5) * 0.08, 0], [1, 1, 1], 0.08);
    }
  }
  b.add(new BoxGeometry(1.1, 0.22, 0.36), 0x6e6c68, [0, 1.28, 0.95]);
  // The door: planks, two bands, a ring.
  for (let k = 0; k < 4; k++) b.add(new BoxGeometry(0.19, 1.15, 0.06), [0x7a5a36, 0x6e5030][k % 2], [-0.29 + k * 0.195, 0.58, 1.02]);
  for (const y of [0.3, 0.9]) b.add(new BoxGeometry(0.8, 0.07, 0.03), 0x3a3634, [0, y, 1.06]);
  b.add(new TorusGeometry(0.06, 0.012, 4, 8), 0x3a3634, [0.22, 0.6, 1.08]);
  return b.build();
}

/** A fish trap: a cone of woven withies, its mouth upstream, lashed to a stake in the water. */
export function fishTrapModel() {
  const b = new Parts(145);
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    b.log([Math.cos(a) * 0.28, Math.sin(a) * 0.28 + 0.3, 0.45], [Math.cos(a) * 0.04, Math.sin(a) * 0.04 + 0.3, -0.5], 0.012, 0x9a7a4a, 0xc8a070, 3);
  }
  for (const [z, r] of [[0.42, 0.27], [0.1, 0.19], [-0.25, 0.1]]) {
    for (let k = 0; k < 10; k++) {
      const a0 = (k / 10) * Math.PI * 2, a1 = ((k + 1) / 10) * Math.PI * 2;
      b.log([Math.cos(a0) * r, Math.sin(a0) * r + 0.3, z], [Math.cos(a1) * r, Math.sin(a1) * r + 0.3, z], 0.01, 0x7a5a36, 0x7a5a36, 3);
    }
  }
  b.log([0.35, -0.4, 0], [0.35, 1.1, 0], 0.035, 0x6e5234, 0xc8a070, 5);
  b.log([0.35, 0.55, 0], [0.05, 0.4, 0.05], 0.01, 0x4f8a34, 0x4f8a34, 3);
  return b.build();
}

/** A smoking rack: a tall frame of poles to stand over a campfire, meat and fish hung high in the smoke. */
export function smokingRackModel() {
  const b = new Parts(147);
  for (const x of [-0.85, 0.85]) {
    b.log([x, 0, -0.6], [x * 0.9, 2.1, 0], 0.04, 0x6e5234, 0xc8a070, 5);
    b.log([x, 0, 0.6], [x * 0.9, 2.1, 0], 0.04, 0x6e5234, 0xc8a070, 5);
  }
  for (const [y, z] of [[1.75, 0.18], [1.75, -0.18], [2.05, 0]]) b.log([-0.95, y, z], [0.95, y, z], 0.03, 0x5a4230, 0xc8a070, 5);
  // (Boughs laid over the top, to hold the smoke in.)
  for (let k = 0; k < 6; k++) b.add(new BoxGeometry(0.3, 0.04, 0.9), [0x4f6a34, 0x5c7a3a][k % 2], [-0.75 + k * 0.3, 2.13, 0], [0, 0, (k % 2 ? 1 : -1) * 0.1], [1, 1, 1], 0.1);
  return b.build();
}

// --- Windows, and roofs that sit on the walls ----------------------------------

/** A stone wall section, 4 m, with a window in it: a stone sill, a lintel over it, a wooden frame. */
export function stoneWindowModel() {
  const b = new Parts(149), rand = mulberry32(149), L = WALL_LENGTH, H = 3.2, D = 0.6;
  for (let y = -0.3, row = 0; y < H - 0.05; y += 0.36, row++) {
    const h = Math.min(0.36, H - y) - 0.03;
    let x = -L / 2 + (row % 2 ? 0.25 : 0);
    if (row % 2) b.add(new BoxGeometry(0.22, h, D), STONE_GREYS[Math.floor(rand() * STONE_GREYS.length)], [-L / 2 + 0.11, y + h / 2, 0], [0, 0, 0], [1, 1, 1], 0.08);
    while (x < L / 2 - 0.05) {
      const w = Math.min(0.45 + rand() * 0.45, L / 2 - x);
      const mid = x + w / 2;
      // (The opening: 1.2 m across, from 1 m up to 2.2 m.)
      if (!(Math.abs(mid) < 0.7 && y + h / 2 > 1.0 && y + h / 2 < 2.2)) {
        b.add(new BoxGeometry(w - 0.03, h * 0.96, D), STONE_GREYS[Math.floor(rand() * STONE_GREYS.length)], [mid, y + h / 2, (rand() - 0.5) * 0.04], [0, 0, 0], [1, 1, 1], 0.08);
      }
      x += w;
    }
  }
  b.add(new BoxGeometry(1.6, 0.14, D + 0.12), 0x9a968c, [0, 0.98, 0.04]); // the sill
  b.add(new BoxGeometry(1.7, 0.3, D + 0.02), 0x84806e, [0, 2.32, 0]); // the lintel
  for (const x of [-0.6, 0.6]) b.add(new BoxGeometry(0.08, 1.2, 0.1), 0x5e4630, [x, 1.6, 0]);
  b.add(new BoxGeometry(1.2, 0.07, 0.08), 0x5e4630, [0, 1.6, 0]);
  b.add(new BoxGeometry(0.06, 1.2, 0.08), 0x5e4630, [0, 1.6, 0]);
  // (The mortar core, with the opening left.)
  for (const [x, w] of [[-1.35, 1.3], [1.35, 1.3]]) b.add(new BoxGeometry(w, H + 0.28, D * 0.5), 0x5a5852, [x, (H - 0.3) / 2, 0]);
  b.add(new BoxGeometry(1.4, 1.3, D * 0.5), 0x5a5852, [0, 0.35, 0]);
  b.add(new BoxGeometry(1.4, 0.9, D * 0.5), 0x5a5852, [0, 2.75, 0]);
  return b.build();
}

/** A palisade section, 4 m, with a window: the middle logs cut short below and above a framed opening. */
export function woodWindowModel() {
  const b = new Parts(151), rand = mulberry32(77);
  const n = 10, gap = WALL_LENGTH / n;
  for (let k = 0; k < n; k++) {
    const x = -WALL_LENGTH / 2 + gap * (k + 0.5);
    const h = 3.0 + rand() * 0.7, r = 0.17 + rand() * 0.04;
    const shade = 0x7a6448 + Math.floor(rand() * 3) * 0x040302;
    if (Math.abs(x) < 0.75) {
      // (Under the window and over it.)
      b.add(new CylinderGeometry(r, r * 1.05, 1.3, 7), shade, [x, 0.35, 0]);
      b.add(new CylinderGeometry(r, r, h - 2.3, 7), shade, [x, 2.3 + (h - 2.3) / 2 - 0.3, 0]);
    } else b.add(new CylinderGeometry(r, r * 1.05, h, 7), shade, [x, h / 2 - 0.3, 0]);
    b.add(new ConeGeometry(r, 0.55, 7), 0xb0946a, [x, h - 0.3 + 0.27, 0]);
  }
  for (const y of [0.9, 2.2]) b.log([-WALL_LENGTH / 2 + 0.05, y, -0.27], [WALL_LENGTH / 2 - 0.05, y, -0.27], 0.1, 0x6a5238, 0xb89468, 6);
  // The frame: a sill, a head, the jambs, and a cross in it.
  b.add(new BoxGeometry(1.7, 0.12, 0.5), 0x8a6a44, [0, 1.0, 0]);
  b.add(new BoxGeometry(1.7, 0.12, 0.45), 0x8a6a44, [0, 2.0, 0]);
  for (const x of [-0.8, 0.8]) b.add(new BoxGeometry(0.12, 1.1, 0.42), 0x7a5a36, [x, 1.5, 0]);
  b.add(new BoxGeometry(0.06, 1.0, 0.08), 0x5a3c24, [0, 1.5, 0]);
  b.add(new BoxGeometry(1.5, 0.06, 0.08), 0x5a3c24, [0, 1.5, 0]);
  return b.build();
}

// A wedge of a gable: a right-angled triangle `run` long and `rise` high, `thick` deep, in the y-z plane.
function gableWedge(run, rise, thick) {
  const g = new BufferGeometry();
  const t = thick / 2, z0 = -run / 2, z1 = run / 2;
  const p = [
    [-t, 0, z0], [-t, 0, z1], [-t, rise, z1], [t, 0, z0], [t, rise, z1], [t, 0, z1],
    [-t, 0, z0], [t, 0, z0], [t, 0, z1], [-t, 0, z0], [t, 0, z1], [-t, 0, z1],
    [-t, 0, z1], [t, 0, z1], [t, rise, z1], [-t, 0, z1], [t, rise, z1], [-t, rise, z1],
    [-t, 0, z0], [-t, rise, z1], [t, rise, z1], [-t, 0, z0], [t, rise, z1], [t, 0, z0],
  ].flat();
  g.setAttribute('position', new BufferAttribute(new Float32Array(p), 3));
  return g;
}

/**
 * A roof piece, 4 m square: a slope of thatch (or slates) on rafters,
 * low along one side, rising 1.6 m to the other, its gable ends closed:
 * set on top of the walls, the pieces side by side make a roof.
 */
export const ROOF_RISE = 1.6;
function roofPiece(seed, { slate, style = slate ? 'slate' : 'thatch', dye = 'natural' }) {
  const b = new Parts(seed), rand = mulberry32(seed), h = ROOF_SIZE / 2, over = 0.3;
  const len = Math.hypot(ROOF_SIZE + over * 2, ROOF_RISE), ang = Math.atan2(ROOF_RISE, ROOF_SIZE);
  // The rafters, low edge to high, and the beams along them.
  for (const x of [-h + 0.15, -h / 3, h / 3, h - 0.15]) b.log([x, -0.05 - over * Math.tan(ang), -h - over], [x, ROOF_RISE - 0.05 + over * Math.tan(ang), h + over], 0.08, 0x5e4630, 0xc8a070, 6);
  for (const [z, y] of [[-h, 0], [h, ROOF_RISE]]) b.log([-h - over, y, z], [h + over, y, z], 0.1, 0x5a4230, 0xc8a070, 6);
  // The covering, in courses up the slope.
  const n = { slate: 8, thatch: 5, shingle: 10, tile: 9, log: 1, barn: 1 }[style];
  if (style === 'barn') {
    // (Long painted boards running down the slope, a batten over each joint.)
    const paint = (BARN_DYES[dye] ?? BARN_DYES.natural)[0];
    const roofPaint = dye === 'white' || dye === 'yellow' ? 0x5a3a2a : dye === 'natural' ? 0x7a5a3a : paint;
    for (let x = -h - over + 0.15; x < h + over; x += 0.3) {
      b.add(new BoxGeometry(0.29, 0.05, len + 0.05), tint2.set(roofPaint).multiplyScalar(0.88 + rand() * 0.2).getHex(), [x, 0.12 + ROOF_RISE / 2, 0], [-ang, 0, 0], [1, 1, 1], 0.03);
      b.add(new BoxGeometry(0.05, 0.05, len + 0.05), tint2.set(roofPaint).multiplyScalar(0.7).getHex(), [x + 0.15, 0.16 + ROOF_RISE / 2, 0], [-ang, 0, 0], [1, 1, 1], 0.03);
    }
  }
  if (style === 'log') {
    // (Split logs laid side by side down the slope, bark up.)
    for (let x = -h - over + 0.16; x < h + over; x += 0.3) {
      const r = 0.14 + rand() * 0.02, lift = 0.16;
      b.log([x, lift - over * Math.tan(ang), -h - over], [x, ROOF_RISE + lift + over * Math.tan(ang), h + over], r, [0x6e4c32, 0x664630, 0x74503a][Math.floor(rand() * 3)], 0xc8a070, 6);
    }
  }
  for (let k = 0; k < n && style !== 'log' && style !== 'barn'; k++) {
    const t = (k + 0.5) / n, z = -h - over + t * (ROOF_SIZE + over * 2), y = 0.12 + (z + h) * Math.tan(ang);
    if (style === 'slate') {
      const SL = [0x4e5560, 0x5a6270, 0x464c56, 0x626a74];
      for (let x = -h - over + (k % 2) * 0.2; x < h + over; x += 0.42) b.add(new BoxGeometry(0.44, 0.05, len / n + 0.08), SL[Math.floor(rand() * SL.length)], [x + 0.2, y, z], [-ang + (rand() - 0.5) * 0.03, 0, 0], [1, 1, 1], 0.05);
    } else if (style === 'shingle') {
      // (Neat cedar shingles in even courses, each overlapping the one below.)
      const SH = [0x9a7448, 0x8a663e, 0xa47e50, 0x84603a];
      for (let x = -h - over + (k % 2) * 0.15; x < h + over; x += 0.3) b.add(new BoxGeometry(0.29, 0.04, len / n + 0.1), SH[Math.floor(rand() * SH.length)], [x + 0.15, y, z], [-ang - 0.03, 0, 0], [1, 1, 1], 0.03);
    } else if (style === 'tile') {
      // (Cut stone tiles, square and true, in a pale even grey.)
      const TI = [0xa8a49a, 0xb2aea4, 0x9e9a90];
      for (let x = -h - over + (k % 2) * 0.25; x < h + over; x += 0.5) b.add(new BoxGeometry(0.49, 0.07, len / n + 0.06), TI[Math.floor(rand() * TI.length)], [x + 0.25, y, z], [-ang, 0, 0], [1, 1, 1], 0.02);
    } else b.add(new BoxGeometry(ROOF_SIZE + over * 2, 0.16, len / n + 0.12), k % 2 ? 0xc8a860 : 0xb89850, [0, y, z], [-ang, 0, 0], [1, 1, 1], 0.08);
  }
  // The gable ends, closed: boards, or stone.
  const gable = { slate: 0x84806e, tile: 0xa8a49a, shingle: 0x9a7448, log: 0x6e4c32, thatch: 0x8a6a44 }[style];
  for (const x of [-h + 0.06, h - 0.06]) b.add(gableWedge(ROOF_SIZE, ROOF_RISE, 0.12), gable, [x, 0, 0], [0, 0, 0], [1, 1, 1], style === 'tile' || style === 'shingle' ? 0.02 : 0.05);
  return b.build();
}
export const thatchRoofModel = () => roofPiece(153, { slate: false });
export const slateRoofPieceModel = () => roofPiece(155, { slate: true });
export const logRoofModel = () => roofPiece(157, { style: 'log' });
export const shingleRoofModel = () => roofPiece(159, { style: 'shingle' });

// --- The barn: board-and-batten walls and a board roof, painted with dye ---------

/** The colours a barn can be painted (see dyes, items): its boards, and the trim round its corners and openings. */
export const BARN_DYES = {
  natural: [0x9a7448, 0xe8e2d4], red: [0x9a2a22, 0xece6da], white: [0xe2dccf, 0x8a2a22], black: [0x34302c, 0xe8e2d4],
  green: [0x3e6a3a, 0xece6da], yellow: [0xc8a038, 0x5a3a24],
};

/** A barn wall, 4 m: tall boards stood on end, battens over the joints, painted; trim at its ends (and round a window or a door's opening). */
export function barnWallModel(dye = 'natural', what = 'wall') {
  const [paint, trim] = BARN_DYES[dye] ?? BARN_DYES.natural, L = WALL_LENGTH, H = 3.2, o = what === 'wall' ? null : OPENING[what];
  const b = new Parts(241 + Object.keys(BARN_DYES).indexOf(dye) * 3 + (what === 'window' ? 1 : what === 'door' ? 2 : 0)), rand = mulberry32(241);
  const shade = (k) => tint2.set(paint).multiplyScalar(0.9 + rand() * 0.2).getHex();
  for (const side of [0.08, -0.08]) {
    for (let x = -L / 2 + 0.2, k = 0; x < L / 2 - 0.15; x += 0.3, k++) {
      if (o && Math.abs(x) < o.w / 2 + 0.05) {
        // (Boards cut short round the opening: under a window, and over it.)
        if (o.lo > 0.1) b.add(new BoxGeometry(0.29, o.lo, 0.05), shade(k), [x, o.lo / 2, side], [0, 0, 0], [1, 1, 1], 0.02);
        b.add(new BoxGeometry(0.29, H - o.hi, 0.05), shade(k), [x, (H + o.hi) / 2, side], [0, 0, 0], [1, 1, 1], 0.02);
        continue;
      }
      b.add(new BoxGeometry(0.29, H, 0.05), shade(k), [x, H / 2, side], [0, 0, 0], [1, 1, 1], 0.02);
      b.add(new BoxGeometry(0.06, H, 0.03), tint2.set(paint).multiplyScalar(0.8).getHex(), [x + 0.15, H / 2, side * 1.45], [0, 0, 0], [1, 1, 1], 0.02); // (the batten)
    }
  }
  for (const x of [-L / 2 + 0.08, L / 2 - 0.08]) b.add(new BoxGeometry(0.16, H + 0.2, 0.3), trim, [x, H / 2, 0], [0, 0, 0], [1, 1, 1], 0.02);
  b.add(new BoxGeometry(L + 0.04, 0.18, 0.3), trim, [0, H + 0.05, 0], [0, 0, 0], [1, 1, 1], 0.02);
  b.add(new BoxGeometry(L + 0.04, 0.22, 0.3), 0x6a5a4a, [0, -0.06, 0], [0, 0, 0], [1, 1, 1], 0.02);
  if (o) frameOpening(b, o, 0.28, trim, what === 'window');
  return b.build();
}

/** A barn's door: painted boards with the white cross-braces (it swings on its left edge). */
export function barnDoorModel(dye = 'natural') {
  const [paint, trim] = BARN_DYES[dye] ?? BARN_DYES.natural, w = HOUSE_DOOR_WIDTH - 0.04, h = 2.3, b = new Parts(271 + Object.keys(BARN_DYES).indexOf(dye));
  for (let k = 0; k < 4; k++) b.add(new BoxGeometry(w / 4 - 0.02, h, 0.08), tint2.set(paint).multiplyScalar(0.92 + (k % 2) * 0.1).getHex(), [(w / 4) * (k + 0.5), h / 2 - 0.35, 0], [0, 0, 0], [1, 1, 1], 0.04);
  for (const y of [0.0, 1.0, 1.85]) b.add(new BoxGeometry(w, 0.12, 0.05), trim, [w / 2, y, 0.06]);
  const diag = Math.hypot(w, 0.85), ang = Math.atan2(0.85, w);
  for (const [y, s] of [[0.5, 1], [0.5, -1], [1.42, 1], [1.42, -1]]) b.add(new BoxGeometry(diag, 0.1, 0.05), trim, [w / 2, y, 0.065], [0, 0, s * ang]);
  b.add(new BoxGeometry(0.05, 0.05, 0.1), 0x2a2a2a, [w - 0.12, 0.8, 0.1]);
  return b.build();
}

/** A barn's roof, 4 m: long boards down the slope, painted (or plain), a trim along its eaves. */
export function barnRoofModel(dye = 'natural') {
  return roofPiece(281 + Object.keys(BARN_DYES).indexOf(dye), { style: 'barn', dye });
}
export const tileRoofModel = () => roofPiece(161, { style: 'tile' });

// --- The building sets: log, plank, rough stone, cut stone ------------------------

/** A log wall, 4 m long: whole logs laid one on another, saddle-notched, the ends crossing past; moss chinked between. */
export function logWallModel() {
  const b = new Parts(171), rand = mulberry32(171), L = WALL_LENGTH;
  for (let k = 0, y = 0.1; y < 3.15; k++, y += 0.33) {
    const r = 0.17 + rand() * 0.02, past = k % 2 ? 0.18 : 0.04;
    b.log([-L / 2 - past, y, (rand() - 0.5) * 0.03], [L / 2 + past, y, (rand() - 0.5) * 0.03], r, [0x7a5a3a, 0x6e5034, 0x83603e][Math.floor(rand() * 3)], 0xc8a070, 7);
  }
  // (The chinking: moss and clay pressed between the logs.)
  b.add(new BoxGeometry(L, 3.2, 0.18), 0x6a6448, [0, 1.55, 0], [0, 0, 0], [1, 1, 1], 0.06);
  return b.build();
}

/** A plank wall, 4 m long: a squared frame, boards laid level and lapped, trimmed neat. */
export function plankWallModel() {
  const b = new Parts(173), rand = mulberry32(173), L = WALL_LENGTH, H = 3.2;
  const BOARD = [0x9a7448, 0x8a663e, 0xa47e50, 0x94704a];
  for (let k = 0, y = 0.05; y < H - 0.1; k++, y += 0.25) b.add(new BoxGeometry(L - 0.24, 0.27, 0.06), BOARD[Math.floor(rand() * BOARD.length)], [0, y + 0.13, 0.08], [0.06, 0, 0], [1, 1, 1], 0.03);
  for (let k = 0, y = 0.05; y < H - 0.1; k++, y += 0.25) b.add(new BoxGeometry(L - 0.24, 0.27, 0.06), BOARD[Math.floor(rand() * BOARD.length)], [0, y + 0.13, -0.08], [-0.06, 0, 0], [1, 1, 1], 0.03);
  for (const x of [-L / 2 + 0.1, 0, L / 2 - 0.1]) b.add(new BoxGeometry(0.2, H + 0.3, 0.26), 0x6a4c30, [x, H / 2 - 0.15, 0], [0, 0, 0], [1, 1, 1], 0.02);
  b.add(new BoxGeometry(L + 0.04, 0.2, 0.3), 0x6a4c30, [0, H + 0.05, 0], [0, 0, 0], [1, 1, 1], 0.02);
  b.add(new BoxGeometry(L + 0.04, 0.24, 0.3), 0x5e4430, [0, -0.08, 0], [0, 0, 0], [1, 1, 1], 0.02);
  return b.build();
}

/** A wall of cut stone, 4 m long: dressed blocks, square and true, in even courses under a coping. */
export function cutStoneWallModel() {
  const b = new Parts(175), rand = mulberry32(175), L = WALL_LENGTH, H = 3.2, CUT = [0xb2aea4, 0xaaa69c, 0xbab6ac, 0xa4a096];
  for (let y = -0.3, row = 0; y < H - 0.3; y += 0.4, row++) {
    for (let x = -L / 2 + (row % 2 ? -0.4 : 0); x < L / 2 - 0.01; x += 0.8) {
      const x0 = Math.max(-L / 2, x), x1 = Math.min(L / 2, x + 0.8);
      if (x1 - x0 < 0.05) continue;
      b.add(new BoxGeometry(x1 - x0 - 0.02, 0.38, 0.58), CUT[Math.floor(rand() * CUT.length)], [(x0 + x1) / 2, y + 0.2, 0], [0, 0, 0], [1, 1, 1], 0.02);
    }
  }
  b.add(new BoxGeometry(L + 0.06, 0.16, 0.7), 0x9a968c, [0, H + 0.02, 0], [0, 0, 0], [1, 1, 1], 0.01);
  b.add(new BoxGeometry(L - 0.02, H + 0.28, 0.5), 0x7a766e, [0, (H - 0.3) / 2, 0], [0, 0, 0], [1, 1, 1], 0.01);
  return b.build();
}

/** A log floor, 4 m square: logs flattened on top, side by side on sleepers and stumps. */
export function logFloorModel(upper = false) {
  const b = new Parts(177), rand = mulberry32(177), h = FLOOR_SIZE / 2;
  for (let z = -h + 0.17; z < h; z += 0.34) {
    b.log([-h, FLOOR_TOP - 0.15, z], [h, FLOOR_TOP - 0.15, z], 0.16, [0x7a5a3a, 0x6e5034, 0x83603e][Math.floor(rand() * 3)], 0xc8a070, 7);
    b.add(new BoxGeometry(FLOOR_SIZE - 0.02, 0.04, 0.24), 0xa88a5c, [0, FLOOR_TOP - 0.02, z], [0, 0, 0], [1, 1, 1], 0.05); // (adzed flat)
  }
  if (upper) return b.build();
  for (const x of [-h + 0.2, h - 0.2]) b.log([x, FLOOR_TOP - 0.42, -h], [x, FLOOR_TOP - 0.42, h], 0.15, 0x5e4630, 0xc8a070, 6);
  for (const x of [-h + 0.2, h - 0.2]) for (const z of [-h + 0.25, 0, h - 0.25]) b.add(new CylinderGeometry(0.17, 0.19, 1.6, 7), 0x5a4230, [x, FLOOR_TOP - 1.3, z]);
  return b.build();
}

/** A floor of cut stone, 4 m square: square flags, true and even, on a dressed footing. */
export function cutStoneFloorModel(upper = false) {
  const b = new Parts(179), rand = mulberry32(179), h = FLOOR_SIZE / 2, CUT = [0xb2aea4, 0xaaa69c, 0xbab6ac, 0xa4a096];
  for (let x = -h; x < h - 0.01; x += 0.5) for (let z = -h; z < h - 0.01; z += 0.5) b.add(new BoxGeometry(0.48, 0.08, 0.48), CUT[Math.floor(rand() * CUT.length)], [x + 0.25, FLOOR_TOP - 0.04, z + 0.25], [0, 0, 0], [1, 1, 1], 0.02);
  b.add(new BoxGeometry(FLOOR_SIZE, upper ? 0.3 : 0.1, FLOOR_SIZE), 0x8a867e, [0, FLOOR_TOP - (upper ? 0.2 : 0.1), 0]);
  if (upper) return b.build();
  for (const [x, z, sx, sz] of [[0, h - 0.15, FLOOR_SIZE, 0.3], [0, -h + 0.15, FLOOR_SIZE, 0.3], [h - 0.15, 0, 0.3, FLOOR_SIZE], [-h + 0.15, 0, 0.3, FLOOR_SIZE]]) {
    b.add(new BoxGeometry(sx, 1.8, sz), 0x9a968c, [x, FLOOR_TOP - 1.05, z], [0, 0, 0], [1, 1, 1], 0.02);
  }
  return b.build();
}

/**
 * Stairs: a flight 2 m wide and 4 m long, rising the height of a wall
 * (from a floor to the top of the walls round it: up to a floor laid on
 * them, or onto the roof). The foot at -z, the head at +z.
 */
export const STAIRS_LENGTH = 4;
export const STAIRS_WIDTH = 2;
export const STAIRS_RISE = 3.2;
export function stairsModel(style) {
  const b = new Parts(181 + ['log', 'plank', 'stone', 'cut'].indexOf(style) * 2), rand = mulberry32(181), W = STAIRS_WIDTH, L = STAIRS_LENGTH, n = 12;
  const run = L / n, rise = STAIRS_RISE / n, CUT = [0xb2aea4, 0xaaa69c, 0xbab6ac], BOARD = [0x9a7448, 0x8a663e, 0xa47e50];
  for (let k = 0; k < n; k++) {
    const z = -L / 2 + run * (k + 0.5), top = rise * (k + 1);
    if (style === 'log') b.log([-W / 2, top - 0.12, z], [W / 2, top - 0.12, z], 0.13, [0x7a5a3a, 0x6e5034, 0x83603e][k % 3], 0xc8a070, 6);
    else if (style === 'plank') b.add(new BoxGeometry(W, 0.06, run + 0.04), BOARD[k % 3], [0, top - 0.03, z], [0, 0, 0], [1, 1, 1], 0.03);
    else if (style === 'stone') b.add(new BoxGeometry(W * (0.96 + rand() * 0.06), top + 0.3, run + 0.02), STONE_GREYS[Math.floor(rand() * STONE_GREYS.length)], [(rand() - 0.5) * 0.05, (top - 0.3) / 2, z], [0, (rand() - 0.5) * 0.03, 0], [1, 1, 1], 0.08);
    else b.add(new BoxGeometry(W, top + 0.3, run + 0.01), CUT[k % 3], [0, (top - 0.3) / 2, z], [0, 0, 0], [1, 1, 1], 0.02);
  }
  const ang = Math.atan2(STAIRS_RISE, L), slope = Math.hypot(STAIRS_RISE, L);
  if (style === 'log' || style === 'plank') {
    // The stringers under the steps, a post at the head, and a rail up one side.
    for (const x of [-W / 2 + 0.1, W / 2 - 0.1]) {
      if (style === 'log') b.log([x, -0.1, -L / 2], [x, STAIRS_RISE - 0.25, L / 2], 0.13, 0x5e4630, 0xc8a070, 6);
      else b.add(new BoxGeometry(0.1, 0.3, slope), 0x6a4c30, [x, STAIRS_RISE / 2 - 0.2, 0], [-ang, 0, 0], [1, 1, 1], 0.02);
      b.add(new CylinderGeometry(0.1, 0.11, STAIRS_RISE, 6), 0x5a4230, [x, STAIRS_RISE / 2 - 0.25, L / 2 - 0.15]);
    }
    if (style === 'plank') {
      b.add(new BoxGeometry(0.07, 0.07, slope), 0x6a4c30, [W / 2 - 0.05, STAIRS_RISE / 2 + 0.95, 0], [-ang, 0, 0], [1, 1, 1], 0.02);
      for (let k = 0; k < 4; k++) b.add(new BoxGeometry(0.06, 1.0, 0.06), 0x6a4c30, [W / 2 - 0.05, (STAIRS_RISE * (k + 0.5)) / 4 + 0.45, -L / 2 + (L * (k + 0.5)) / 4]);
    }
  }
  return b.build();
}
export const logStairsModel = () => stairsModel('log');
export const plankStairsModel = () => stairsModel('plank');
export const stoneStairsModel = () => stairsModel('stone');
export const cutStairsModel = () => stairsModel('cut');

/** A bedroll on the ground: a hide laid out, furs rolled on it, a rolled pillow. */
export function bedrollModel() {
  return new Parts(191)
    .add(new BoxGeometry(1.0, 0.05, 2.0), 0x8a5a3a, [0, 0.03, 0], [0, 0, 0], [1, 1, 1], 0.06)
    .add(new BoxGeometry(0.86, 0.1, 1.5), 0x9a7a58, [0, 0.1, 0.18], [0, 0, 0], [1, 1, 1], 0.08)
    .add(new BoxGeometry(0.88, 0.06, 0.7), 0xc4a47a, [0, 0.17, 0.45], [0.05, 0, 0], [1, 1, 1], 0.06)
    .add(new CylinderGeometry(0.13, 0.13, 0.7, 7), 0xece6d8, [0, 0.14, -0.78], [0, 0, Math.PI / 2])
    .build();
}

/** A straw bed: a heap of cut grass, dried gold, raked into a long mound, a little more at the head. */
export function strawBedModel() {
  const b = new Parts(197), straw = [0xd4b45a, 0xc8a64c, 0xe0c46a, 0xb89a44];
  b.add(new BoxGeometry(1.05, 0.12, 2.0), 0xc4a24a, [0, 0.06, 0], [0, 0, 0], [1, 1, 1], 0.08);
  for (let k = 0; k < 9; k++) {
    const z = -0.85 + (k / 8) * 1.7, x = (k % 3 - 1) * 0.28;
    b.add(new DodecahedronGeometry(0.32, 0), straw[k % 4], [x, 0.14, z], [k, k * 1.7, 0], [1.1, 0.35, 1.2], 0.1);
  }
  b.add(new DodecahedronGeometry(0.34, 0), 0xe0c46a, [0, 0.2, -0.78], [1, 2, 0], [1.4, 0.45, 0.8], 0.08); // (heaped at the head)
  // (Loose stalks lying across the top.)
  for (let k = 0; k < 8; k++) b.add(new BoxGeometry(0.02, 0.02, 0.6), 0xe8cc78, [(k % 4 - 1.5) * 0.22, 0.24, -0.6 + Math.floor(k / 4) * 0.9], [0, k * 0.7, 0]);
  return b.build();
}

/** A great bed: a carved frame on four posts, a canopy of spider silk over it, soft white bedding. */
export function fancyBedModel() {
  const b = new Parts(193), W = 1.5, L = 2.2, wood = 0x6a3e26, trim = 0x8a5634;
  b.add(new BoxGeometry(W, 0.3, L), wood, [0, 0.35, 0], [0, 0, 0], [1, 1, 1], 0.03);
  b.add(new BoxGeometry(W - 0.1, 0.22, L - 0.1), 0xf4f0ea, [0, 0.6, 0], [0, 0, 0], [1, 1, 1], 0.02);
  b.add(new BoxGeometry(W - 0.08, 0.1, L * 0.6), 0x8a2a2e, [0, 0.74, 0.35], [0, 0, 0], [1, 1, 1], 0.03);
  for (const x of [-0.38, 0.38]) b.add(new BoxGeometry(0.55, 0.14, 0.32), 0xffffff, [x, 0.78, -L / 2 + 0.3], [0, 0, 0], [1, 1, 1], 0.02);
  b.add(new BoxGeometry(W, 1.2, 0.12), trim, [0, 0.9, -L / 2 - 0.02], [0, 0, 0], [1, 1, 1], 0.03);
  for (const x of [-W / 2, W / 2]) for (const z of [-L / 2, L / 2]) {
    b.add(new CylinderGeometry(0.07, 0.08, 2.3, 8), wood, [x, 1.15, z]);
    b.add(new OctahedronGeometry(0.1, 0), trim, [x, 2.35, z]);
  }
  // The canopy and its drapes: pale, faintly shining silk.
  b.add(new BoxGeometry(W + 0.1, 0.05, L + 0.1), 0xe8eef2, [0, 2.25, 0], [0, 0, 0], [1, 1, 1], 0.03);
  for (const x of [-W / 2 - 0.02, W / 2 + 0.02]) for (const z of [-L / 2 + 0.25, L / 2 - 0.25]) b.add(new BoxGeometry(0.04, 1.5, 0.45), 0xdfe8ee, [x, 1.5, z], [0, 0, 0], [1, 1, 1], 0.03);
  return b.build();
}

// --- Windows and doors for every set ----------------------------------------------

// The openings: a window 1.4 m across, 1 m to 2.2 m up; a door 1.2 m across, 2.3 m high.
export const HOUSE_DOOR_WIDTH = 1.2;
const OPENING = { window: { w: 1.4, lo: 1.0, hi: 2.2 }, door: { w: HOUSE_DOOR_WIDTH, lo: -0.4, hi: 2.3 } };

// The mortar or chinking behind a wall, round its opening.
function coreAround(b, o, L, H, D, colour, y0 = -0.3) {
  const side = (L - o.w) / 2;
  for (const x of [-(o.w + side) / 2, (o.w + side) / 2]) b.add(new BoxGeometry(side, H - y0, D), colour, [x, (H + y0) / 2, 0], [0, 0, 0], [1, 1, 1], 0.02);
  if (o.lo > y0) b.add(new BoxGeometry(o.w, o.lo - y0, D), colour, [0, (o.lo + y0) / 2, 0], [0, 0, 0], [1, 1, 1], 0.02);
  b.add(new BoxGeometry(o.w, H - o.hi, D), colour, [0, (H + o.hi) / 2, 0], [0, 0, 0], [1, 1, 1], 0.02);
}

// A frame round the opening: sill (a window), head, jambs; for a window, the bars of its casement.
function frameOpening(b, o, D, wood, window) {
  if (window) b.add(new BoxGeometry(o.w + 0.2, 0.12, D + 0.1), wood, [0, o.lo - 0.02, 0.03], [0, 0, 0], [1, 1, 1], 0.03);
  b.add(new BoxGeometry(o.w + 0.2, 0.18, D + 0.04), wood, [0, o.hi + 0.07, 0], [0, 0, 0], [1, 1, 1], 0.03);
  for (const x of [-o.w / 2 - 0.05, o.w / 2 + 0.05]) b.add(new BoxGeometry(0.12, o.hi - Math.max(o.lo, -0.05), D + 0.04), wood, [x, (o.hi + Math.max(o.lo, -0.05)) / 2, 0], [0, 0, 0], [1, 1, 1], 0.03);
  if (window) {
    b.add(new BoxGeometry(0.05, o.hi - o.lo, 0.06), 0x3e2c1c, [0, (o.hi + o.lo) / 2, 0]);
    b.add(new BoxGeometry(o.w, 0.05, 0.06), 0x3e2c1c, [0, (o.hi + o.lo) / 2, 0]);
  }
}

/** A wall section with a window or a doorway, for a set: 'log', 'plank', 'stone' or 'cut'. */
export function openWallModel(style, what) {
  const o = OPENING[what], window = what === 'window', L = WALL_LENGTH, H = 3.2;
  const b = new Parts(201 + ['log', 'plank', 'stone', 'cut'].indexOf(style) * 4 + (window ? 0 : 2)), rand = mulberry32(201);
  const inside = (x, y, pad = 0) => Math.abs(x) < o.w / 2 + pad && y > o.lo - pad && y < o.hi + pad;
  if (style === 'log') {
    for (let k = 0, y = 0.1; y < 3.15; k++, y += 0.33) {
      const r = 0.17 + rand() * 0.02, past = k % 2 ? 0.18 : 0.04, bark = [0x7a5a3a, 0x6e5034, 0x83603e][Math.floor(rand() * 3)];
      if (y > o.lo - r && y < o.hi + r * 0.5) {
        b.log([-L / 2 - past, y, 0], [-o.w / 2 - 0.08, y, 0], r, bark, 0xc8a070, 7);
        b.log([o.w / 2 + 0.08, y, 0], [L / 2 + past, y, 0], r, bark, 0xc8a070, 7);
      } else b.log([-L / 2 - past, y, 0], [L / 2 + past, y, 0], r, bark, 0xc8a070, 7);
    }
    coreAround(b, o, L, H, 0.18, 0x6a6448, 0);
    frameOpening(b, o, 0.4, 0x8a6a44, window);
  } else if (style === 'plank') {
    const BOARD = [0x9a7448, 0x8a663e, 0xa47e50, 0x94704a];
    for (const side of [0.08, -0.08]) for (let y = 0.05; y < H - 0.1; y += 0.25) {
      const yc = y + 0.13;
      if (yc > o.lo && yc < o.hi) {
        const w = (L - 0.24 - o.w) / 2;
        for (const x of [-(o.w + w) / 2 - 0.06, (o.w + w) / 2 + 0.06]) b.add(new BoxGeometry(w, 0.27, 0.06), BOARD[Math.floor(rand() * 4)], [x, yc, side], [Math.sign(side) * 0.06, 0, 0], [1, 1, 1], 0.03);
      } else b.add(new BoxGeometry(L - 0.24, 0.27, 0.06), BOARD[Math.floor(rand() * 4)], [0, yc, side], [Math.sign(side) * 0.06, 0, 0], [1, 1, 1], 0.03);
    }
    for (const x of [-L / 2 + 0.1, L / 2 - 0.1]) b.add(new BoxGeometry(0.2, H + 0.3, 0.26), 0x6a4c30, [x, H / 2 - 0.15, 0], [0, 0, 0], [1, 1, 1], 0.02);
    b.add(new BoxGeometry(L + 0.04, 0.2, 0.3), 0x6a4c30, [0, H + 0.05, 0], [0, 0, 0], [1, 1, 1], 0.02);
    if (window) b.add(new BoxGeometry(L + 0.04, 0.24, 0.3), 0x5e4430, [0, -0.08, 0], [0, 0, 0], [1, 1, 1], 0.02);
    else for (const x of [-(L + o.w) / 4, (L + o.w) / 4]) b.add(new BoxGeometry((L - o.w) / 2, 0.24, 0.3), 0x5e4430, [x, -0.08, 0], [0, 0, 0], [1, 1, 1], 0.02);
    frameOpening(b, o, 0.3, 0x6a4c30, window);
  } else if (style === 'stone') {
    stoneCourses(b, rand, { length: L, height: H, depth: 0.6, mossTop: 0.35, skip: (x, y) => inside(x, y, 0.05) });
    coreAround(b, o, L, H, 0.3, 0x5a5852);
    b.add(new BoxGeometry(o.w + 0.5, 0.3, 0.62), 0x84806e, [0, o.hi + 0.12, 0]); // (the lintel)
    if (window) b.add(new BoxGeometry(o.w + 0.4, 0.14, 0.72), 0x9a968c, [0, o.lo - 0.05, 0.04]);
    frameOpening(b, o, 0.16, 0x5e4630, window);
  } else {
    const CUT = [0xb2aea4, 0xaaa69c, 0xbab6ac, 0xa4a096];
    for (let y = -0.3, row = 0; y < H - 0.3; y += 0.4, row++) {
      for (let x = -L / 2 + (row % 2 ? -0.4 : 0); x < L / 2 - 0.01; x += 0.8) {
        let x0 = Math.max(-L / 2, x), x1 = Math.min(L / 2, x + 0.8);
        const yc = y + 0.2;
        if (yc > o.lo - 0.1 && yc < o.hi + 0.1) {
          // (Blocks cut to the opening's edge.)
          if (x1 > -o.w / 2 && x0 < o.w / 2) {
            if (x0 < -o.w / 2) x1 = -o.w / 2;
            else if (x1 > o.w / 2) x0 = o.w / 2;
            else continue;
          }
        }
        if (x1 - x0 < 0.05) continue;
        b.add(new BoxGeometry(x1 - x0 - 0.02, 0.38, 0.58), CUT[Math.floor(rand() * CUT.length)], [(x0 + x1) / 2, y + 0.2, 0], [0, 0, 0], [1, 1, 1], 0.02);
      }
    }
    b.add(new BoxGeometry(L + 0.06, 0.16, 0.7), 0x9a968c, [0, H + 0.02, 0], [0, 0, 0], [1, 1, 1], 0.01);
    coreAround(b, o, L, H, 0.4, 0x7a766e);
    b.add(new BoxGeometry(o.w + 0.4, 0.34, 0.66), 0xc4c0b6, [0, o.hi + 0.15, 0], [0, 0, 0], [1, 1, 1], 0.01); // (a carved lintel)
    if (window) b.add(new BoxGeometry(o.w + 0.3, 0.12, 0.74), 0xc4c0b6, [0, o.lo - 0.04, 0.04], [0, 0, 0], [1, 1, 1], 0.01);
    frameOpening(b, o, 0.14, 0x4e3624, window);
  }
  return b.build();
}

/** A house door, hinged at its left edge (x = 0): for a set. */
export function houseDoorModel(style) {
  const b = new Parts(231 + ['log', 'plank', 'stone', 'cut'].indexOf(style)), w = HOUSE_DOOR_WIDTH - 0.04, h = 2.3;
  if (style === 'log') {
    for (let k = 0; k < 4; k++) b.add(new BoxGeometry(w / 4 - 0.02, h, 0.12), [0x8a6a44, 0x7a5a3a][k % 2], [(w / 4) * (k + 0.5), h / 2 - 0.35, 0], [0, 0, 0], [1, 1, 1], 0.06);
    for (const y of [0.1, 1.5]) b.add(new BoxGeometry(w, 0.14, 0.07), 0x5a3c24, [w / 2, y, -0.09]);
    b.add(new BoxGeometry(0.1, 1.6, 0.06), 0x5a3c24, [w / 2, 0.8, -0.1], [0, 0, 0.7]);
  } else {
    const wood = style === 'plank' ? 0x9a7448 : style === 'stone' ? 0x5e4228 : 0x4a3220;
    for (let k = 0; k < 6; k++) b.add(new BoxGeometry(w / 6 - 0.01, h, 0.09), wood, [(w / 6) * (k + 0.5), h / 2 - 0.35, 0], [0, 0, 0], [1, 1, 1], 0.03);
    for (const y of [0.15, 1.6]) b.add(new BoxGeometry(w * 0.7, 0.07, 0.03), 0x2e2e32, [w * 0.35, y, 0.06]); // (iron hinge straps)
    b.add(new BoxGeometry(0.06, 0.18, 0.08), 0x3a3a40, [w - 0.14, 0.75, 0.08]); // (the handle)
    if (style !== 'plank') for (let x = 0.15; x < w; x += 0.3) for (let y = -0.1; y < 1.9; y += 0.5) b.add(new BoxGeometry(0.04, 0.04, 0.03), 0x2e2e32, [x, y, 0.06]); // (iron studs)
  }
  return b.build();
}

/**
 * The altar before the Lost Keep's gate: a carved block of stone with
 * twelve sockets round its top, one for each great beast's trophy (see
 * altarStoneModel: what shows in a socket once it's set).
 */
export const ALTAR_SOCKETS = 12;
export function altarModel() {
  const b = new Parts(241), rand = mulberry32(241);
  b.add(new BoxGeometry(1.9, 0.9, 1.3), 0x6e6c68, [0, 0.45, 0], [0, 0, 0], [1, 1, 1], 0.05);
  b.add(new BoxGeometry(2.1, 0.16, 1.5), 0x8a867e, [0, 0.98, 0], [0, 0, 0], [1, 1, 1], 0.03);
  b.add(new BoxGeometry(2.0, 0.12, 1.4), 0x5a5852, [0, 0.06, 0], [0, 0, 0], [1, 1, 1], 0.03);
  // (Carved bands down its faces.)
  for (const z of [-0.66, 0.66]) for (let x = -0.8; x <= 0.8; x += 0.4) b.add(new BoxGeometry(0.08, 0.6, 0.04), 0x7a7870, [x, 0.5, z]);
  for (let k = 0; k < ALTAR_SOCKETS; k++) {
    const [x, z] = altarSocket(k);
    b.add(new CylinderGeometry(0.1, 0.08, 0.05, 8), 0x2a2826, [x, 1.065, z], [0, 0, 0], [1, 1, 1], 0.02);
  }
  b.add(new CylinderGeometry(0.22, 0.26, 0.08, 10), 0x9a7a48, [0, 1.08, 0], [0, 0, 0], [1, 1, 1], 0.03);
  void rand;
  return b.build();
}
/** Where a socket is on the altar's top. */
export function altarSocket(k) {
  const per = ALTAR_SOCKETS / 2, row = Math.floor(k / per), i = k % per;
  return [-0.8 + (i * 1.6) / (per - 1), row ? 0.5 : -0.5];
}
/** What's set in a socket: a glowing stone (the trophy given, made light). */
export function altarStoneModel() {
  return new Parts(243).add(new OctahedronGeometry(0.09, 0), 0xffffff, [0, 1.16, 0], [0, 0, 0], [1, 1.5, 1], 0.02).build();
}

// --- Beekeeping, the dairy, things to wear ------------------------------------------

/** A bee box: a stack of plank boxes on a low stand, a sloped lid, the bees' slot at the foot. */
export function beeBoxModel() {
  const b = new Parts(181);
  for (const [x, z] of [[-0.24, -0.2], [0.24, -0.2], [-0.24, 0.2], [0.24, 0.2]]) b.add(new BoxGeometry(0.06, 0.3, 0.06), 0x6e4c32, [x, 0.15, z]);
  b.add(new BoxGeometry(0.6, 0.05, 0.5), 0x7a5638, [0, 0.32, 0]);
  for (const [y, c] of [[0.48, 0xc8a670], [0.75, 0xd2b07a], [0.99, 0xbe9c66]]) b.add(new BoxGeometry(0.52, y === 0.99 ? 0.2 : 0.26, 0.44), c, [0, y, 0]);
  b.add(new BoxGeometry(0.62, 0.05, 0.54), 0x8a6a48, [0, 1.12, 0], [0.08, 0, 0]);
  b.add(new BoxGeometry(0.2, 0.03, 0.02), 0x1e1610, [0, 0.38, 0.225]);
  return b.build();
}

/** A wooden milk pail, bound with withies (full: milk to the brim). */
export function pailModel(full = false) {
  const b = new Parts(183);
  b.add(new CylinderGeometry(0.13, 0.11, 0.24, 8), 0xa8845a, [0, 0.12, 0]);
  for (const y of [0.04, 0.2]) b.add(new TorusGeometry(0.125, 0.01, 3, 8), 0x5a4a30, [0, y, 0], [Math.PI / 2, 0, 0]);
  b.add(new TorusGeometry(0.12, 0.008, 3, 8, Math.PI), 0x6e4c32, [0, 0.24, 0]);
  if (full) b.add(new CylinderGeometry(0.115, 0.115, 0.01, 8), 0xf4f0e6, [0, 0.22, 0]);
  return b.build();
}

/** A round of cheese, a wedge cut from it. */
export const cheeseModel = () =>
  new Parts(185)
    .add(new CylinderGeometry(0.11, 0.11, 0.08, 9, 1, false, 0, Math.PI * 1.6), 0xf0d080, [0, 0.04, 0])
    .add(new CylinderGeometry(0.112, 0.112, 0.02, 9, 1, false, 0, Math.PI * 1.6), 0xc89a3a, [0, 0.085, 0])
    .build();

/** A cake of beeswax. */
export const beeswaxModel = () => new Parts(187).add(new BoxGeometry(0.12, 0.05, 0.08), 0xe8c860, [0, 0.025, 0]).build();

/** A pair of boots (leather, or fur-lined). */
export function bootsModel(leather = 0x7a5232, sole = 0x3a2a1e, cuff = null) {
  const b = new Parts(189);
  for (const x of [-0.07, 0.07]) {
    b.add(new BoxGeometry(0.08, 0.18, 0.09), leather, [x, 0.11, -0.02]);
    b.add(new BoxGeometry(0.085, 0.07, 0.17), leather, [x, 0.045, 0.03]);
    b.add(new BoxGeometry(0.09, 0.02, 0.18), sole, [x, 0.01, 0.03]);
    if (cuff) b.add(new BoxGeometry(0.095, 0.04, 0.1), cuff, [x, 0.2, -0.02]);
  }
  return b.build();
}

/** A pair of leather gloves. */
export function glovesModel(leather = 0x9a6a3e) {
  const b = new Parts(191);
  for (const x of [-0.08, 0.08]) {
    b.add(new BoxGeometry(0.1, 0.03, 0.12), leather, [x, 0.015, 0]);
    for (let f = 0; f < 4; f++) b.add(new BoxGeometry(0.018, 0.022, 0.06), leather, [x - 0.033 + f * 0.022, 0.012, 0.085]);
    b.add(new BoxGeometry(0.02, 0.022, 0.05), leather, [x + (x < 0 ? 0.06 : -0.06), 0.012, 0.03], [0, x < 0 ? -0.6 : 0.6, 0]);
    b.add(new BoxGeometry(0.11, 0.035, 0.05), 0x6a4426, [x, 0.017, -0.075]);
  }
  return b.build();
}

/** A hat: a fur cap with ear flaps, or a broad-brimmed straw hat. */
export function hatModel(kind = 'fur') {
  const b = new Parts(193);
  if (kind === 'fur') {
    b.add(new CylinderGeometry(0.11, 0.12, 0.12, 8), 0x8a7458, [0, 0.06, 0]);
    b.add(new CylinderGeometry(0.125, 0.125, 0.05, 8), 0xa89070, [0, 0.03, 0]);
    for (const x of [-0.12, 0.12]) b.add(new BoxGeometry(0.03, 0.1, 0.08), 0xa89070, [x, -0.02, 0]);
  } else {
    b.add(new CylinderGeometry(0.24, 0.24, 0.015, 10), 0xe0c878, [0, 0.01, 0]);
    b.add(new CylinderGeometry(0.09, 0.11, 0.11, 8), 0xd8bc6a, [0, 0.07, 0]);
    b.add(new CylinderGeometry(0.112, 0.112, 0.025, 8), 0x8a4a2a, [0, 0.03, 0]);
  }
  return b.build();
}

/** A beeswax candle in an iron dish. */
export const candleModel = () =>
  new Parts(195)
    .add(new CylinderGeometry(0.05, 0.04, 0.02, 7), 0x3a3a3e, [0, 0.01, 0])
    .add(new CylinderGeometry(0.025, 0.028, 0.14, 6), 0xf0e2b0, [0, 0.09, 0])
    .build();

/** A lantern: an iron frame, horn panes, a ring to hang it by. */
export function lanternModel() {
  const b = new Parts(197);
  b.add(new CylinderGeometry(0.11, 0.12, 0.05, 4), 0x3a3a3e, [0, 0.025, 0], [0, Math.PI / 4, 0]);
  b.add(new CylinderGeometry(0.1, 0.1, 0.22, 4), 0xe8b870, [0, 0.16, 0], [0, Math.PI / 4, 0]);
  b.add(new CylinderGeometry(0.02, 0.12, 0.1, 4), 0x3a3a3e, [0, 0.32, 0], [0, Math.PI / 4, 0]);
  b.add(new TorusGeometry(0.035, 0.008, 3, 6), 0x3a3a3e, [0, 0.4, 0]);
  return b.build();
}

/** A sign: a board on a post (what's written on it: see Structures.showSign). */
export function signModel() {
  const b = new Parts(199);
  b.log([0, 0, -0.04], [0, 1.25, -0.04], 0.05, 0x6e4c32);
  b.add(new BoxGeometry(0.9, 0.5, 0.05), 0x9a7048, [0, 1.25, 0]);
  b.add(new BoxGeometry(0.94, 0.04, 0.07), 0x7a5638, [0, 1.51, 0]);
  return b.build();
}

/**
 * A dugout canoe: one log hollowed out, long and narrow, its ends drawn up
 * to points; two thwarts across it, a paddle lying in it. Along +z.
 */
export function canoeModel() {
  const b = new Parts(201);
  const wood = 0x8a5a34, inside = 0x6a4428, rim = 0x7a4e2c;
  const L = 4.2, n = 9;
  for (let k = 0; k < n; k++) {
    const u0 = -L / 2 + (L * k) / n, u = u0 + L / n / 2;
    const t = Math.abs(u) / (L / 2), w = 0.36 * Math.sqrt(Math.max(0.05, 1 - t * t * t)), lift = 0.12 * t * t * t;
    b.add(new BoxGeometry(w * 2, 0.08, L / n + 0.02), wood, [0, 0.04 + lift, u]); // (the bottom)
    for (const sx of [-1, 1]) b.add(new BoxGeometry(0.06, 0.32, L / n + 0.02), rim, [sx * (w - 0.03), 0.2 + lift, u], [0, 0, sx * -0.12]); // (the sides)
    b.add(new BoxGeometry(w * 2 - 0.1, 0.01, L / n), inside, [0, 0.085 + lift, u]);
  }
  for (const z of [-L / 2 - 0.05, L / 2 + 0.05]) b.add(new BoxGeometry(0.12, 0.3, 0.2), wood, [0, 0.3, z]); // (the ends, drawn up)
  for (const z of [-0.9, 0.9]) b.add(new BoxGeometry(0.66, 0.04, 0.1), 0x9a6a40, [0, 0.3, z]); // (thwarts)
  b.add(new BoxGeometry(0.04, 0.03, 1.2), 0x9a7048, [0.14, 0.12, 0.1], [0, 0.2, 0]); // (the paddle, lying in it)
  b.add(new BoxGeometry(0.16, 0.02, 0.4), 0x9a7048, [0.22, 0.12, 0.8], [0, 0.2, 0]);
  return b.build();
}

/**
 * A ladder `len` m long, its feet at the origin, leaning in towards +z (on
 * a wall or a rock face): two rails, a rung every 30 cm.
 */
export function ladderModel(len = 3) {
  const b = new Parts(203);
  const h = len * 0.965, off = len * 0.26;
  for (const x of [-0.22, 0.22]) b.log([x, 0, 0], [x, h, off], 0.035, 0x8a6038, 0xc8a070, 5);
  for (let y = 0.3; y < h - 0.1; y += 0.3) b.add(new CylinderGeometry(0.022, 0.022, 0.44, 5), 0x9a7048, [0, y, (y / h) * off], [0, 0, Math.PI / 2]);
  return b.build();
}
