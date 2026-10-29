import { Color, ConeGeometry, CylinderGeometry, DodecahedronGeometry, DoubleSide, Group, InstancedMesh, Matrix4, MeshLambertMaterial, Quaternion, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../../noise/random.js';
import { CORAL_KINDS, placeCorals } from '../decorPlacement.js';

/** A coral shape, white (each coral is tinted by its instance colour), base at y = 0. */
function shaped(geometry) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  return g;
}

// Cauliflower coral: a dome crowded with knobs, each a little lump, the
// whole clump wider than it's high.
function knobs(seed, n, radius, flat) {
  const rand = mulberry32(seed);
  const parts = [];
  const core = new DodecahedronGeometry(radius * 0.8, 0);
  core.scale(1, flat, 1);
  parts.push(shaped(core));
  for (let k = 0; k < n; k++) {
    // (Spread over the dome, more of them up top.)
    const a = rand() * Math.PI * 2, up = Math.acos(1 - rand() * 0.95);
    const r = radius * (0.12 + rand() * 0.1);
    const g = new DodecahedronGeometry(r, 0);
    g.scale(1, 1.15, 1);
    g.rotateY(rand() * Math.PI);
    g.translate(Math.sin(up) * Math.cos(a) * radius * 0.85, Math.cos(up) * radius * flat * 0.95, Math.sin(up) * Math.sin(a) * radius * 0.85);
    parts.push(shaped(g));
  }
  return mergeGeometries(parts);
}

// Finger coral: a thicket of stubby round-tipped fingers, all reaching up.
function fingers(seed, count = 14) {
  const rand = mulberry32(seed);
  const parts = [];
  for (let k = 0; k < count; k++) {
    const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * 0.4, len = 0.3 + rand() * 0.45, lean = rand() * 0.35;
    const g = new CylinderGeometry(0.05, 0.065, len, 5);
    g.translate(0, len / 2, 0);
    const tip = new DodecahedronGeometry(0.065, 0);
    tip.translate(0, len, 0);
    for (const p of [g, tip]) {
      p.rotateZ(lean);
      p.rotateY(a);
      p.translate(Math.cos(a) * d, 0, Math.sin(a) * d);
      parts.push(shaped(p));
    }
  }
  return mergeGeometries(parts);
}

// Staghorn: thin antler-like branches, forking as they reach up and out.
function staghorn(seed, count = 9) {
  const rand = mulberry32(seed);
  const parts = [];
  for (let k = 0; k < count; k++) {
    const a = rand() * Math.PI * 2, lean = 0.3 + rand() * 0.5, len = 0.5 + rand() * 0.45;
    const g = new CylinderGeometry(0.03, 0.05, len, 4);
    g.translate(0, len / 2, 0);
    g.rotateZ(lean);
    g.rotateY(a);
    parts.push(shaped(g));
    for (const side of [-1, 1]) {
      // (A fork either side, on up the branch.)
      const at = 0.45 + rand() * 0.3, tx = Math.sin(lean) * len * at, ty = Math.cos(lean) * len * at, len2 = len * (0.35 + rand() * 0.2);
      const f = new CylinderGeometry(0.02, 0.03, len2, 4);
      f.translate(0, len2 / 2, 0);
      f.rotateZ(lean - side * 0.55);
      f.translate(-tx, ty, 0);
      f.rotateY(a + side * 0.4);
      parts.push(shaped(f));
    }
  }
  return mergeGeometries(parts);
}

// A table coral: a broad flat plate, tiered, held up on a short thick stalk.
function table() {
  const plate = new CylinderGeometry(0.8, 0.72, 0.07, 11);
  plate.translate(0, 0.46, 0);
  const rim = new CylinderGeometry(0.55, 0.5, 0.06, 9);
  rim.translate(0.15, 0.53, -0.1);
  const stalk = new CylinderGeometry(0.1, 0.18, 0.46, 6);
  stalk.translate(0, 0.23, 0);
  return mergeGeometries([shaped(plate), shaped(rim), shaped(stalk)]);
}

// Brain coral: a round dome (its grooves are in the knobbly facets).
function brain(detail = 1) {
  const g = new DodecahedronGeometry(0.5, detail);
  const p = g.attributes.position;
  for (let k = 0; k < p.count; k++) p.setY(k, Math.max(-0.06, p.getY(k)) * 0.7);
  return shaped(g);
}

// Lettuce coral: thin upright curling plates, crowded together like leaves.
function lettuce(seed, count = 9) {
  const rand = mulberry32(seed);
  const parts = [];
  for (let k = 0; k < count; k++) {
    const r = 0.12 + rand() * 0.18, h = 0.2 + rand() * 0.25, arc = 1.5 + rand() * 2;
    const g = new CylinderGeometry(r * 1.3, r * 0.7, h, 6, 1, true, rand() * Math.PI * 2, arc);
    g.translate((rand() - 0.5) * 0.6, h / 2, (rand() - 0.5) * 0.6);
    parts.push(shaped(g));
  }
  return mergeGeometries(parts);
}

// Sea fan: thin flat round fans side by side on short stalks.
function fan() {
  const parts = [];
  for (const [x, s, t] of [[0, 1, 0], [0.18, 0.7, 0.3], [-0.16, 0.6, -0.25]]) {
    const blade = new CylinderGeometry(0.5 * s, 0.5 * s, 0.03, 9, 1, false, -Math.PI / 2, Math.PI);
    blade.rotateX(Math.PI / 2);
    blade.rotateZ(Math.PI / 2);
    blade.translate(0, 0.12, 0);
    blade.rotateZ(t);
    blade.rotateY(t * 0.6);
    blade.translate(x, 0, 0);
    parts.push(shaped(blade));
  }
  parts.push(shaped(new CylinderGeometry(0.03, 0.06, 0.16, 4).translate(0, 0.08, 0)));
  return mergeGeometries(parts);
}

// Tube sponges: a few hollow tubes standing open-topped.
function sponge(seed, count = 5) {
  const rand = mulberry32(seed);
  const parts = [];
  for (let k = 0; k < count; k++) {
    const r = 0.07 + rand() * 0.07, h = 0.35 + rand() * 0.55, a = rand() * Math.PI * 2, d = rand() * 0.22;
    const g = new CylinderGeometry(r * 1.15, r, h, 6, 1, true);
    g.translate(0, h / 2, 0);
    g.rotateZ((rand() - 0.5) * 0.3);
    g.translate(Math.cos(a) * d, 0, Math.sin(a) * d);
    parts.push(shaped(g));
  }
  return mergeGeometries(parts);
}

// Soft coral: a bushy clump of soft lobes on stems.
function soft(seed, count = 7) {
  const rand = mulberry32(seed);
  const parts = [];
  for (let k = 0; k < count; k++) {
    const a = rand() * Math.PI * 2, lean = 0.1 + rand() * 0.6, len = 0.25 + rand() * 0.3;
    const stem = new ConeGeometry(0.06, len, 4);
    stem.translate(0, len / 2, 0);
    const lobe = new DodecahedronGeometry(0.1 + rand() * 0.06, 0);
    lobe.translate(0, len, 0);
    for (const g of [stem, lobe]) {
      g.rotateZ(lean);
      g.rotateY(a);
      parts.push(shaped(g));
    }
  }
  return mergeGeometries(parts);
}

// The colours of each kind, as a living reef shows them in clear water:
// pink and cream cauliflowers, purple-tipped staghorn, yellow-green
// lettuce plates, orange and purple fans and sponges.
const PALETTES = {
  knobs: [0xd8508a, 0xe07a90, 0xe8dcc0, 0xc86070, 0x9a7048],
  knobsBig: [0xc8a070, 0xe8dcc0, 0xd88a5a, 0xb07a90, 0x8a9a58],
  fingers: [0xe8c890, 0xd87aa0, 0xb0a0d0, 0xc8a070, 0x88b8a0],
  staghorn: [0xd8c8a8, 0x9a8ac8, 0x6aa0c8, 0xc89070, 0xe0b8c8],
  table: [0x8aa070, 0xc8a878, 0x7a9ab0, 0xd8a890],
  brain: [0xb0b060, 0xc89a60, 0x8aa868, 0xd8b890, 0x9a7a50],
  lettuce: [0xa8b848, 0x98c050, 0xc0c060, 0x88a040],
  fan: [0x9a50a0, 0xd87040, 0xd8b040, 0xc04060],
  sponge: [0xd8703a, 0x7a4a8a, 0xd8b040, 0x9a5a7a],
  soft: [0xe0a0c0, 0xc0d0a0, 0xd8d0b8, 0xa070b0],
};

const matrix = new Matrix4();
const position = new Vector3();
const rotation = new Quaternion();
const lean = new Quaternion();
const scale = new Vector3();
const up = new Vector3(0, 1, 0);
const normal = new Vector3();

/**
 * Corals on the reefs in the warm shallows (see TerrainGenerator.getReef):
 * crowded patches of cauliflower and finger corals, staghorn thickets,
 * table plates, brain domes and lettuce corals on the reef tops and walls,
 * and here and there fans, sponges and soft corals on the rocky sea floor,
 * on the chunks near you.
 */
export function createCoralLayer(config) {
  const shapes = [knobs(3, 14, 0.42, 0.7), knobs(17, 22, 0.75, 0.55), fingers(7), staghorn(5), table(), brain(), lettuce(11), fan(), sponge(13), soft(19)];
  // (And plainer ones, the same outline with fewer knobs and branches, for
  // the chunks further off, a hundred metres and more away through the
  // water, where the difference can't be seen: a great many fewer
  // triangles to draw.)
  const plain = [knobs(3, 3, 0.42, 0.7), knobs(17, 4, 0.75, 0.55), fingers(7, 4), staghorn(5, 3), table(), brain(0), lettuce(11, 3), fan(), sponge(13, 2), soft(19, 2)];
  if (shapes.length !== CORAL_KINDS.length) throw new Error('coral shapes and kinds differ');
  const palettes = CORAL_KINDS.map((k) => PALETTES[k].map((c) => new Color(c)));
  const material = new MeshLambertMaterial({ vertexColors: false, side: DoubleSide });

  return {
    name: 'corals',
    material,

    reuseKey: ({ lod }) => (lod > 1 ? 'none' : lod === 1 ? 'far' : 'near'),

    build({ cx, cz, lod, heights, generator, groundHeightAt, prepared }) {
      if (lod > 1) return null;
      // (Where they go: worked out by a chunk worker; here only if it wasn't.)
      const data = prepared && prepared.corals !== undefined ? prepared.corals : placeCorals(generator, config, cx, cz, groundHeightAt, heights.gridY);
      if (!data) return null;
      const placed = shapes.map(() => []);
      for (let k = 0; k < data.length; k += 10) {
        const kind = data[k], s = data[k + 5], pal = palettes[kind];
        position.set(data[k + 1], data[k + 2], data[k + 3]);
        // (Leaning out from a reef wall, halfway to square with it.)
        normal.set(data[k + 8] * 0.5, 1, data[k + 9] * 0.5).normalize();
        lean.setFromUnitVectors(up, normal);
        rotation.setFromAxisAngle(up, data[k + 4] * Math.PI * 2).premultiply(lean);
        scale.set(s, s * data[k + 6], s);
        placed[kind].push([matrix.compose(position, rotation, scale).clone(), pal[Math.min(pal.length - 1, Math.floor(data[k + 7] * pal.length))]]);
      }
      if (!placed.some((l) => l.length)) return null;
      const group = new Group();
      group.name = 'corals';
      placed.forEach((list, k) => {
        if (!list.length) return;
        const mesh = new InstancedMesh((lod === 0 ? shapes : plain)[k], material, list.length);
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
