import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  IcosahedronGeometry,
  Quaternion,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { hash2, mulberry32 } from '../noise/random.js';

// Low-poly tree models. Each species is one merged geometry with its colours
// baked into per-face vertex colours, so a whole forest of a species is a
// single instanced draw call per chunk. Sizes are in metres, base at y = 0.
//
// Crowns are built from a few overlapping blobs (or stacked cones for pines)
// whose corners are pushed in and out a little, so no two faces sit on a
// perfect sphere. Each face gets a colour from dark at the bottom of the
// crown to sunlit at the top, plus a small random shade: the faceted look.
//
// Leafy species also get a "leaf" geometry: small, flat, pyramid-shaped
// leaf clusters set into the faces of the crown itself, drawn semi-transparent. They
// break up the smooth silhouette, catch the light a little differently from
// the crown underneath, and cast dappled shadows.

const TRUNK = 0x6e4c35;
const BARK_DEAD = 0x7c6655;

const tmp = new Color();
const bottom = new Color();
const top = new Color();

/**
 * Pushes each corner in or out from `centre` by up to `amount` (a fraction
 * of its distance). The offset is hashed from the corner's position, so
 * faces that share a corner still meet: no cracks.
 */
function lumpy(geometry, amount, seed, centre = new Vector3()) {
  const pos = geometry.attributes.position;
  const v = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const h = hash2(Math.round(v.x * 97 + v.y * 13), Math.round(v.z * 97 - v.y * 31), seed);
    v.sub(centre).multiplyScalar(1 + (h - 0.5) * 2 * amount).add(centre);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  return geometry;
}

/**
 * Prepares one piece of a tree: non-indexed (so every face is flat), placed,
 * and coloured per face from `colorLow` (bottom of the piece) to `colorHigh`
 * (top), with a small random shade per face.
 */
function part(geometry, colorLow, colorHigh = colorLow, options = {}) {
  const { x = 0, y = 0, z = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1, lump = 0, seed = 1 } = options;
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  g.deleteAttribute('uv');
  g.scale(sx, sy, sz);
  if (lump) lumpy(g, lump, seed);
  if (rx) g.rotateX(rx);
  if (rz) g.rotateZ(rz);
  g.translate(x, y, z);
  g.computeVertexNormals();

  g.computeBoundingBox();
  const { min, max } = g.boundingBox;
  const rand = mulberry32(seed * 7919);
  bottom.set(colorLow);
  top.set(colorHigh);
  const pos = g.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let f = 0; f < pos.count; f += 3) {
    const cy = (pos.getY(f) + pos.getY(f + 1) + pos.getY(f + 2)) / 3;
    const t = max.y > min.y ? (cy - min.y) / (max.y - min.y) : 0.5;
    tmp.copy(bottom).lerp(top, t).multiplyScalar(0.9 + rand() * 0.2);
    for (let k = 0; k < 3; k++) colors.set([tmp.r, tmp.g, tmp.b], (f + k) * 3);
  }
  g.setAttribute('color', new BufferAttribute(colors, 3));
  return g;
}

/**
 * Merges a tree's woody parts and crown into one geometry, and keeps the
 * crown on its own (as userData.crown) so leaf clusters can be placed right
 * on its faces.
 */
function withCrown(wood, crown, fruit = []) {
  // Mark which vertices are crown (1) and which wood (0), for the seasons
  // (and fruit, 2).
  const mark = (g, v) => g.setAttribute('aCrown', new BufferAttribute(new Float32Array(g.attributes.position.count).fill(v), 1));
  wood.forEach((g) => mark(g, 0));
  crown.forEach((g) => mark(g, 1));
  fruit.forEach((g) => mark(g, 2));
  const solid = mergeGeometries([...wood, ...crown, ...fruit]);
  solid.userData.crown = mergeGeometries(crown);
  // And the tree without the boughs inside its crown, for whenever they're
  // hidden in the leaves (fewer faces to draw): see TreeLayer.
  if (wood.some((g) => g.userData.bough)) solid.userData.lean = mergeGeometries([...wood.filter((g) => !g.userData.bough), ...crown, ...fruit]);
  return solid;
}

/** A tapering limb from point `a` to point `b` (radii r0 at a, r1 at b). */
function limb(a, b, r0, r1, color, colorTip, seed) {
  const from = new Vector3(...a), to = new Vector3(...b);
  const dir = to.clone().sub(from);
  const length = dir.length();
  const g = new CylinderGeometry(r1, r0, length, 4, 1, true);
  g.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir.normalize()));
  g.translate((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
  return part(g, color, colorTip, { seed });
}

/**
 * The boughs inside a crown: from the trunk (between `low` and `top` up it)
 * out towards each blob of the crown, forking into a couple of twigs. In
 * summer they're hidden in the leaves; in winter, when a deciduous tree's
 * crown has gone, they're what's left: a proper bare tree, not a stump.
 */
function boughs(blobs, low, top, color, seed, { thick = 1, lean = [0, 0] } = {}) {
  const rand = mulberry32(seed * 131);
  const out = [];
  blobs.forEach(([x, y, z, r], i) => {
    const h = low + (top - low) * (0.35 + 0.65 * rand());
    const base = [lean[0] * h, h, lean[1] * h];
    // Out to the far side of the blob's middle, where it forks.
    const fork = [x * 1.1 + (rand() - 0.5) * 0.4, y - r * 0.1, z * 1.1 + (rand() - 0.5) * 0.4];
    out.push(limb(base, fork, 0.1 * thick, 0.055 * thick, color, color, seed + i * 3));
    for (let k = 0; k < 2; k++) {
      const a = rand() * Math.PI * 2;
      const tip = [fork[0] + Math.cos(a) * r * 0.75, fork[1] + r * (0.35 + 0.4 * rand()), fork[2] + Math.sin(a) * r * 0.75];
      out.push(limb(fork, tip, 0.05 * thick, 0.018 * thick, color, color, seed + i * 3 + k + 1));
    }
  });
  for (const g of out) g.userData.bough = true; // (see withCrown: left out while they're hidden)
  return out;
}

// Pine tiers: [radius, height, centre y]
const PINE_TIERS = [
  [2.5, 2.8, 3.0],
  [2.05, 2.6, 4.5],
  [1.55, 2.4, 5.9],
  [1.0, 2.2, 7.2],
];

function pineTier([radius, height, cy], i) {
  const cone = new ConeGeometry(radius, height, 8, 1);
  // Let the lower rim droop unevenly, like heavy boughs.
  const pos = cone.attributes.position;
  for (let k = 0; k < pos.count; k++) {
    if (pos.getY(k) < -height / 2 + 0.01) {
      const a = Math.atan2(pos.getZ(k), pos.getX(k));
      pos.setY(k, pos.getY(k) - (0.15 + 0.3 * (0.5 + 0.5 * Math.sin(a * 3 + i))));
    }
  }
  return part(cone, 0x2b6139, 0x4c9a55, { y: cy, lump: 0.12, seed: 20 + i });
}

function pine() {
  return withCrown([part(new CylinderGeometry(0.2, 0.34, 2.4, 6), TRUNK, 0x7d5a40, { y: 1.2, seed: 2 })], PINE_TIERS.map(pineTier));
}

// Broadleaf crown blobs: [x, y, z, radius]
const BROADLEAF_BLOBS = [
  [0, 4.3, 0, 2.1],
  [1.25, 4.8, 0.55, 1.55],
  [-1.15, 4.6, -0.65, 1.65],
  [0.15, 5.8, -0.2, 1.4],
  [-0.4, 4.9, 1.2, 1.3],
];

function broadleaf() {
  return withCrown(
    [
      part(new CylinderGeometry(0.22, 0.38, 3.0, 6), TRUNK, 0x80593f, { y: 1.5, seed: 3 }),
      part(new CylinderGeometry(0.07, 0.13, 1.4, 4), TRUNK, TRUNK, { x: 0.45, y: 3.2, rz: -0.8, seed: 4 }),
      part(new CylinderGeometry(0.07, 0.12, 1.3, 4), TRUNK, TRUNK, { x: -0.4, y: 3.1, rz: 0.75, seed: 5 }),
      ...boughs(BROADLEAF_BLOBS, 2.4, 3.2, TRUNK, 6),
    ],
    BROADLEAF_BLOBS.map(([x, y, z, r], i) =>
      part(new IcosahedronGeometry(r, 0), 0x3f7f35, 0x7fbd58, { x, y, z, sy: 0.82, lump: 0.2, seed: 30 + i }),
    ),
  );
}

// Spruce: many narrow, dark, blue-green tiers.
const SPRUCE_TIERS = [
  [1.9, 2.4, 2.6],
  [1.65, 2.2, 3.8],
  [1.4, 2.1, 5.0],
  [1.15, 2.0, 6.2],
  [0.9, 1.9, 7.3],
  [0.6, 1.8, 8.4],
];

function spruce() {
  return withCrown(
    [part(new CylinderGeometry(0.16, 0.3, 2.0, 6), 0x5e4231, 0x6e4c35, { y: 1.0, seed: 50 })],
    SPRUCE_TIERS.map(([radius, height, cy], i) => {
      const cone = new ConeGeometry(radius, height, 7, 1);
      return part(cone, 0x1f4d37, 0x3a7652, { y: cy, lump: 0.1, seed: 51 + i });
    }),
  );
}

/**
 * Birch-type bark: a chalky trunk ringed with thin dark streaks (lenticels)
 * that wrap part way round it, more of them low down, and a dark, fissured
 * foot. `r0` at the foot, `r1` at the top.
 */
function birchTrunk(r0, r1, height, seed, { bark, barkTop, marks, foot, count }) {
  const rand = mulberry32(seed * 17);
  const radius = (y) => r0 + (r1 - r0) * (y / height);
  const out = [
    part(new CylinderGeometry(r1, r0, height, 7, 3), bark, barkTop, { y: height / 2, seed }),
    // The foot: rough and dark, paling upwards.
    part(new CylinderGeometry(radius(0.8) + 0.015, r0 + 0.03, 0.8, 7, 1), foot, bark, { y: 0.4, lump: 0.08, seed: seed + 1 }),
  ];
  for (let k = 0; k < count; k++) {
    const y = 0.8 + Math.pow(rand(), 1.4) * (height * 0.9 - 0.8);
    const r = radius(y) + 0.012;
    const h = 0.04 + rand() * 0.07;
    const arc = 0.8 + rand() * 2.2;
    const g = new CylinderGeometry(r, r, h, 4, 1, true, rand() * Math.PI * 2, arc);
    out.push(part(g, marks, marks, { y, seed: seed + 2 + k }));
  }
  return out;
}

/**
 * A birch or aspen: a slim pale trunk with dark streaks, running up into a
 * light, airy crown of small blobs. `weeping` hangs strands of leaves from
 * the crown (silver birch).
 */
function birchLike({ height, r0, r1, blobs, bark, barkTop, marks, foot, count, crownLow, crownHigh, sy = 0.9, weeping = 0, seed }) {
  const rand = mulberry32(seed * 29);
  const strands = [];
  for (let k = 0; k < weeping; k++) {
    const [x, y, z, r] = blobs[k % blobs.length];
    const a = rand() * Math.PI * 2;
    const len = 1.2 + rand() * 1.4;
    const g = new ConeGeometry(0.22 + rand() * 0.12, len, 3, 1);
    g.rotateX(Math.PI); // hanging, point down
    strands.push(part(g, crownHigh, crownLow, { x: x + Math.cos(a) * r * 0.85, y: y - r * 0.2 - len / 2, z: z + Math.sin(a) * r * 0.85, seed: seed + 40 + k }));
  }
  return withCrown(
    [
      ...birchTrunk(r0, r1, height, seed, { bark, barkTop, marks, foot, count }),
      ...boughs(blobs, height * 0.62, height * 0.95, 0x9a8e80, seed + 30, { thick: 0.7 }),
    ],
    [
      ...blobs.map(([x, y, z, r], i) => part(new IcosahedronGeometry(r, 0), crownLow, crownHigh, { x, y, z, sy, lump: 0.22, seed: seed + 20 + i })),
      ...strands,
    ],
  );
}

const BIRCH_BARK = { bark: 0xe6e3da, barkTop: 0xf3f1ea, marks: 0x3a342f, foot: 0x4d453e };

// Birch: slim white trunk, small airy yellow-green crown.
const BIRCH_BLOBS = [
  [0, 5.6, 0, 1.3],
  [0.75, 6.4, 0.35, 1.0],
  [-0.65, 6.2, -0.4, 1.05],
  [0.1, 7.4, 0, 0.9],
  [-0.2, 5.4, 0.8, 0.85],
];

function birch() {
  return birchLike({ height: 6.4, r0: 0.2, r1: 0.1, blobs: BIRCH_BLOBS, ...BIRCH_BARK, count: 16, crownLow: 0x628f37, crownHigh: 0xa9cd62, seed: 60 });
}

// Silver birch: taller, its crown an upright oval hung with weeping strands.
const SILVER_BIRCH_BLOBS = [
  [0, 6.4, 0, 1.2],
  [0.6, 7.5, 0.2, 1.0],
  [-0.55, 7.2, -0.35, 1.0],
  [0.05, 8.6, 0.05, 0.85],
  [0.2, 5.6, -0.6, 0.8],
];

function silverBirch() {
  return birchLike({ height: 8.2, r0: 0.21, r1: 0.09, blobs: SILVER_BIRCH_BLOBS, ...BIRCH_BARK, count: 20, crownLow: 0x5c8a35, crownHigh: 0x9fc85c, sy: 1.25, weeping: 10, seed: 600 });
}

// Aspen: a tall, straight, greenish-white trunk with dark "eyes", and a
// small round crown high up.
const ASPEN_BLOBS = [
  [0, 7.4, 0, 1.15],
  [0.6, 8.1, 0.2, 0.9],
  [-0.5, 7.9, -0.3, 0.95],
  [0.05, 8.9, 0, 0.75],
];

function aspen() {
  return birchLike({
    height: 8.4, r0: 0.19, r1: 0.1, blobs: ASPEN_BLOBS, bark: 0xd6dac8, barkTop: 0xe4e7d7, marks: 0x2f2d29, foot: 0x55503f,
    count: 10, crownLow: 0x5f9338, crownHigh: 0xa8cf5e, sy: 1.1, seed: 640,
  });
}

// Oak: a thick, short trunk splitting into heavy limbs under a broad,
// spreading, dark crown.
const OAK_BLOBS = [
  [0, 5.0, 0, 2.2],
  [2.0, 4.5, 0.6, 1.7],
  [-1.9, 4.6, -0.5, 1.8],
  [0.5, 4.4, -1.9, 1.6],
  [-0.6, 4.3, 1.9, 1.6],
  [0.2, 6.2, 0.1, 1.5],
];

function oak() {
  const bark = 0x4d3a2c, barkTop = 0x5e4735;
  return withCrown(
    [
      part(new CylinderGeometry(0.34, 0.56, 2.8, 7), bark, barkTop, { y: 1.4, lump: 0.08, seed: 1000 }),
      limb([0, 2.4, 0], [1.7, 4.0, 0.5], 0.26, 0.12, bark, barkTop, 1001),
      limb([0, 2.5, 0], [-1.6, 4.1, -0.4], 0.25, 0.12, bark, barkTop, 1002),
      limb([0, 2.6, 0], [0.4, 4.0, -1.6], 0.22, 0.1, bark, barkTop, 1003),
      limb([0, 2.6, 0], [-0.5, 3.9, 1.6], 0.22, 0.1, bark, barkTop, 1004),
      ...boughs(OAK_BLOBS, 3.2, 4.2, bark, 1005, { thick: 1.3 }),
    ],
    OAK_BLOBS.map(([x, y, z, r], i) => part(new IcosahedronGeometry(r, 0), 0x355d2a, 0x6a9a46, { x, y, z, sy: 0.72, lump: 0.22, seed: 1010 + i })),
  );
}

// Larch: a slim conifer of soft, bright green tiers that turn gold in
// autumn and drop their needles for the winter.
const LARCH_TIERS = [
  [1.9, 1.7, 3.0],
  [1.65, 1.6, 4.2],
  [1.35, 1.5, 5.4],
  [1.05, 1.45, 6.5],
  [0.75, 1.4, 7.6],
  [0.45, 1.4, 8.6],
];

function larch() {
  return withCrown(
    [limb([0, 0, 0], [0, 9.2, 0], 0.26, 0.05, 0x6a4a36, 0x7a5a44, 1100)],
    LARCH_TIERS.map(([radius, height, cy], i) => {
      const cone = new ConeGeometry(radius, height, 7, 1);
      const pos = cone.attributes.position;
      for (let k = 0; k < pos.count; k++) {
        if (pos.getY(k) < -height / 2 + 0.01) {
          const a = Math.atan2(pos.getZ(k), pos.getX(k));
          pos.setY(k, pos.getY(k) - (0.2 + 0.35 * (0.5 + 0.5 * Math.sin(a * 4 + i * 2))));
        }
      }
      return part(cone, 0x4c8436, 0x92c25c, { y: cy, lump: 0.16, seed: 1110 + i });
    }),
  );
}

// Poplar: tall, columnar crown of stacked stretched blobs.
const POPLAR_BLOBS = [
  [0, 3.8, 0, 1.25],
  [0.15, 5.6, 0.1, 1.2],
  [-0.1, 7.3, -0.1, 1.05],
  [0.05, 8.8, 0.05, 0.8],
];

function poplar() {
  return withCrown(
    [
      part(new CylinderGeometry(0.16, 0.3, 3.0, 6), TRUNK, 0x7d5a40, { y: 1.5, seed: 70 }),
      // A leader running on up through the column of the crown.
      limb([0, 2.9, 0], [0, 8.6, 0], 0.16, 0.05, TRUNK, 0x7d5a40, 76),
      ...boughs(POPLAR_BLOBS, 2.8, 7.5, TRUNK, 77, { thick: 0.8 }),
    ],
    POPLAR_BLOBS.map(([x, y, z, r], i) =>
      part(new IcosahedronGeometry(r, 0), 0x3d7a33, 0x78b04f, { x, y, z, sy: 1.5, lump: 0.18, seed: 71 + i }),
    ),
  );
}

// Autumn maple: a broad round crown in orange and red.
const MAPLE_BLOBS = [
  [0, 4.0, 0, 2.0],
  [1.2, 4.5, -0.4, 1.5],
  [-1.1, 4.4, 0.6, 1.55],
  [0.1, 5.4, 0.2, 1.4],
];

function maple() {
  return withCrown(
    [
      part(new CylinderGeometry(0.2, 0.36, 2.8, 6), 0x5f4332, 0x6e4c35, { y: 1.4, seed: 80 }),
      part(new CylinderGeometry(0.06, 0.12, 1.4, 4), 0x5f4332, 0x5f4332, { x: -0.45, y: 3.0, rz: 0.8, seed: 81 }),
      ...boughs(MAPLE_BLOBS, 2.2, 3.0, 0x5f4332, 86),
    ],
    MAPLE_BLOBS.map(([x, y, z, r], i) =>
      part(new IcosahedronGeometry(r, 0), 0xa8401f, 0xf0a13a, { x, y, z, sy: 0.85, lump: 0.2, seed: 82 + i }),
    ),
  );
}

const BUSH_BLOBS = [
  [0, 0.65, 0, 1.0],
  [0.75, 0.5, 0.35, 0.75],
  [-0.6, 0.45, -0.3, 0.7],
];

function bush() {
  return withCrown(
    // Twiggy stems, bare in winter.
    BUSH_BLOBS.flatMap(([x, y, z, r], i) => [
      limb([x * 0.2, 0, z * 0.2], [x * 1.1, y + r * 0.35, z * 1.1], 0.045, 0.02, 0x5a4636, 0x6e5a48, 44 + i),
      limb([x * 0.2, 0, z * 0.2], [x * 0.6 - z * 0.5, y + r * 0.5, z * 0.6 + x * 0.5], 0.035, 0.015, 0x5a4636, 0x6e5a48, 47 + i),
    ]),
    BUSH_BLOBS.map(([x, y, z, r], i) =>
      part(new DodecahedronGeometry(r, 0), 0x4f8c3d, 0x86c05c, { x, y, z, sy: 0.72, lump: 0.18, seed: 40 + i }),
    ),
  );
}

// Bald cypress (swamps): a trunk flaring wide at its foot, rising tall and
// straight to a flat, layered crown of feathery needles, hung with grey
// Spanish moss. It sheds its needles in winter (rust-red in autumn).
const CYPRESS_BLOBS = [
  [0, 7.7, 0, 1.9],
  [1.2, 7.1, 0.5, 1.35],
  [-1.1, 7.3, -0.45, 1.4],
  [0.3, 8.5, -0.25, 1.2],
  [-0.2, 6.6, 1.1, 1.1],
];

function cypress() {
  const moss = [];
  const rand = mulberry32(911);
  for (let k = 0; k < 9; k++) {
    const [x, y, z, r] = CYPRESS_BLOBS[k % CYPRESS_BLOBS.length];
    const a = rand() * Math.PI * 2;
    const len = 1.0 + rand() * 1.3;
    const g = new ConeGeometry(0.16 + rand() * 0.1, len, 3, 1);
    g.rotateX(Math.PI); // hanging, point down
    moss.push(part(g, 0x9aa487, 0x7f8c6c, { x: x + Math.cos(a) * r * 0.8, y: y - r * 0.35 - len / 2, z: z + Math.sin(a) * r * 0.8, seed: 920 + k }));
  }
  return withCrown(
    [
      // The flared foot (buttress), and the trunk.
      part(new CylinderGeometry(0.3, 0.8, 1.7, 7), 0x5c4b3c, 0x6e5b49, { y: 0.85, lump: 0.12, seed: 900 }),
      part(new CylinderGeometry(0.17, 0.3, 6.2, 6), 0x6e5b49, 0x7b6752, { y: 4.7, seed: 901 }),
      ...boughs(CYPRESS_BLOBS, 5.6, 7.4, 0x6e5b49, 902, { thick: 0.9 }),
      ...moss,
    ],
    CYPRESS_BLOBS.map(([x, y, z, r], i) =>
      part(new DodecahedronGeometry(r, 0), 0x4a6a34, 0x7f9c52, { x, y, z, sy: 0.42, lump: 0.22, seed: 930 + i }),
    ),
  );
}

// Swamp willow: a short, stout, leaning trunk with knobbly knees round
// its foot, under a lumpy, spreading crown hung all round with separate
// strands of leaves, long and short, trailing down towards the water.
const WILLOW_BLOBS = [
  [0.3, 4.7, 0, 1.9],
  [1.5, 4.3, 0.8, 1.35],
  [-1.1, 4.4, -0.8, 1.45],
  [-0.4, 4.2, 1.3, 1.2],
  [0.9, 4.9, -1.2, 1.2],
];

function swampWillow() {
  const rand = mulberry32(955);
  const strands = [];
  for (let k = 0; k < 30; k++) {
    const [x, y, z, r] = WILLOW_BLOBS[k % WILLOW_BLOBS.length];
    const a = rand() * Math.PI * 2, out = r * (0.75 + 0.3 * rand());
    const len = 1.4 + rand() * 2.6;
    const g = new ConeGeometry(0.14 + rand() * 0.1, len, 3, 1);
    g.rotateX(Math.PI); // hanging, point down
    strands.push(part(g, 0x6f9a3e, 0x9dbd5a, { x: x + Math.cos(a) * out, y: y - r * 0.2 - len / 2, z: z + Math.sin(a) * out, seed: 975 + k }));
  }
  const knees = [];
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + rand() * 0.6, d = 0.9 + rand() * 0.9;
    knees.push(part(new ConeGeometry(0.12 + rand() * 0.08, 0.5 + rand() * 0.5, 5, 1), 0x5a4a38, 0x6b5842, { x: Math.cos(a) * d, y: 0.25, z: Math.sin(a) * d, lump: 0.15, seed: 990 + k }));
  }
  return withCrown(
    [
      part(new CylinderGeometry(0.26, 0.5, 3.4, 6), 0x5a4a38, 0x6b5842, { x: 0.15, y: 1.7, rz: -0.1, lump: 0.08, seed: 950 }),
      ...boughs(WILLOW_BLOBS, 2.6, 3.4, 0x5a4a38, 951, { lean: [0.05, 0] }),
      ...knees,
    ],
    [
      ...WILLOW_BLOBS.map(([x, y, z, r], i) => part(new IcosahedronGeometry(r, 0), 0x5f8a36, 0x9dbd5a, { x, y, z, sy: 0.6, lump: 0.25, seed: 960 + i })),
      ...strands,
    ],
  );
}

// Weeping willow (swamps): a short, thick trunk under a low dome whose
// long strands of leaves hang right down to the ground or the water.
const WEEPING_BLOBS = [
  [0, 4.3, 0, 2.3],
  [1.4, 3.9, 0.6, 1.6],
  [-1.3, 4.0, -0.7, 1.7],
  [0.3, 4.0, -1.5, 1.5],
  [-0.4, 3.9, 1.5, 1.5],
];

function weepingWillow() {
  const rand = mulberry32(1201);
  const strands = [];
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2 + rand() * 0.2;
    const d = 2.0 + rand() * 1.1;
    const len = 2.9 + rand() * 1.0;
    const top = 4.1 - (d - 2) * 0.5;
    const g = new ConeGeometry(0.4 + rand() * 0.15, len, 3, 1);
    g.rotateX(Math.PI);
    strands.push(part(g, 0x9fbf5c, 0x7ca043, { x: Math.cos(a) * d, y: top - len / 2, z: Math.sin(a) * d, seed: 1210 + k }));
  }
  return withCrown(
    [
      part(new CylinderGeometry(0.3, 0.46, 2.6, 7), 0x5a4a38, 0x6b5842, { y: 1.3, lump: 0.08, seed: 1200 }),
      ...boughs(WEEPING_BLOBS, 2.2, 2.8, 0x5a4a38, 1202, { thick: 1.1 }),
    ],
    [...WEEPING_BLOBS.map(([x, y, z, r], i) => part(new IcosahedronGeometry(r, 0), 0x6f9a3e, 0xa2c35e, { x, y, z, sy: 0.6, lump: 0.2, seed: 1240 + i })), ...strands],
  );
}

// Mangrove-like swamp tree: a low, dense, dark crown standing on a cage of
// arching stilt roots.
const MANGROVE_BLOBS = [
  [0, 3.2, 0, 1.7],
  [1.3, 2.9, 0.4, 1.3],
  [-1.2, 3.0, -0.5, 1.35],
  [0.3, 2.8, -1.3, 1.2],
  [-0.4, 2.9, 1.3, 1.2],
  [0.1, 3.9, 0, 1.1],
];

function mangrove() {
  const rand = mulberry32(1301);
  const bark = 0x5d5046, barkTip = 0x72655a;
  const roots = [];
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2 + rand() * 0.3;
    const y0 = 0.9 + rand() * 0.7;
    const out = 1.4 + rand() * 0.6;
    const from = [Math.cos(a) * 0.18, y0, Math.sin(a) * 0.18];
    const mid = [Math.cos(a) * out * 0.55, y0 + 0.3, Math.sin(a) * out * 0.55];
    const foot = [Math.cos(a) * out, -0.4, Math.sin(a) * out];
    roots.push(limb(from, mid, 0.09, 0.075, bark, barkTip, 1310 + k), limb(mid, foot, 0.075, 0.06, barkTip, bark, 1320 + k));
  }
  return withCrown(
    [
      limb([0, 0.8, 0], [0.05, 2.7, 0], 0.22, 0.17, bark, barkTip, 1300),
      ...roots,
      ...boughs(MANGROVE_BLOBS, 2.0, 2.6, bark, 1302),
    ],
    MANGROVE_BLOBS.map(([x, y, z, r], i) => part(new IcosahedronGeometry(r, 0), 0x2d5628, 0x5f8c45, { x, y, z, sy: 0.68, lump: 0.2, seed: 1340 + i })),
  );
}

/**
 * A frond (fern or palm): a flat, slightly V-shaped strip arching out from
 * `base` at heading `a`, `len` long, widest part way along, rising by
 * `lift` then drooping by `droop`. Shaded top and bottom.
 */
function frond(base, a, len, w, lift, droop, colorLow, colorHigh, seed) {
  const n = 5;
  const cx = Math.cos(a), cz = Math.sin(a), sx = -Math.sin(a), sz = Math.cos(a);
  const rows = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const d = len * t;
    const y = base[1] + lift * t - droop * t * t;
    const half = w * Math.sin(Math.PI * (0.15 + 0.85 * t));
    const c = [base[0] + cx * d, y, base[2] + cz * d];
    rows.push([c, [c[0] + sx * half, y - 0.1 * half, c[2] + sz * half], [c[0] - sx * half, y - 0.1 * half, c[2] - sz * half]]);
  }
  const positions = [];
  const tri = (p, q, r, upward) => {
    const e1 = new Vector3(q[0] - p[0], q[1] - p[1], q[2] - p[2]), e2 = new Vector3(r[0] - p[0], r[1] - p[1], r[2] - p[2]);
    const up = e1.cross(e2).y >= 0;
    if (up === upward) positions.push(...p, ...q, ...r);
    else positions.push(...p, ...r, ...q);
  };
  for (let k = 0; k < n; k++) {
    const [c0, l0, r0] = rows[k], [c1, l1, r1] = rows[k + 1];
    for (const upward of [true, false]) {
      tri(c0, l0, l1, upward);
      tri(c0, l1, c1, upward);
      tri(c0, c1, r1, upward);
      tri(c0, r1, r0, upward);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  return part(g, colorLow, colorHigh, { seed });
}

// Tree fern (volcanic highlands): a slim, shaggy trunk topped by a ring of
// long arching fronds, a couple of young ones still rising in the middle.
function treeFern() {
  const rand = mulberry32(1401);
  const top = [0.15, 3.6, 0.05];
  const fronds = [];
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2 + rand() * 0.3;
    fronds.push(frond(top, a, 2.4 + rand() * 0.6, 0.42 + rand() * 0.1, 0.8, 2.0 + rand() * 0.5, 0x355f28, 0x78a84a, 1410 + k));
  }
  for (let k = 0; k < 3; k++) fronds.push(frond(top, rand() * Math.PI * 2, 1.3, 0.3, 1.5, 0.3, 0x4f8435, 0x8cbc58, 1430 + k));
  return withCrown([part(new CylinderGeometry(0.17, 0.24, 3.7, 6, 2), 0x3a2c22, 0x4d3a2c, { x: 0.07, y: 1.85, lump: 0.1, seed: 1400 })], fronds);
}

// Jungle giant: a pale, straight trunk standing on buttress roots, rising
// far above the rest to a broad umbrella of a canopy, hung with vines.
const GIANT_BLOBS = [
  [0, 20.4, 0, 3.8],
  [4.3, 19.6, 1.3, 3.3],
  [-4.0, 19.8, -1.5, 3.4],
  [1.1, 19.4, -4.3, 3.1],
  [-1.5, 19.5, 4.1, 3.1],
  [3.0, 20.9, -2.8, 2.7],
  [-2.9, 20.8, 2.6, 2.7],
  [0.4, 21.6, 0.3, 2.6],
];

function jungleGiant() {
  const rand = mulberry32(1901);
  const bark = 0x7a6b58, barkTop = 0x8e7f6a;
  const wood = [part(new CylinderGeometry(0.42, 0.72, 18.5, 7, 3), bark, barkTop, { y: 9.25, lump: 0.05, seed: 1900 })];
  // Buttress roots: flared fins round the foot.
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + rand() * 0.4;
    wood.push(limb([Math.cos(a) * 1.9, -0.2, Math.sin(a) * 1.9], [Math.cos(a) * 0.3, 3.2, Math.sin(a) * 0.3], 0.2, 0.28, bark, barkTop, 1910 + k));
  }
  // Great limbs out to the canopy.
  GIANT_BLOBS.slice(1, 5).forEach(([x, y, z], k) => wood.push(limb([0, 16.5, 0], [x * 0.8, y - 1.2, z * 0.8], 0.3, 0.14, barkTop, bark, 1920 + k)));
  // Vines trailing down from under the canopy.
  const vines = [];
  for (let k = 0; k < 16; k++) {
    const [x, y, z, r] = GIANT_BLOBS[k % GIANT_BLOBS.length];
    const a = rand() * Math.PI * 2, len = 4 + rand() * 7;
    const g = new ConeGeometry(0.09 + rand() * 0.05, len, 3, 1);
    g.rotateX(Math.PI);
    vines.push(part(g, 0x5c8a3e, 0x35602a, { x: x + Math.cos(a) * r * 0.7, y: y - r * 0.35 - len / 2, z: z + Math.sin(a) * r * 0.7, seed: 1930 + k }));
  }
  return withCrown(wood, [
    ...GIANT_BLOBS.map(([x, y, z, r], i) => part(new IcosahedronGeometry(r, 0), 0x2c6327, 0x5a9a3a, { x, y, z, sy: 0.62, lump: 0.22, seed: 1950 + i })),
    ...vines,
  ]);
}

// Jungle canopy tree: the jungle's main storey (the giants stand out above
// it), a stout trunk on small buttresses forking into a broad, deep,
// rounded crown that closes with its neighbours', vines hanging from it.
const CANOPY_BLOBS = [
  [0, 10.4, 0, 3.4],
  [3.1, 9.8, 1.2, 2.9],
  [-3.0, 9.9, -1.0, 3.0],
  [0.8, 9.7, -3.1, 2.8],
  [-1.1, 9.8, 3.0, 2.8],
  [2.1, 11.4, -1.7, 2.4],
  [-1.9, 11.3, 1.8, 2.4],
  [0.3, 12.1, 0.2, 2.3],
];

function jungleCanopy() {
  const rand = mulberry32(2401);
  const bark = 0x6e604c, barkTop = 0x857661;
  const wood = [part(new CylinderGeometry(0.3, 0.5, 9, 7, 2), bark, barkTop, { y: 4.5, lump: 0.06, seed: 2400 })];
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + rand() * 0.5;
    wood.push(limb([Math.cos(a) * 1.1, -0.2, Math.sin(a) * 1.1], [Math.cos(a) * 0.2, 1.8, Math.sin(a) * 0.2], 0.13, 0.2, bark, barkTop, 2410 + k));
  }
  CANOPY_BLOBS.slice(1, 5).forEach(([x, y, z], k) => wood.push(limb([0, 7.4, 0], [x * 0.75, y - 1, z * 0.75], 0.22, 0.1, barkTop, bark, 2420 + k)));
  const vines = [];
  for (let k = 0; k < 8; k++) {
    const [x, y, z, r] = CANOPY_BLOBS[1 + (k % 4)];
    const a = rand() * Math.PI * 2, len = 2 + rand() * 3.5;
    const g = new ConeGeometry(0.08 + rand() * 0.04, len, 3, 1);
    g.rotateX(Math.PI);
    vines.push(part(g, 0x5c8a3e, 0x35602a, { x: x + Math.cos(a) * r * 0.7, y: y - r * 0.4 - len / 2, z: z + Math.sin(a) * r * 0.7, seed: 2430 + k }));
  }
  return withCrown(wood, [
    ...CANOPY_BLOBS.map(([x, y, z, r], i) => part(new IcosahedronGeometry(r, 0), 0x285c26, 0x4f8f38, { x, y, z, sy: 0.72, lump: 0.22, seed: 2450 + i })),
    ...vines,
  ]);
}

// Jungle palm: a slender trunk curving up to a crown of long, drooping fronds.
function junglePalm() {
  const rand = mulberry32(2001);
  const bark = 0x76654e, barkTop = 0x8a7a60;
  const pts = [[0, 0, 0], [0.35, 3, 0.05], [1.0, 6, 0.15], [1.7, 8.6, 0.25]];
  const wood = pts.slice(1).map((p, k) => limb(pts[k], p, 0.24 - k * 0.03, 0.2 - k * 0.03, bark, barkTop, 2010 + k));
  const top = pts[3];
  const fronds = [];
  for (let k = 0; k < 11; k++) {
    const a = (k / 11) * Math.PI * 2 + rand() * 0.3;
    fronds.push(frond(top, a, 3.2 + rand() * 0.8, 0.5, 0.7, 2.6 + rand() * 0.6, 0x3a742c, 0x78ad4a, 2020 + k));
  }
  for (let k = 0; k < 4; k++) {
    const a = rand() * Math.PI * 2;
    wood.push(part(new IcosahedronGeometry(0.2, 0), 0x6b5231, 0x7d6038, { x: top[0] + Math.cos(a) * 0.3, y: top[1] - 0.35, z: top[2] + Math.sin(a) * 0.3, seed: 2040 + k }));
  }
  return withCrown(wood, fronds);
}

// Bamboo (on the jungle's edges): a thicket of tall, slender, jointed
// canes leaning out a little from the clump, sprays of narrow leaves on
// their upper halves.
function bamboo() {
  const rand = mulberry32(2101);
  const cane = 0x6f8f3a, caneTop = 0x9aae4c, node = 0x4f6a2a;
  const wood = [], sprays = [];
  for (let k = 0; k < 7; k++) {
    const a = rand() * Math.PI * 2, d = 0.15 + rand() * 0.9;
    const h = 8.5 + rand() * 5, lean = 0.04 + rand() * 0.06;
    const base = [Math.cos(a) * d, 0, Math.sin(a) * d];
    const tip = [base[0] + Math.cos(a) * h * lean * 2, h, base[2] + Math.sin(a) * h * lean * 2];
    const r = 0.07 + rand() * 0.035;
    // The cane in lengths, with a darker ring at each joint.
    const joints = 4;
    for (let j = 0; j < joints; j++) {
      const t0 = j / joints, t1 = (j + 1) / joints;
      const p0 = base.map((v, i) => v + (tip[i] - v) * t0), p1 = base.map((v, i) => v + (tip[i] - v) * t1);
      wood.push(limb(p0, p1, r * (1 - 0.3 * t0), r * (1 - 0.3 * t1), cane, caneTop, 2110 + k * 10 + j));
      if (j) wood.push(part(new CylinderGeometry(r * 1.25, r * 1.25, 0.12, 5), node, node, { x: p0[0], y: p0[1], z: p0[2], seed: 2200 + k * 10 + j }));
    }
    // Leaf sprays up the top half.
    for (let j = 0; j < 3; j++) {
      const t = 0.5 + 0.16 * j + rand() * 0.05;
      const at = base.map((v, i) => v + (tip[i] - v) * t);
      sprays.push(frond(at, rand() * Math.PI * 2, 1.3 + rand() * 0.5, 0.2, 0.25, 0.7, 0x4f8a34, 0x86b454, 2300 + k * 10 + j));
    }
  }
  return withCrown(wood, sprays);
}

// Charred snag (volcanic highlands): a dead tree burned black by an old
// lava flow, its top snapped off.
function charredSnag() {
  const bark = 0x221e1b, barkTop = 0x3b332e;
  return mergeGeometries([
    part(new CylinderGeometry(0.1, 0.32, 5.6, 5, 2), bark, barkTop, { y: 2.8, lump: 0.1, seed: 1500 }),
    limb([0, 2.9, 0], [0.8, 3.5, 0.2], 0.08, 0.03, bark, barkTop, 1501),
    limb([0, 3.8, 0], [-0.6, 4.4, -0.3], 0.07, 0.03, bark, barkTop, 1502),
    limb([0, 2.1, 0], [0.1, 2.5, 0.7], 0.07, 0.03, bark, barkTop, 1503),
  ]);
}

// Acacia: a leaning, forked trunk under a wide, flat-topped crown (savanna).
const ACACIA_BLOBS = [
  [0.9, 4.25, 0, 1.9],
  [-0.6, 4.1, 0.3, 1.6],
  [0.2, 4.4, -0.9, 1.5],
  [0.5, 4.35, 1.0, 1.4],
  [-0.2, 4.55, -0.1, 1.3],
];

function acacia() {
  return withCrown(
    [
      part(new CylinderGeometry(0.15, 0.3, 3.3, 6), TRUNK, 0x7d6048, { x: 0.25, y: 1.6, rz: -0.18, seed: 60 }),
      part(new CylinderGeometry(0.07, 0.13, 1.9, 5), TRUNK, TRUNK, { x: 0.95, y: 3.45, rz: -0.75, seed: 61 }),
      part(new CylinderGeometry(0.07, 0.12, 1.6, 5), TRUNK, TRUNK, { x: -0.25, y: 3.35, rz: 0.8, seed: 62 }),
    ],
    ACACIA_BLOBS.map(([x, y, z, r], i) =>
      part(new DodecahedronGeometry(r, 0), 0x5b7a2f, 0x9aad4e, { x, y, z, sy: 0.3, lump: 0.2, seed: 63 + i }),
    ),
  );
}

// Saguaro cactus: a ribbed column with an arm on each side (desert).
const CACTUS = 0x3c6e3e;
const CACTUS_TOP = 0x5f9a52;

function cactus() {
  const column = (x, y, len, r, seed, rz = 0) => part(new CylinderGeometry(r, r * 1.1, len, 8), CACTUS, CACTUS_TOP, { x, y, rz, seed });
  const cap = (x, y, r, seed) => part(new IcosahedronGeometry(r, 0), CACTUS_TOP, CACTUS_TOP, { x, y, sy: 0.75, seed });
  return mergeGeometries([
    column(0, 2.2, 4.4, 0.36, 70),
    cap(0, 4.4, 0.37, 71),
    column(0.6, 1.9, 0.8, 0.21, 72, Math.PI / 2),
    column(0.98, 2.65, 1.6, 0.21, 73),
    cap(0.98, 3.45, 0.22, 74),
    column(-0.55, 2.7, 0.7, 0.2, 75, Math.PI / 2),
    column(-0.88, 3.2, 1.1, 0.2, 76),
    cap(-0.88, 3.75, 0.21, 77),
  ]);
}

// Barrel cacti: a squat clump, the biggest in flower (desert).
function smallCactus() {
  const barrel = (x, z, r, h, seed) => [
    part(new CylinderGeometry(r, r * 1.08, h, 9), CACTUS, CACTUS_TOP, { x, z, y: h / 2, seed }),
    part(new IcosahedronGeometry(r, 0), CACTUS_TOP, CACTUS_TOP, { x, z, y: h, sy: 0.45, seed: seed + 1 }),
  ];
  return mergeGeometries([
    ...barrel(0, 0, 0.42, 0.8, 80),
    ...barrel(0.72, 0.2, 0.28, 0.5, 82),
    ...barrel(-0.35, 0.6, 0.22, 0.38, 84),
    part(new IcosahedronGeometry(0.14, 0), 0xe0628a, 0xf08aa8, { y: 0.98, seed: 86 }),
  ]);
}

// Dry scrub: a sun-bleached bush (savanna, desert edges).
function dryBush() {
  return withCrown(
    [],
    BUSH_BLOBS.map(([x, y, z, r], i) =>
      part(new DodecahedronGeometry(r, 0), 0x7f7a40, 0xb8a85e, { x, y, z, sy: 0.65, lump: 0.22, seed: 90 + i }),
    ),
  );
}

// Baobab (savanna): a vast bottle-shaped trunk with stubby branches
// spreading from its top like roots, and a thin crown.
function baobab() {
  const rand = mulberry32(1601);
  const trunk = new CylinderGeometry(0.7, 1.05, 4.4, 9, 4);
  const pos = trunk.attributes.position;
  for (let k = 0; k < pos.count; k++) {
    const t = pos.getY(k) / 4.4 + 0.5;
    const bulge = 1 + 0.16 * Math.sin(Math.PI * t);
    pos.setX(k, pos.getX(k) * bulge);
    pos.setZ(k, pos.getZ(k) * bulge);
  }
  const bark = 0x8a7a6a, barkTop = 0x9c8c7a;
  const blobs = [];
  const branches = [];
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + rand() * 0.4;
    const out = 1.7 + rand() * 0.7;
    const tip = [Math.cos(a) * out, 5.3 + rand() * 0.7, Math.sin(a) * out];
    branches.push(limb([Math.cos(a) * 0.3, 4.1, Math.sin(a) * 0.3], tip, 0.3, 0.12, barkTop, bark, 1610 + k));
    blobs.push([tip[0] * 1.1, tip[1] + 0.35, tip[2] * 1.1, 0.8 + rand() * 0.35]);
  }
  return withCrown(
    [part(trunk, bark, barkTop, { y: 2.2, lump: 0.05, seed: 1600 }), ...branches],
    blobs.map(([x, y, z, r], i) => part(new DodecahedronGeometry(r, 0), 0x5a7a30, 0x92aa4e, { x, y, z, sy: 0.55, lump: 0.2, seed: 1620 + i })),
  );
}

// Joshua tree (desert): a shaggy trunk forking into stout arms, each ending
// in a spiky tuft of leaves over a skirt of dead ones.
function joshuaTree() {
  const bark = 0x5e5140, barkTop = 0x7a6a52;
  const A = [0.05, 1.9, 0], B = [0.8, 2.7, 0.2], C = [-0.65, 2.9, -0.25];
  const tips = [[0.15, 3.4, -0.75], [1.35, 3.45, 0.5], [0.75, 3.75, -0.05], [-1.15, 3.6, -0.05], [-0.5, 3.8, -0.55]];
  const from = [A, B, B, C, C];
  return mergeGeometries([
    limb([0, 0, 0], A, 0.28, 0.22, bark, barkTop, 1700),
    limb(A, B, 0.19, 0.15, barkTop, bark, 1701),
    limb(A, C, 0.19, 0.15, barkTop, bark, 1702),
    ...tips.flatMap((t, i) => [
      limb(from[i], t, 0.14, 0.11, barkTop, bark, 1710 + i),
      part(new ConeGeometry(0.34, 0.5, 6, 1), 0x8a7b5a, 0x6e6247, { x: t[0], y: t[1] - 0.05, z: t[2], rx: Math.PI, seed: 1720 + i }),
      part(new IcosahedronGeometry(0.42, 0), 0x4f6b35, 0x86a152, { x: t[0], y: t[1] + 0.28, z: t[2], sy: 1.1, lump: 0.4, seed: 1730 + i }),
    ]),
  ]);
}

// Ocotillo (desert): a fan of long, thin, whippy stems from one root,
// tipped with red flowers.
function ocotillo() {
  const rand = mulberry32(1801);
  const parts = [];
  for (let k = 0; k < 11; k++) {
    const a = rand() * Math.PI * 2;
    const tilt = 0.12 + rand() * 0.38;
    const len = 3.0 + rand() * 1.6;
    const tip = [Math.cos(a) * Math.sin(tilt) * len, Math.cos(tilt) * len, Math.sin(a) * Math.sin(tilt) * len];
    parts.push(limb([Math.cos(a) * 0.08, 0, Math.sin(a) * 0.08], tip, 0.055, 0.025, 0x5b5a3e, 0x7a8249, 1810 + k));
    parts.push(part(new ConeGeometry(0.07, 0.35, 4, 1), 0xc8402a, 0xe0603a, { x: tip[0], y: tip[1] + 0.15, z: tip[2], seed: 1830 + k }));
  }
  return mergeGeometries(parts);
}

function deadPine() {
  return mergeGeometries([
    part(new CylinderGeometry(0.1, 0.3, 7, 5), BARK_DEAD, 0x938070, { y: 3.5, seed: 6 }),
    part(new CylinderGeometry(0.04, 0.09, 1.8, 4), BARK_DEAD, BARK_DEAD, { x: 0.6, y: 3.6, rz: -1.0, seed: 7 }),
    part(new CylinderGeometry(0.04, 0.08, 1.4, 4), BARK_DEAD, BARK_DEAD, { x: -0.45, y: 4.8, rz: 0.9, seed: 8 }),
    part(new CylinderGeometry(0.03, 0.07, 1.2, 4), BARK_DEAD, BARK_DEAD, { z: 0.4, y: 2.6, rx: 1.0, seed: 9 }),
  ]);
}

/**
 * Leaf clusters: `count` very flat three-sided pyramids sitting on the crown
 * surface, their tips pointing outwards. Unlike single triangles they never
 * thin out to a sliver when seen edge-on, so they read as chunky low-poly
 * clumps of leaves. `placeOnShape(rand)` returns { p, n, down }: a surface
 * point, its outward normal and a direction pointing down the slope (where
 * one corner hangs). Alpha varies per cluster, so some are nearly solid and
 * others you can see through.
 */
function leaves(count, [minSize, maxSize], palette, placeOnShape, seed) {
  const rand = mulberry32(seed);
  const positions = new Float32Array(count * 36); // 4 faces x 3 corners x xyz
  const normals = new Float32Array(count * 36);
  const colors = new Float32Array(count * 48); // rgba
  const side = new Vector3();
  const a = new Vector3();
  const b = new Vector3();
  const faceNormal = new Vector3();
  const c = new Color();
  const underside = new Color();
  let v = 0;

  function face(p0, p1, p2, outward, col, alpha) {
    a.subVectors(p1, p0);
    b.subVectors(p2, p0);
    faceNormal.crossVectors(a, b).normalize();
    if (faceNormal.dot(outward) < 0) {
      faceNormal.negate();
      [p1, p2] = [p2, p1];
    }
    for (const q of [p0, p1, p2]) {
      positions.set([q.x, q.y, q.z], v * 3);
      normals.set([faceNormal.x, faceNormal.y, faceNormal.z], v * 3);
      colors.set([col.r, col.g, col.b, alpha], v * 4);
      v++;
    }
  }

  for (let i = 0; i < count; i++) {
    const { p, n, down } = placeOnShape(rand);
    const centre = p.clone().addScaledVector(n, -0.05 - rand() * 0.08); // sunk slightly into the crown
    side.crossVectors(n, down).normalize();
    const along = down.clone().addScaledVector(n, (rand() - 0.5) * 0.3).normalize();
    const s = minSize + rand() * (maxSize - minSize);
    const corners = [
      centre.clone().addScaledVector(along, s),
      centre.clone().addScaledVector(side, 0.87 * s).addScaledVector(along, -0.5 * s),
      centre.clone().addScaledVector(side, -0.87 * s).addScaledVector(along, -0.5 * s),
    ];
    const apex = centre.clone().addScaledVector(n, s * (0.25 + rand() * 0.15));

    c.set(palette[Math.floor(rand() * palette.length)]).multiplyScalar(0.92 + rand() * 0.16);
    underside.copy(c).multiplyScalar(0.7);
    const alpha = 0.55 + rand() * 0.4;

    for (let k = 0; k < 3; k++) {
      const q0 = corners[k];
      const q1 = corners[(k + 1) % 3];
      const out = q0.clone().add(q1).multiplyScalar(0.5).sub(centre).addScaledVector(n, 0.5 * s);
      face(q0, q1, apex, out, c, alpha);
    }
    face(corners[0], corners[1], corners[2], n.clone().negate(), underside, alpha);
  }

  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(positions, 3));
  g.setAttribute('normal', new BufferAttribute(normals, 3));
  g.setAttribute('color', new BufferAttribute(colors, 4));
  return g;
}

/**
 * Surface points on a crown mesh: a random face (bigger and more sunward
 * faces more often) and a random point on it, with that face's normal. The
 * leaf clusters are placed right on these, so they sit on the crown.
 */
function onMesh(geometry) {
  const pos = geometry.attributes.position;
  const faces = [];
  let total = 0;
  const a = new Vector3(), b = new Vector3(), c = new Vector3();
  const e1 = new Vector3(), e2 = new Vector3();
  for (let f = 0; f < pos.count; f += 3) {
    a.fromBufferAttribute(pos, f);
    b.fromBufferAttribute(pos, f + 1);
    c.fromBufferAttribute(pos, f + 2);
    const n = new Vector3().crossVectors(e1.subVectors(b, a), e2.subVectors(c, a));
    const area = n.length() / 2;
    n.normalize();
    const weight = area * (0.35 + Math.max(0, n.y));
    faces.push({ a: a.clone(), b: b.clone(), c: c.clone(), n, weight });
    total += weight;
  }
  return (rand) => {
    let pick = rand() * total;
    let face = faces[faces.length - 1];
    for (const f of faces) {
      pick -= f.weight;
      if (pick <= 0) {
        face = f;
        break;
      }
    }
    let u = rand();
    let v = rand();
    if (u + v > 1) {
      u = 1 - u;
      v = 1 - v;
    }
    const p = face.a.clone().addScaledVector(e1.subVectors(face.b, face.a), u).addScaledVector(e2.subVectors(face.c, face.a), v);
    const n = face.n.clone();
    const down = new Vector3(0, -1, 0).addScaledVector(n, n.y);
    if (down.lengthSq() < 1e-4) down.set(1, 0, 0).addScaledVector(n, -n.x);
    down.normalize();
    return { p, n, down };
  };
}

// Fruit and berries: little blocks dotted over the outside of a crown, each
// centred on a quarter-metre grid point (and under 0.25 m across) (so the seasons can grow each one out
// from its middle: see seasonalTrees), in `colours`.
function fruitOn(blobs, count, size, colours, seed, { low = 0.25 } = {}) {
  const rand = mulberry32(seed * 977);
  const out = [], taken = new Set();
  for (let tries = 0; out.length < count && tries < count * 40; tries++) {
    const [bx, by, bz, r, sy = 1] = blobs[Math.floor(rand() * blobs.length)];
    // Round the sides and underneath, where fruit hangs.
    const a = rand() * Math.PI * 2, up = -0.6 + rand() * (0.6 + low * 2);
    const c = Math.sqrt(Math.max(0, 1 - up * up));
    const px = bx + Math.cos(a) * c * r, py = by + up * r * sy, pz = bz + Math.sin(a) * c * r;
    const gx = Math.floor(px * 4), gy = Math.floor(py * 4), gz = Math.floor(pz * 4);
    const key = `${gx},${gy},${gz}`;
    if (taken.has(key)) continue;
    const x = (gx + 0.5) * 0.25, y = (gy + 0.5) * 0.25, z = (gz + 0.5) * 0.25;
    // (Still on the crown's surface once it's snapped to the grid.)
    const d = Math.hypot(x - bx, (y - by) / sy, z - bz) / r;
    if (d < 0.9 || d > 1.08) continue;
    taken.add(key);
    const k = Math.min(0.22, size * (0.8 + 0.4 * rand()));
    const colour = colours[Math.floor(rand() * colours.length)];
    out.push(part(new BoxGeometry(k, k, k), colour, colour, { x, y, z, seed: seed + out.length }));
  }
  return out;
}

// A wild apple tree: a short, crooked trunk and a low, broad, rounded crown;
// white-pink blossom in spring, and apples through late summer into the autumn.
const APPLE_BLOBS = [
  [0, 3.1, 0, 1.7, 0.8],
  [1.3, 2.8, 0.5, 1.2, 0.8],
  [-1.2, 2.9, -0.4, 1.25, 0.8],
  [0.2, 3.9, -0.3, 1.2, 0.8],
];

function appleTree() {
  return withCrown(
    [
      part(new CylinderGeometry(0.18, 0.3, 2.0, 6), TRUNK, 0x6e4c35, { y: 1.0, rz: 0.06, seed: 700 }),
      part(new CylinderGeometry(0.07, 0.12, 1.3, 4), TRUNK, TRUNK, { x: 0.5, y: 2.2, rz: -0.9, seed: 701 }),
      part(new CylinderGeometry(0.07, 0.12, 1.2, 4), TRUNK, TRUNK, { x: -0.45, y: 2.1, rz: 0.85, seed: 702 }),
      ...boughs(APPLE_BLOBS, 1.7, 2.3, TRUNK, 703),
    ],
    APPLE_BLOBS.map(([x, y, z, r, sy], i) =>
      part(new IcosahedronGeometry(r, 0), 0x4c8a38, 0x86bf58, { x, y, z, sy, lump: 0.2, seed: 710 + i }),
    ),
    fruitOn(APPLE_BLOBS, 26, 0.17, [0xc8261c, 0xb01c18, 0xd8402a, 0xd8b030], 720),
  );
}

// Berry bushes: a raspberry thicket (red berries) and blueberry bushes
// (low, in the cold woods), white flowers in spring, berries in late summer.
const BERRY_BLOBS = [
  [0, 0.7, 0, 0.95, 0.75],
  [0.8, 0.55, 0.3, 0.72, 0.75],
  [-0.7, 0.5, -0.35, 0.72, 0.75],
  [0.1, 0.5, -0.8, 0.6, 0.75],
];
const BLUEBERRY_BLOBS = [
  [0, 0.45, 0, 0.8, 0.6],
  [0.7, 0.35, 0.35, 0.6, 0.6],
  [-0.6, 0.35, -0.3, 0.62, 0.6],
];

function berryBush(blobs, low, high, berries, seed) {
  return withCrown(
    blobs.flatMap(([x, y, z, r], i) => [
      limb([x * 0.2, 0, z * 0.2], [x * 1.1, y + r * 0.3, z * 1.1], 0.04, 0.018, 0x5a3e30, 0x6e4a3a, seed + i),
    ]),
    blobs.map(([x, y, z, r, sy], i) => part(new DodecahedronGeometry(r, 0), low, high, { x, y, z, sy, lump: 0.18, seed: seed + 10 + i })),
    fruitOn(blobs, 30, 0.1, berries, seed + 20, { low: 0.5 }),
  );
}
const raspberryBush = () => berryBush(BERRY_BLOBS, 0x3f7a34, 0x74ae50, [0xc01830, 0xa8142a, 0xd82a40], 730);
const blueberryBush = () => berryBush(BLUEBERRY_BLOBS, 0x365f34, 0x5f8c48, [0x3a3a8a, 0x2c2c6e, 0x4a4a9e], 760);

/** Built once and shared by every chunk. */
export const TREE_GEOMETRIES = {
  cypress: cypress(),
  swampWillow: swampWillow(),
  pine: pine(),
  spruce: spruce(),
  broadleaf: broadleaf(),
  birch: birch(),
  poplar: poplar(),
  maple: maple(),
  bush: bush(),
  deadPine: deadPine(),
  acacia: acacia(),
  cactus: cactus(),
  smallCactus: smallCactus(),
  dryBush: dryBush(),
  oak: oak(),
  larch: larch(),
  silverBirch: silverBirch(),
  aspen: aspen(),
  baobab: baobab(),
  joshuaTree: joshuaTree(),
  ocotillo: ocotillo(),
  charredSnag: charredSnag(),
  treeFern: treeFern(),
  weepingWillow: weepingWillow(),
  mangrove: mangrove(),
  jungleGiant: jungleGiant(),
  jungleCanopy: jungleCanopy(),
  junglePalm: junglePalm(),
  bamboo: bamboo(),
  appleTree: appleTree(),
  raspberryBush: raspberryBush(),
  blueberryBush: blueberryBush(),
};

// How each species takes the seasons: [deciduous (leaves turn and fall),
// holds snow, flowers in spring].
// (A deciduous tree's crown shrinks away to nothing in winter, leaving bare boughs.)
const SEASONAL = {
  pine: [0, 1, 0], spruce: [0, 1, 0], deadPine: [0, 1, 0],
  broadleaf: [1, 1, 0], birch: [1, 1, 0], poplar: [1, 1, 0], maple: [1, 1, 0], bush: [1, 1, 1],
  cypress: [1, 1, 0], swampWillow: [1, 1, 0],
  acacia: [0, 0, 0], cactus: [0, 0, 0], smallCactus: [0, 0, 0], dryBush: [0, 0, 0],
  oak: [1, 1, 0], larch: [1, 1, 0], silverBirch: [1, 1, 0], aspen: [1, 1, 0], weepingWillow: [1, 1, 0],
  mangrove: [0, 1, 0], treeFern: [0, 1, 0], charredSnag: [0, 1, 0],
  baobab: [0, 0, 0], joshuaTree: [0, 0, 0], ocotillo: [0, 0, 0],
  jungleGiant: [0, 0, 0], jungleCanopy: [0, 0, 0], junglePalm: [0, 0, 0], bamboo: [0, 0, 0], // (evergreen, and never snowed on)
  appleTree: [1, 1, 1], raspberryBush: [1, 1, 1], blueberryBush: [1, 1, 1],
};
function markSeasons(geometries) {
  for (const [type, full] of Object.entries(geometries)) for (const g of [full, full.userData.lean].filter(Boolean)) {
    const [deciduous, snowy, flowers] = SEASONAL[type] ?? [0, 0, 0];
    const n = g.attributes.position.count;
    const a = new Float32Array(n * 3);
    // The crown of a deciduous tree is its leaves: they turn, and fall in
    // winter; a flowering bush's flowers are on its leaves too.
    const crown = g.attributes.aCrown;
    for (let k = 0; k < n; k++) {
      const leafy = crown ? crown.getX(k) : 1;
      if (leafy > 1.5) {
        a[k * 3 + 2] = 2; // (fruit: grows and ripens with the seasons)
        continue;
      }
      a[k * 3] = deciduous * leafy;
      a[k * 3 + 1] = snowy;
      a[k * 3 + 2] = flowers * leafy;
    }
    g.setAttribute('aSeason', new BufferAttribute(a, 3));
  }
}
markSeasons(TREE_GEOMETRIES);

/**
 * The shape to draw a species with: without the boughs inside its crown
 * while they're hidden in the leaves (always, for an evergreen; for a
 * broad-leaved tree, until its crown falls in winter: `bare`).
 */
export function treeGeometry(type, bare) {
  const g = TREE_GEOMETRIES[type];
  if (!g.userData.lean) return g;
  return bare && SEASONAL[type]?.[0] ? g : g.userData.lean;
}

/** Species that are stiff (cacti): they don't sway in the wind. */
export const STIFF = new Set(['cactus', 'smallCactus', 'joshuaTree', 'baobab']);

/** Species too small to bump into. */
export const NO_COLLIDE = new Set(['bush', 'dryBush', 'smallCactus', 'ocotillo', 'raspberryBush', 'blueberryBush']);

const crown = (type) => onMesh(TREE_GEOMETRIES[type].userData.crown);

export const LEAF_GEOMETRIES = {
  cypress: leaves(40, [0.3, 0.5], [0x4a6a34, 0x5f8040, 0x7f9c52, 0x6a8a44], crown('cypress'), 23),
  swampWillow: leaves(50, [0.3, 0.55], [0x6f9a3e, 0x8fb455, 0x9dbd5a, 0x7aa344], crown('swampWillow'), 24),
  pine: leaves(40, [0.35, 0.6], [0x3f8a4a, 0x4f9c57, 0x5fae62, 0x376f3f], crown('pine'), 11),
  spruce: leaves(40, [0.3, 0.5], [0x2c5e44, 0x3a7050, 0x478260], crown('spruce'), 14),
  broadleaf: leaves(55, [0.45, 0.8], [0x6aac4a, 0x7fbe55, 0x93cc62, 0x5a9a42, 0xa6d26c], crown('broadleaf'), 12),
  birch: leaves(40, [0.3, 0.55], [0x9cc85a, 0xb6d86c, 0x86b84c, 0xcbe07a], crown('birch'), 15),
  poplar: leaves(40, [0.35, 0.6], [0x5a9a42, 0x6fae4c, 0x84c05a], crown('poplar'), 16),
  maple: leaves(55, [0.45, 0.8], [0xe07a2c, 0xf2a33c, 0xc9502a, 0xf5c04a, 0xb33a22], crown('maple'), 17),
  bush: leaves(16, [0.25, 0.45], [0x78b556, 0x8fc663, 0x9fd06d], crown('bush'), 13),
  appleTree: leaves(40, [0.35, 0.6], [0x5a9a42, 0x6fae4c, 0x84c05a, 0x4c8a38], crown('appleTree'), 34),
  raspberryBush: leaves(16, [0.22, 0.4], [0x5f9a44, 0x74ae50, 0x86bc5c], crown('raspberryBush'), 35),
  blueberryBush: leaves(12, [0.2, 0.35], [0x4a7a40, 0x5f8c48, 0x6e9a52], crown('blueberryBush'), 36),
  acacia: leaves(55, [0.4, 0.7], [0x7f9a3c, 0x93aa48, 0xa7b858, 0x6f8a34], crown('acacia'), 18),
  dryBush: leaves(14, [0.25, 0.4], [0xa89d55, 0xbfae62, 0x9a9048], crown('dryBush'), 19),
  oak: leaves(60, [0.45, 0.8], [0x416e31, 0x55853c, 0x679747, 0x4a7a36], crown('oak'), 25),
  larch: leaves(36, [0.3, 0.5], [0x6aa447, 0x80b855, 0x94c862], crown('larch'), 26),
  silverBirch: leaves(44, [0.3, 0.5], [0x8fbf52, 0xa9d063, 0x7aaa46, 0xbfdc72], crown('silverBirch'), 27),
  aspen: leaves(36, [0.3, 0.5], [0x8cc052, 0xa6d064, 0x78ad48], crown('aspen'), 28),
  baobab: leaves(24, [0.35, 0.6], [0x6f8c3a, 0x86a048, 0x9bb458], crown('baobab'), 29),
  weepingWillow: leaves(60, [0.3, 0.55], [0x86ab48, 0x9dbd5a, 0xb0cc6c, 0x78a042], crown('weepingWillow'), 30),
  mangrove: leaves(50, [0.35, 0.6], [0x3a6a33, 0x4d7d3e, 0x5f8f48], crown('mangrove'), 31),
  jungleGiant: leaves(70, [0.6, 1.0], [0x2f6b2a, 0x3f7d33, 0x4f8f3c, 0x5a9a3a], crown('jungleGiant'), 32),
  jungleCanopy: leaves(60, [0.5, 0.9], [0x2a5e27, 0x3a7431, 0x4a863a, 0x55923c], crown('jungleCanopy'), 33),
};
markSeasons(LEAF_GEOMETRIES);
