import {
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  IcosahedronGeometry,
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
  const { x = 0, y = 0, z = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1, lump = 0, seed = 1, speckle = null } = options;
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
    // Optional random faces in a second colour (birch bark markings).
    if (speckle && rand() < speckle[1]) tmp.set(speckle[0]);
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
function withCrown(wood, crown) {
  const solid = mergeGeometries([...wood, ...crown]);
  solid.userData.crown = mergeGeometries(crown);
  return solid;
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

// Birch: slim white trunk with dark markings, small airy yellow-green crown.
const BIRCH_BLOBS = [
  [0, 5.6, 0, 1.35],
  [0.7, 6.6, 0.3, 1.05],
  [-0.6, 6.3, -0.4, 1.1],
  [0.1, 7.5, 0, 0.9],
];

function birch() {
  return withCrown(
    [
      part(new CylinderGeometry(0.12, 0.2, 6.4, 6, 4), 0xe9e5da, 0xf4f1ea, { y: 3.2, seed: 60, speckle: [0x38322c, 0.28] }),
      part(new CylinderGeometry(0.04, 0.07, 1.3, 4), 0xe9e5da, 0xe9e5da, { x: 0.35, y: 4.6, rz: -0.9, seed: 61 }),
    ],
    BIRCH_BLOBS.map(([x, y, z, r], i) =>
      part(new IcosahedronGeometry(r, 0), 0x6f9e3c, 0xb3d56a, { x, y, z, sy: 0.9, lump: 0.22, seed: 62 + i }),
    ),
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
    [part(new CylinderGeometry(0.16, 0.3, 3.0, 6), TRUNK, 0x7d5a40, { y: 1.5, seed: 70 })],
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
    [],
    BUSH_BLOBS.map(([x, y, z, r], i) =>
      part(new DodecahedronGeometry(r, 0), 0x4f8c3d, 0x86c05c, { x, y, z, sy: 0.72, lump: 0.18, seed: 40 + i }),
    ),
  );
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

/** Built once and shared by every chunk. */
export const TREE_GEOMETRIES = {
  pine: pine(),
  spruce: spruce(),
  broadleaf: broadleaf(),
  birch: birch(),
  poplar: poplar(),
  maple: maple(),
  bush: bush(),
  deadPine: deadPine(),
};

const crown = (type) => onMesh(TREE_GEOMETRIES[type].userData.crown);

export const LEAF_GEOMETRIES = {
  pine: leaves(40, [0.35, 0.6], [0x3f8a4a, 0x4f9c57, 0x5fae62, 0x376f3f], crown('pine'), 11),
  spruce: leaves(40, [0.3, 0.5], [0x2c5e44, 0x3a7050, 0x478260], crown('spruce'), 14),
  broadleaf: leaves(55, [0.45, 0.8], [0x6aac4a, 0x7fbe55, 0x93cc62, 0x5a9a42, 0xa6d26c], crown('broadleaf'), 12),
  birch: leaves(40, [0.3, 0.55], [0x9cc85a, 0xb6d86c, 0x86b84c, 0xcbe07a], crown('birch'), 15),
  poplar: leaves(40, [0.35, 0.6], [0x5a9a42, 0x6fae4c, 0x84c05a], crown('poplar'), 16),
  maple: leaves(55, [0.45, 0.8], [0xe07a2c, 0xf2a33c, 0xc9502a, 0xf5c04a, 0xb33a22], crown('maple'), 17),
  bush: leaves(16, [0.25, 0.45], [0x78b556, 0x8fc663, 0x9fd06d], crown('bush'), 13),
};
