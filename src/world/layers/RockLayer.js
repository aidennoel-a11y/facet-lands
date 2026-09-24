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
const SANDSTONE = [0xc08c66, 0xb5825e, 0xc99a70, 0xab7a58];
const MOSS = new Color(0x6f8f4a);

/**
 * One low-poly rock: a polyhedron with its corners pushed in and out, the
 * bottom flattened so it sits, and per-face colours (grey-violet stone, with
 * moss on some upward faces).
 */
function rockGeometry(seed, base = 'dodeca', palette = STONE) {
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
  const mossy = palette === STONE && rand() < 0.5;
  for (let f = 0; f < pos.count; f += 3) {
    c.set(palette[Math.floor(rand() * palette.length)]).multiplyScalar(0.9 + rand() * 0.2);
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

/** The same shapes in sandstone, for the dry country (savanna, desert, mesas). */
const SAND_SHAPES = [
  rockGeometry(101, 'dodeca', SANDSTONE),
  rockGeometry(202, 'ico', SANDSTONE),
  rockGeometry(303, 'dodeca', SANDSTONE),
  rockGeometry(404, 'ico', SANDSTONE),
  rockGeometry(505, 'dodeca', SANDSTONE),
];
const ALL_SHAPES = [...ROCK_SHAPES, ...SAND_SHAPES];

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
 * Rocks and boulders scattered over the land: a few everywhere, more in the
 * foothills, boulder fields on flat bare stone high up, and heaps of big
 * boulders at the foot of steep mountainsides;
 * none on the mountainsides themselves, on cliffs or on snow. Small
 * stones only appear on the nearest chunks; boulders are visible further out
 * and block you when walking.
 */
export function createRockLayer(config) {
  const material = new MeshLambertMaterial({ vertexColors: true, flatShading: true });

  const cache = { generator: null, map: new Map() }; // chunk -> rock candidates

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

    /**
     * Where rocks can go in a chunk and how they look: everything that
     * doesn't depend on the chunk's mesh (the costly part, sampling the
     * terrain around each spot). Cached, so a chunk changing detail level
     * only has to set the rocks on its new mesh.
     */
    candidates(cx, cz, generator) {
      const key = `${cx},${cz}`;
      if (cache.generator !== generator) {
        cache.generator = generator;
        cache.map.clear();
      }
      let list = cache.map.get(key);
      if (list) {
        cache.map.delete(key); // most recently used goes last
        cache.map.set(key, list);
        return list;
      }
      list = [];
      const { chunkSize, seaLevel } = config;
      const spacing = 5;
      const cells = Math.round(chunkSize / spacing);
      const step = chunkSize / cells;
      const x0 = cx * chunkSize;
      const z0 = cz * chunkSize;
      const seed = generator.seed ^ 0x3c6ef372;
      const { snowLine } = generator.getBiome(x0 + chunkSize / 2, z0 + chunkSize / 2);
      for (let j = 0; j < cells; j++) {
        for (let i = 0; i < cells; i++) {
          const gi = cx * cells + i;
          const gj = cz * cells + j;
          const lx = (i + hash2(gi, gj, seed + 1)) * step;
          const lz = (j + hash2(gi, gj, seed + 2)) * step;
          const wx = x0 + lx;
          const wz = z0 + lz;

          // Boulders pile up at the foot of steep mountainsides (rock that
          // fell from above): flattish ground with a steep face rising just
          // uphill. The mountainsides themselves stay clear; a few rocks lie
          // everywhere else, more in the foothills.
          const m = generator.getMountainness(wx, wz);
          const foothill = Math.max(0, 1 - Math.abs(m - 0.45) / 0.35);
          const gx = (generator.getHeight(wx + 2, wz) - generator.getHeight(wx - 2, wz)) / 4;
          const gz = (generator.getHeight(wx, wz + 2) - generator.getHeight(wx, wz - 2)) / 4;
          const slope = Math.hypot(gx, gz);
          // Black Hills: granite boulders strewn everywhere among the pines,
          // heaped up the steep granite too.
          const bw = generator.getBiomeWeights(wx, wz, {});
          const granite = bw.blackHills;
          if (slope > 0.55 + 0.4 * granite) continue;
          const flat = 1 - smoothstep(0.2, 0.45, slope);
          // Dry country and mesas: sandstone rocks, not grey stone.
          const mesa = generator.getFeatures(wx, wz).mesa;
          const dry = bw.desert + bw.savanna > 0.5 || mesa > 0.1;
          const land = generator.getHeight(wx, wz);
          let foot = 0, cliff = 0;
          if (flat > 0 && (m > 0.05 || generator.getCliffiness(wx, wz) > 0.05)) {
            let rise = 0;
            for (let k = 0; k < 6; k++) {
              const a = (k / 6) * Math.PI * 2 + 0.3;
              for (const d of [16, 32]) rise = Math.max(rise, (generator.getHeight(wx + Math.cos(a) * d, wz + Math.sin(a) * d) - land) / d);
            }
            // Mesas shed only a scattering of rock, not great heaps.
            const shed = 1 - 0.8 * mesa;
            foot = smoothstep(0.3, 0.6, rise) * flat * shed;
            cliff = smoothstep(0.75, 1.3, rise) * flat * shed; // under a cliff: the biggest heaps
          }
          // Stones along river banks, on the mud just beside the water.
          const river = generator.rivers.at(wx, wz, 3.5);
          const bank = river && river.d > river.water + 0.4 ? 1 : 0;
          // Flat, bare stone high in the mountains: strewn with boulders
          // and rubble, so it's never a dead plain.
          const jitter = generator.getColorJitter(wx, wz);
          const colourHeight = land + jitter;
          const stony = smoothstep(132, 150, colourHeight) * (1 - smoothstep(snowLine - 20, snowLine - 8, colourHeight)) * flat;
          // Shores: rock outcrops on beaches and lake edges, stones along the rest of a lake's edge.
          const shore = land < seaLevel + 5.5 ? generator.getShore(wx, wz, land) : null;
          const shoreRock = shore ? (shore.kind === 'rock' ? (shore.ocean ? 1.4 : 1) : shore.ocean ? 0 : 0.3) * Math.max(shore.fade, 0.6) : 0;
          const chance = 0.025 + 0.2 * foothill * flat + 0.75 * foot + 0.2 * cliff + 0.45 * bank + 0.55 * stony + 0.6 * shoreRock + 0.45 * granite * (0.4 + 0.6 * smoothstep(0.2, 0.7, slope));
          if (hash2(gi, gj, seed) > chance) continue;

          const r = hash2(gi, gj, seed + 3);
          const boulder = r < (bank ? 0.12 : 0.1 + 0.15 * foothill + 0.7 * foot + 0.2 * cliff + 0.45 * stony + (shore && shore.kind === 'rock' ? 0.35 : 0) + 0.5 * granite);
          if (generator.caves.field.nearEntrance(wx, wz, 1.5)) continue; // keep cave entrances clear
          if (!bank && generator.rivers.at(wx, wz, 1)) continue; // and rivers
          const size = boulder ? 1.3 + hash2(gi, gj, seed + 4) * (1.6 + 1.2 * foothill + 3.2 * foot + 2.5 * cliff + 2.2 * stony + 2.5 * granite) * (bank ? 0.4 : 1) : (0.25 + hash2(gi, gj, seed + 4) * 0.6) * (bank ? 1.4 : 1);
          const sx = size * (0.8 + hash2(gi, gj, seed + 5) * 0.5);
          // Big fallen boulders stand chunkier and taller.
          const sy = size * (0.55 + hash2(gi, gj, seed + 6) * 0.45 + (boulder ? 0.35 * Math.max(foot, cliff) : 0));
          const sz = size * (0.8 + hash2(gi, gj, seed + 7) * 0.5);
          list.push({
            lx, lz, wx, wz, jitter, boulder, slope, sx, sy, sz,
            rx: (hash2(gi, gj, seed + 8) - 0.5) * 0.5,
            ry: hash2(gi, gj, seed + 9) * Math.PI * 2,
            rz: (hash2(gi, gj, seed + 10) - 0.5) * 0.5,
            shape: Math.floor(hash2(gi, gj, seed + 11) * ROCK_SHAPES.length) + (dry ? ROCK_SHAPES.length : 0),
          });
        }
      }
      list.snowLine = snowLine;
      cache.map.set(key, list);
      if (cache.map.size > 160) cache.map.delete(cache.map.keys().next().value);
      return list;
    },

    /** Output depends on the mesh's resolution and whether small stones are shown. */
    reuseKey({ lod, resolution }) {
      return lod > config.rockMaxLod ? 'none' : `${resolution}:${lod <= config.rockMaxLod - 1}`;
    },

    build({ cx, cz, lod, groundHeightAt, generator }) {
      if (lod > config.rockMaxLod) return null;
      const { seaLevel } = config;
      const smallStones = lod <= config.rockMaxLod - 1;
      const list = layer.candidates(cx, cz, generator);
      const snowLine = list.snowLine;

      const placed = ALL_SHAPES.map(() => []);
      const boulders = [];
      for (const c of list) {
        const ground = groundHeightAt(c.lx, c.lz);
        if (!(ground > seaLevel - 0.6)) continue; // off-chunk, deep water or a cave mouth
        if (ground + c.jitter > snowLine - 15) continue; // snow
        if (!c.boulder && !smallStones) continue;
        // Sunk deeper on a slope, so the uphill side doesn't float.
        position.set(c.lx, ground - c.sy * (0.3 + 0.5 * c.slope) - c.slope * Math.max(c.sx, c.sz) * 0.4, c.lz);
        euler.set(c.rx, c.ry, c.rz);
        rotation.setFromEuler(euler);
        scale.set(c.sx, c.sy, c.sz);
        placed[c.shape].push(matrix.compose(position, rotation, scale).clone());
        if (c.boulder) boulders.push(c.wx, c.wz, Math.min(c.sx, c.sz) * 0.75);
      }

      const group = new Group();
      group.name = 'rocks';
      placed.forEach((list, s) => {
        if (!list.length) return;
        const mesh = new InstancedMesh(ALL_SHAPES[s], material, list.length);
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
