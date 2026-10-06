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

// Sea fan: a thin, flat, round-topped fan on a short stalk.
function fan() {
  const blade = new CylinderGeometry(0.45, 0.45, 0.04, 7, 1, false, 0, Math.PI);
  blade.rotateX(Math.PI / 2);
  blade.translate(0, 0.15, 0);
  return mergeGeometries([shaped(blade), shaped(new CylinderGeometry(0.03, 0.05, 0.2, 4).translate(0, 0.1, 0))]);
}

const CORAL_COLORS = [0xe0708a, 0xe89a4a, 0x9a6ab8, 0x4fb3a0, 0xe6cf5a, 0xd9566a, 0xf0a8b8].map((c) => new Color(c));

const matrix = new Matrix4();
const position = new Vector3();
const rotation = new Quaternion();
const scale = new Vector3();
const up = new Vector3(0, 1, 0);

/**
 * Corals on the reefs in the warm shallows (see TerrainGenerator.getReef):
 * branching clumps, brain corals and sea fans in bright colours, seen
 * through the clear water, on the chunks near you.
 */
export function createCoralLayer(config) {
  const shapes = [branching(7), branching(19), brain(), fan()];
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
