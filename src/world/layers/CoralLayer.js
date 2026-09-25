import { Color, ConeGeometry, CylinderGeometry, DodecahedronGeometry, Group, InstancedMesh, Matrix4, MeshLambertMaterial, Quaternion, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { hash2, mulberry32 } from '../../noise/random.js';

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

    build({ cx, cz, lod, heights, generator }) {
      if (lod > 1) return null;
      const size = config.chunkSize;
      const sea = config.seaLevel;
      let low = Infinity;
      for (const y of heights.gridY) low = Math.min(low, y);
      if (low > sea - 0.6) return null; // no sea here
      const x0 = cx * size, z0 = cz * size;
      const seed = generator.seed ^ 0xc0a2;
      const spacing = 1.8;
      const cells = Math.round(size / spacing);
      const step = size / cells;
      const placed = shapes.map(() => []);
      for (let j = 0; j < cells; j++) {
        for (let i = 0; i < cells; i++) {
          const gi = cx * cells + i, gj = cz * cells + j;
          if (hash2(gi, gj, seed) > 0.55) continue;
          const wx = x0 + (i + hash2(gi, gj, seed + 1)) * step, wz = z0 + (j + hash2(gi, gj, seed + 2)) * step;
          const ground = generator.getHeight(wx, wz);
          const reef = generator.getReef(wx, wz, ground);
          if (hash2(gi, gj, seed + 3) > reef) continue;
          const kind = Math.floor(hash2(gi, gj, seed + 4) * shapes.length);
          const s = 0.7 + hash2(gi, gj, seed + 5) * 1.1;
          position.set(wx - x0, ground - 0.05, wz - z0);
          rotation.setFromAxisAngle(up, hash2(gi, gj, seed + 6) * Math.PI * 2);
          scale.set(s, s * (0.8 + 0.5 * hash2(gi, gj, seed + 7)), s);
          placed[kind].push([matrix.compose(position, rotation, scale).clone(), CORAL_COLORS[Math.floor(hash2(gi, gj, seed + 8) * CORAL_COLORS.length)]]);
        }
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
