import {
  BufferAttribute,
  Color,
  DodecahedronGeometry,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshLambertMaterial,
  Quaternion,
  Euler,
  Vector3,
} from 'three';
import { hash2, mulberry32 } from '../../noise/random.js';

const STONE = [0x8b8696, 0x7d7888, 0x938e9c, 0x736f7e];
const MOSS = new Color(0x6f8f4a);

/**
 * One low-poly rock: a polyhedron with its corners pushed in and out, the
 * bottom flattened so it sits, and per-face colours (grey-violet stone, with
 * moss on some upward faces).
 */
function rockGeometry(seed, base = 'dodeca') {
  const rand = mulberry32(seed);
  const g = base === 'dodeca' ? new DodecahedronGeometry(1, 0) : new IcosahedronGeometry(1, 0); // already non-indexed
  g.deleteAttribute('uv');
  const pos = g.attributes.position;
  const offsets = new Map();
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    if (!offsets.has(key)) offsets.set(key, 0.75 + rand() * 0.5);
    const s = offsets.get(key);
    pos.setXYZ(i, pos.getX(i) * s, Math.max(pos.getY(i) * s, -0.45), pos.getZ(i) * s);
  }
  g.computeVertexNormals();

  const colors = new Float32Array(pos.count * 3);
  const c = new Color();
  const mossy = rand() < 0.5;
  for (let f = 0; f < pos.count; f += 3) {
    c.set(STONE[Math.floor(rand() * STONE.length)]).multiplyScalar(0.9 + rand() * 0.2);
    const ny = g.attributes.normal.getY(f);
    if (mossy && ny > 0.6 && rand() < 0.7) c.lerp(MOSS, 0.55);
    for (let k = 0; k < 3; k++) colors.set([c.r, c.g, c.b], (f + k) * 3);
  }
  g.setAttribute('color', new BufferAttribute(colors, 3));
  return g;
}

export const ROCK_SHAPES = [
  rockGeometry(101, 'dodeca'),
  rockGeometry(202, 'ico'),
  rockGeometry(303, 'dodeca'),
  rockGeometry(404, 'ico'),
  rockGeometry(505, 'dodeca'),
];

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

const matrix = new Matrix4();
const position = new Vector3();
const rotation = new Quaternion();
const euler = new Euler();
const scale = new Vector3();

/**
 * Rocks and boulders scattered over the land: a few everywhere, many more in
 * the foothills where mountains meet lowland; none on cliffs or snow. Small
 * stones only appear on the nearest chunks; boulders are visible further out
 * and block you when walking.
 */
export function createRockLayer(config) {
  const material = new MeshLambertMaterial({ vertexColors: true, flatShading: true });

  const layer = {
    name: 'rocks',
    material,
    boulders: new Map(), // "cx,cz" -> [x, z, radius, ...] for collisions

    collide(pos, radius) {
      const size = config.chunkSize;
      const cx = Math.floor(pos.x / size);
      const cz = Math.floor(pos.z / size);
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const list = layer.boulders.get(`${cx + dx},${cz + dz}`);
          if (!list) continue;
          for (let k = 0; k < list.length; k += 3) {
            const ox = pos.x - list[k];
            const oz = pos.z - list[k + 1];
            const min = radius + list[k + 2];
            const d2 = ox * ox + oz * oz;
            if (d2 >= min * min || d2 === 0) continue;
            const d = Math.sqrt(d2);
            pos.x += (ox / d) * (min - d);
            pos.z += (oz / d) * (min - d);
          }
        }
      }
    },

    build({ cx, cz, lod, groundHeightAt, generator }) {
      if (lod > config.rockMaxLod) return null;
      const { chunkSize, seaLevel } = config;
      const spacing = 5;
      const cells = Math.round(chunkSize / spacing);
      const step = chunkSize / cells;
      const x0 = cx * chunkSize;
      const z0 = cz * chunkSize;
      const seed = generator.seed ^ 0x3c6ef372;
      const { snowLine } = generator.getBiome(x0 + chunkSize / 2, z0 + chunkSize / 2);
      const smallStones = lod <= config.rockMaxLod - 1;

      const placed = ROCK_SHAPES.map(() => []);
      const boulders = [];
      for (let j = 0; j < cells; j++) {
        for (let i = 0; i < cells; i++) {
          const gi = cx * cells + i;
          const gj = cz * cells + j;
          const lx = (i + hash2(gi, gj, seed + 1)) * step;
          const lz = (j + hash2(gi, gj, seed + 2)) * step;
          const wx = x0 + lx;
          const wz = z0 + lz;

          // Foothills (partly mountainous) get the most rocks. Steep faces
          // get none (they'd hang off the slope), nor do snow caps.
          const m = generator.getMountainness(wx, wz);
          const foothill = Math.max(0, 1 - Math.abs(m - 0.45) / 0.35);
          const chance = 0.025 + 0.26 * foothill;
          if (hash2(gi, gj, seed) > chance) continue;
          const gx = (generator.getHeight(wx + 2, wz) - generator.getHeight(wx - 2, wz)) / 4;
          const gz = (generator.getHeight(wx, wz + 2) - generator.getHeight(wx, wz - 2)) / 4;
          const slope = Math.hypot(gx, gz);
          if (slope > 0.7) continue;

          const ground = groundHeightAt(lx, lz);
          if (!(ground > seaLevel - 0.6)) continue; // off-chunk, deep water or a cave mouth
          if (ground + generator.getColorJitter(wx, wz) > snowLine - 15) continue; // snow

          const r = hash2(gi, gj, seed + 3);
          const boulder = r < 0.1 + 0.15 * foothill;
          if (!boulder && !smallStones) continue;
          if (generator.caves.field.nearEntrance(wx, wz, 1.5)) continue; // keep cave entrances clear
          if (generator.rivers.at(wx, wz, 1)) continue; // and rivers
          const size = boulder ? 1.3 + hash2(gi, gj, seed + 4) * (1.6 + 1.6 * foothill) : 0.25 + hash2(gi, gj, seed + 4) * 0.6;
          const sx = size * (0.8 + hash2(gi, gj, seed + 5) * 0.5);
          const sy = size * (0.55 + hash2(gi, gj, seed + 6) * 0.45);
          const sz = size * (0.8 + hash2(gi, gj, seed + 7) * 0.5);

          // Sunk deeper on a slope, so the uphill side doesn't float.
          position.set(lx, ground - sy * (0.3 + 0.5 * slope) - slope * Math.max(sx, sz) * 0.4, lz);
          euler.set((hash2(gi, gj, seed + 8) - 0.5) * 0.5, hash2(gi, gj, seed + 9) * Math.PI * 2, (hash2(gi, gj, seed + 10) - 0.5) * 0.5);
          rotation.setFromEuler(euler);
          scale.set(sx, sy, sz);
          const shape = Math.floor(hash2(gi, gj, seed + 11) * ROCK_SHAPES.length);
          placed[shape].push(matrix.compose(position, rotation, scale).clone());
          if (boulder) boulders.push(wx, wz, Math.min(sx, sz) * 0.75);
        }
      }

      const group = new Group();
      group.name = 'rocks';
      placed.forEach((list, s) => {
        if (!list.length) return;
        const mesh = new InstancedMesh(ROCK_SHAPES[s], material, list.length);
        list.forEach((m, k) => mesh.setMatrixAt(k, m));
        mesh.computeBoundingSphere();
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.solid = true; // torches can go on rocks too
        group.add(mesh);
      });
      if (!group.children.length) return null;
      group.userData.key = `${cx},${cz}`;
      group.userData.boulders = boulders;
      layer.boulders.set(group.userData.key, boulders);
      return group;
    },

    dispose(group) {
      if (layer.boulders.get(group.userData.key) === group.userData.boulders) layer.boulders.delete(group.userData.key);
      for (const mesh of group.children) mesh.dispose(); // shapes are shared
    },
  };
  return layer;
}
