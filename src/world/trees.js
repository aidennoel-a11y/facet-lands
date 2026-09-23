import {
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  IcosahedronGeometry,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../noise/random.js';

// Low-poly tree models. Each species is one merged geometry with its colours
// baked into vertex colours, so a whole forest of a species is a single
// instanced draw call per chunk. Sizes are in metres, base at y = 0.
//
// Each leafy species also has a "leaf" geometry: loose single triangles
// floating just outside the crown, drawn semi-transparent on top of the
// solid shape. They soften the silhouette and cast dappled shadows.

const TRUNK = 0x6e4c35;
const BARK_DEAD = 0x7c6655;

/** Give a geometry a flat colour, flat normals and no uvs so parts merge cleanly. */
function part(geometry, hex, { x = 0, y = 0, z = 0, rx = 0, rz = 0, sy = 1 } = {}) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  g.deleteAttribute('uv');
  g.scale(1, sy, 1);
  if (rx) g.rotateX(rx);
  if (rz) g.rotateZ(rz);
  g.translate(x, y, z);
  g.computeVertexNormals();
  const c = new Color(hex); // converts sRGB hex to the linear working space
  const count = g.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) colors.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new BufferAttribute(colors, 3));
  return g;
}

function pine() {
  return mergeGeometries([
    part(new CylinderGeometry(0.22, 0.34, 2.2, 5), TRUNK, { y: 1.1 }),
    part(new ConeGeometry(2.3, 3.6, 7), 0x3d7a45, { y: 3.4 }),
    part(new ConeGeometry(1.8, 3.1, 7), 0x43864b, { y: 5.1 }),
    part(new ConeGeometry(1.2, 2.7, 7), 0x4b9352, { y: 6.8 }),
  ]);
}

function broadleaf() {
  return mergeGeometries([
    part(new CylinderGeometry(0.25, 0.38, 2.8, 5), TRUNK, { y: 1.4 }),
    part(new IcosahedronGeometry(2.3, 0), 0x5e9e45, { y: 4.1, sy: 0.9 }),
    part(new IcosahedronGeometry(1.5, 0), 0x6bab4c, { x: 0.9, y: 5.2, z: -0.4 }),
  ]);
}

function bush() {
  return mergeGeometries([
    part(new DodecahedronGeometry(1.1, 0), 0x6aa84f, { y: 0.6, sy: 0.75 }),
    part(new DodecahedronGeometry(0.75, 0), 0x78b556, { x: 0.8, y: 0.5, z: 0.3, sy: 0.75 }),
  ]);
}

function deadPine() {
  return mergeGeometries([
    part(new CylinderGeometry(0.1, 0.3, 7, 5), BARK_DEAD, { y: 3.5 }),
    part(new CylinderGeometry(0.04, 0.09, 1.8, 4), BARK_DEAD, { x: 0.6, y: 3.6, rz: -1.0 }),
    part(new CylinderGeometry(0.04, 0.08, 1.4, 4), BARK_DEAD, { x: -0.45, y: 4.8, rz: 0.9 }),
    part(new CylinderGeometry(0.03, 0.07, 1.2, 4), BARK_DEAD, { z: 0.4, y: 2.6, rx: 1.0 }),
  ]);
}

/**
 * Loose leaf triangles. `placeOnShape(rand)` returns [x, y, z, nx, ny, nz]:
 * a point on the crown and the outward direction there.
 */
function leaves(count, size, colors, placeOnShape, seed) {
  const rand = mulberry32(seed);
  const positions = new Float32Array(count * 9);
  const normals = new Float32Array(count * 9);
  const cols = new Float32Array(count * 9);
  const c = new Color();
  for (let i = 0; i < count; i++) {
    const [px, py, pz, nx, ny, nz] = placeOnShape(rand);
    const out = 0.15 + rand() * 0.35; // float a little off the surface
    const cx = px + nx * out;
    const cy = py + ny * out;
    const cz = pz + nz * out;
    const s = size * (0.7 + rand() * 0.6);
    const spin = rand() * Math.PI * 2;
    for (let v = 0; v < 3; v++) {
      const a = spin + (v * Math.PI * 2) / 3;
      // A tilted triangle: corners spread sideways and a little up/down.
      positions.set([cx + Math.cos(a) * s, cy + (rand() - 0.5) * s * 0.9, cz + Math.sin(a) * s], i * 9 + v * 3);
      normals.set([nx, ny, nz], i * 9 + v * 3);
    }
    c.set(colors[Math.floor(rand() * colors.length)]);
    for (let v = 0; v < 3; v++) cols.set([c.r, c.g, c.b], i * 9 + v * 3);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(positions, 3));
  g.setAttribute('normal', new BufferAttribute(normals, 3));
  g.setAttribute('color', new BufferAttribute(cols, 3));
  return g;
}

/** Point on an ellipsoid crown centred at (0, cy, 0). */
function onBlob(cy, rx, ry, jitter = 0) {
  return (rand) => {
    const u = rand() * 2 - 1;
    const phi = rand() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    const nx = r * Math.cos(phi);
    const ny = u * 0.8 + 0.2;
    const nz = r * Math.sin(phi);
    const ox = (rand() - 0.5) * jitter;
    const oz = (rand() - 0.5) * jitter;
    return [nx * rx + ox, cy + u * ry, nz * rx + oz, nx, ny, nz];
  };
}

/** Point on one of a pine's stacked cones: [radius, height, centreY]. */
function onCones(cones) {
  return (rand) => {
    const [radius, height, centreY] = cones[Math.floor(rand() * cones.length)];
    const f = Math.pow(rand(), 0.7); // more near the wide skirt of each tier
    const phi = rand() * Math.PI * 2;
    const r = radius * f;
    const y = centreY + height / 2 - height * f;
    return [Math.cos(phi) * r, y, Math.sin(phi) * r, Math.cos(phi), 0.45, Math.sin(phi)];
  };
}

/** Built once and shared by every chunk. */
export const TREE_GEOMETRIES = {
  pine: pine(),
  broadleaf: broadleaf(),
  bush: bush(),
  deadPine: deadPine(),
};

export const LEAF_GEOMETRIES = {
  pine: leaves(46, 0.55, [0x5aa35c, 0x4c9152, 0x6db36a], onCones([[2.3, 3.6, 3.4], [1.8, 3.1, 5.1], [1.2, 2.7, 6.8]]), 11),
  broadleaf: leaves(70, 0.6, [0x7dbb52, 0x8cc95c, 0x6aa84a, 0xa2cf66], onBlob(4.4, 2.4, 1.9, 1.0), 12),
  bush: leaves(18, 0.4, [0x86c05c, 0x9ccf6a], onBlob(0.6, 1.2, 0.6), 13),
};
