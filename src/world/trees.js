import {
  BufferAttribute,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  IcosahedronGeometry,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Low-poly tree models. Each species is one merged geometry with its colours
// baked into vertex colours, so a whole forest of a species is a single
// instanced draw call per chunk. Sizes are in metres, base at y = 0.

const TRUNK = 0x6e4c35;
const BARK_DEAD = 0x7c6655;

/** Give a geometry a flat colour, flat normals and no uvs so parts merge cleanly. */
function part(geometry, hex, { x = 0, y = 0, z = 0, rx = 0, rz = 0, sy = 1 } = {}) {
  const g = geometry.toNonIndexed();
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

/** Built once and shared by every chunk. */
export const TREE_GEOMETRIES = {
  pine: pine(),
  broadleaf: broadleaf(),
  bush: bush(),
  deadPine: deadPine(),
};
