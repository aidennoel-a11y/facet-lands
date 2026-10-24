import { Color, ConeGeometry, CylinderGeometry, DodecahedronGeometry, Group, InstancedMesh, Matrix4, MeshLambertMaterial, Quaternion, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { hash2, mulberry32 } from '../../noise/random.js';
import { placeCorals } from '../decorPlacement.js';

/** A coral shape, white (each coral is tinted by its instance colour), base at y = 0. */
function shaped(geometry) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  return g;
}

// Branching coral: a clump of stubby, tapering fingers.
function branching(seed) {
  const rand = mulberry32(seed);
  const parts = [];
  for (let k = 0; k < 7; k++) {
    const a = rand() * Math.PI * 2, lean = 0.2 + rand() * 0.5, len = 0.5 + rand() * 0.6;
    const g = new ConeGeometry(0.09, len, 4, 1);
    g.translate(0, len / 2, 0);
    g.rotateZ(lean);
    g.rotateY(a);
    g.translate(Math.cos(a) * 0.12, 0, Math.sin(a) * 0.12);
    parts.push(shaped(g));
  }
  return mergeGeometries(parts);
}

// Brain coral: a squat, lumpy dome.
function brain() {
  const g = new DodecahedronGeometry(0.5, 0);
  g.scale(1, 0.55, 1);
  return shaped(g);
}

// A massive (boulder) coral: the great builders of a reef, a broad lumpy
// mound, slow-growing, wider than it's high.
function boulder(seed) {
  const rand = mulberry32(seed);
  const g = new DodecahedronGeometry(0.6, 1);
  const p = g.attributes.position;
  for (let k = 0; k < p.count; k++) {
    const y = p.getY(k), j = 0.88 + rand() * 0.24;
    p.setXYZ(k, p.getX(k) * j, Math.max(-0.05, y) * 0.62 * j, p.getZ(k) * j);
  }
  return shaped(g);
}

// Staghorn: thin antler-like branches, forking as they reach up and out.
function staghorn(seed) {
  const rand = mulberry32(seed);
  const parts = [];
  for (let k = 0; k < 6; k++) {
    const a = rand() * Math.PI * 2, lean = 0.3 + rand() * 0.5, len = 0.45 + rand() * 0.4;
    const g = new CylinderGeometry(0.025, 0.045, len, 4);
    g.translate(0, len / 2, 0);
    g.rotateZ(lean);
    g.rotateY(a);
    parts.push(shaped(g));
    // (A fork near its tip.)
    const tx = Math.sin(lean) * len, ty = Math.cos(lean) * len, len2 = len * 0.45;
    const f = new CylinderGeometry(0.018, 0.026, len2, 4);
    f.translate(0, len2 / 2, 0);
    f.rotateZ(lean - 0.6);
    f.translate(tx * 0.7, ty * 0.7, 0);
    f.rotateY(a);
    parts.push(shaped(f));
  }
  return mergeGeometries(parts);
}

// A table coral: a broad flat plate held up on a short thick stalk.
function table() {
  const plate = new CylinderGeometry(0.75, 0.68, 0.08, 9);
  plate.translate(0, 0.42, 0);
  const stalk = new CylinderGeometry(0.1, 0.16, 0.42, 5);
  stalk.translate(0, 0.21, 0);
  return mergeGeometries([shaped(plate), shaped(stalk)]);
}

// Sea fan: a thin, flat, round-topped fan on a short stalk.
function fan() {
  const blade = new CylinderGeometry(0.45, 0.45, 0.04, 7, 1, false, 0, Math.PI);
  blade.rotateX(Math.PI / 2);
  blade.translate(0, 0.15, 0);
  return mergeGeometries([shaped(blade), shaped(new CylinderGeometry(0.03, 0.05, 0.2, 4).translate(0, 0.1, 0))]);
}

// A real reef's colours: mostly the browns, golden tans and olives of the
// algae living in the coral (and dulled further by the water over them),
// only here and there a muted purple, a dusky blue tip, a soft pink.
// (Repeats weight the pick: see placeCorals, an even pick of these.)
const CORAL_COLORS = [
  0x8a6a42, 0x8a6a42, 0x9c7c4e, 0x9c7c4e, 0x7a5a3a, 0x6e6a3e, 0x6e6a3e, 0xa08a5a, 0x6a7048, 0xb09a74, 0x84744c, 0x5e5034,
  0x7a5a72, 0x6a7a92, 0xa8706a,
].map((c) => new Color(c));

const matrix = new Matrix4();
const position = new Vector3();
const rotation = new Quaternion();
const scale = new Vector3();
const up = new Vector3(0, 1, 0);

/**
 * Corals on the reefs in the warm shallows (see TerrainGenerator.getReef):
 * great mounds of boulder coral, brain corals, staghorn and finger corals,
 * plates of table coral and sea fans, in a real reef's browns, tans and
 * olives with a little colour here and there, on the chunks near you.
 */
export function createCoralLayer(config) {
  // (Repeats weight the pick: mostly the massive mounds, then branching and plate corals.)
  const shapes = [boulder(3), boulder(11), boulder(29), brain(), staghorn(5), staghorn(23), branching(7), table(), fan()];
  const material = new MeshLambertMaterial({ vertexColors: false });

  return {
    name: 'corals',
    material,

    reuseKey: ({ lod }) => (lod > 1 ? 'none' : 'near'),

    build({ cx, cz, lod, heights, generator, groundHeightAt, prepared }) {
      if (lod > 1) return null;
      // (Where they go: worked out by a chunk worker; here only if it wasn't.)
      const data = prepared && prepared.corals !== undefined ? prepared.corals : placeCorals(generator, config, cx, cz, groundHeightAt, heights.gridY, shapes.length, CORAL_COLORS.length);
      if (!data) return null;
      const placed = shapes.map(() => []);
      for (let k = 0; k < data.length; k += 8) {
        const s = data[k + 5];
        position.set(data[k + 1], data[k + 2], data[k + 3]);
        rotation.setFromAxisAngle(up, data[k + 4] * Math.PI * 2);
        scale.set(s, s * data[k + 6], s);
        placed[data[k]].push([matrix.compose(position, rotation, scale).clone(), CORAL_COLORS[data[k + 7]]]);
      }
      if (!placed.some((l) => l.length)) return null;
      const group = new Group();
      group.name = 'corals';
      placed.forEach((list, k) => {
        if (!list.length) return;
        const mesh = new InstancedMesh(shapes[k], material, list.length);
        list.forEach(([m, c], n) => {
          mesh.setMatrixAt(n, m);
          mesh.setColorAt(n, c);
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
