import {
  BufferAttribute,
  Color,
  DodecahedronGeometry,
  Group,
  IcosahedronGeometry,
  BufferGeometry,
  Matrix3,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  Quaternion,
  Euler,
  Vector3,
} from 'three';
import { hash2, mulberry32 } from '../../noise/random.js';
import { ROCK_SHAPE_COUNT, rockCandidates } from '../rockCandidates.js';
import { seasonalRocks } from '../../render/Seasons.js';

const STONE = [0x8b8696, 0x7d7888, 0x938e9c, 0x736f7e];
const SANDSTONE = [0xc08c66, 0xb5825e, 0xc99a70, 0xab7a58];
const BASALT = [0x2b2828, 0x353131, 0x3f3a39, 0x242222];
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
/** And in black basalt, round the volcanoes. */
const BASALT_SHAPES = [
  rockGeometry(101, 'dodeca', BASALT),
  rockGeometry(202, 'ico', BASALT),
  rockGeometry(303, 'dodeca', BASALT),
  rockGeometry(404, 'ico', BASALT),
  rockGeometry(505, 'dodeca', BASALT),
];
/** And black and brown, scoria and baked rock: the debris a volcano blew out. */
const SCORIA = [0x231f1f, 0x4a3324, 0x2e2a29, 0x5c3f2b, 0x1b1818, 0x6a4a33];
const SCORIA_SHAPES = [
  rockGeometry(101, 'dodeca', SCORIA),
  rockGeometry(202, 'ico', SCORIA),
  rockGeometry(303, 'dodeca', SCORIA),
  rockGeometry(404, 'ico', SCORIA),
  rockGeometry(505, 'dodeca', SCORIA),
];
const ALL_SHAPES = [...ROCK_SHAPES, ...SAND_SHAPES, ...BASALT_SHAPES, ...SCORIA_SHAPES];

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

const matrix = new Matrix4();
const position = new Vector3();
const rotation = new Quaternion();
const euler = new Euler();
const scale = new Vector3();
const normalMatrix = new Matrix3();
const v = new Vector3();

/**
 * Rocks and boulders scattered over the land: a few everywhere, more in the
 * foothills, boulder fields on flat bare stone high up, and heaps of big
 * boulders at the foot of steep mountainsides;
 * none on the mountainsides themselves, on cliffs or on snow. Small
 * stones only appear on the nearest chunks; boulders are visible further out
 * and are solid when walking: each is taken as an ellipsoid of its own size,
 * turn and height (see surfaceAt), so you can step up onto a low one, climb
 * onto a big one's top if you jump, and walk into its side as a wall.
 */
export function createRockLayer(config) {
  const material = seasonalRocks(new MeshLambertMaterial({ vertexColors: true, flatShading: true }));

  const cache = { generator: null, map: new Map() }; // chunk -> rock candidates
  const groups = new Map(); // "cx,cz" -> the chunk's rocks drawn now

  const layer = {
    name: 'rocks',
    material,
    boulders: new Map(), // "cx,cz" -> [x, z, centre y, half-widths x, y, z, turn, ...] (world space)
    removed: new Set(), // boulders broken up with a pickaxe: their keys (see keyOf)

    /** A boulder's key, from where it stands. */
    keyOf(x, z) {
      return `${Math.round(x * 10)},${Math.round(z * 10)}`;
    },

    /** Breaks up the boulder `key` (see keyOf): gone from the world, and from where it's drawn now. */
    removeKey(key) {
      layer.removed.add(key);
      for (const [ck, list] of layer.boulders) {
        for (let k = 0; k < list.length; k += 7) {
          if (layer.keyOf(list[k], list[k + 1]) !== key) continue;
          list.splice(k, 7);
          const group = groups.get(ck), range = group?.userData.ranges?.get(key);
          if (range) {
            // (Its vertices all pulled to one point: nothing left to draw.)
            const pos = group.children[0].geometry.attributes.position;
            for (let i = range[0] + 1; i < range[0] + range[1]; i++) pos.setXYZ(i, pos.getX(range[0]), pos.getY(range[0]), pos.getZ(range[0]));
            pos.needsUpdate = true;
          }
          return true;
        }
      }
      return false;
    },

    /**
     * The top of any boulder at (x, z) (world), or -Infinity: each boulder
     * as an ellipsoid round its centre, the size of the rock (its corners
     * stick out a little past this, its faces sit a little inside).
     */
    surfaceAt(x, z) {
      const size = config.chunkSize;
      const cx = Math.floor(x / size);
      const cz = Math.floor(z / size);
      let top = -Infinity;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const list = layer.boulders.get(`${cx + dx},${cz + dz}`);
          if (!list) continue;
          for (let k = 0; k < list.length; k += 7) {
            const ox = x - list[k], oz = z - list[k + 1];
            const rx = list[k + 3], rz = list[k + 5];
            if (Math.abs(ox) > Math.max(rx, rz) || Math.abs(oz) > Math.max(rx, rz)) continue;
            // Into the rock's own frame (it's turned about the vertical).
            const c = Math.cos(list[k + 6]), s = Math.sin(list[k + 6]);
            const u = (ox * c - oz * s) / rx, v = (ox * s + oz * c) / rz;
            const r2 = u * u + v * v;
            if (r2 >= 1) continue;
            top = Math.max(top, list[k + 2] + list[k + 4] * Math.sqrt(1 - r2));
          }
        }
      }
      return top;
    },

    /** Takes rock candidates a chunk worker has already worked out (see ChunkManager). */
    accept(prepared, generator) {
      if (!prepared?.rocks) return;
      if (cache.generator !== generator) {
        cache.generator = generator;
        cache.map.clear();
      }
      for (const { cx, cz, list, snowLine } of prepared.rocks) {
        const key = `${cx},${cz}`;
        if (cache.map.has(key)) continue;
        list.snowLine = snowLine;
        cache.map.set(key, list);
      }
      while (cache.map.size > 400) cache.map.delete(cache.map.keys().next().value);
    },

    /**
     * The boulders lying in or within `margin` metres of a chunk, as
     * [x, z, radius, ...] (world space): where trees mustn't grow.
     */
    bouldersNear(cx, cz, generator, margin = 8) {
      const size = config.chunkSize;
      const x0 = cx * size - margin, z0 = cz * size - margin;
      const x1 = (cx + 1) * size + margin, z1 = (cz + 1) * size + margin;
      const out = [];
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          for (const c of layer.candidates(cx + dx, cz + dz, generator)) {
            if (c.boulder && c.wx > x0 && c.wx < x1 && c.wz > z0 && c.wz < z1) out.push(c.wx, c.wz, Math.max(c.sx, c.sz) * 0.93);
          }
        }
      }
      return out;
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
      list = rockCandidates(generator, config, cx, cz);
      cache.map.set(key, list);
      if (cache.map.size > 400) cache.map.delete(cache.map.keys().next().value);
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
        if (!(ground > seaLevel - (c.surf ? 9.5 : 0.6))) continue; // off-chunk, deep water or a cave mouth
        if (ground + c.jitter > snowLine - 15) continue; // snow
        if (!c.boulder && !smallStones) continue;
        if (c.boulder && layer.removed.has(layer.keyOf(c.wx, c.wz))) continue; // (broken up)
        // Sunk deeper on a slope, so the uphill side doesn't float.
        // (Boulders in the water at a cliff's foot stand out of it.)
        const sunk = ground - c.sy * (0.3 + 0.5 * c.slope) - c.slope * Math.max(c.sx, c.sz) * 0.4;
        position.set(c.lx, c.surf ? Math.max(sunk, Math.min(ground - c.sy * 0.2, seaLevel - c.sy * 0.5)) : sunk, c.lz);
        euler.set(c.rx, c.ry, c.rz);
        rotation.setFromEuler(euler);
        scale.set(c.sx, c.sy, c.sz);
        const m = matrix.compose(position, rotation, scale).clone();
        if (c.boulder) m.boulderKey = layer.keyOf(c.wx, c.wz);
        placed[c.shape].push(m);
        // (Rocks average about their unit size: 0.93 of it.)
        if (c.boulder) boulders.push(c.wx, c.wz, position.y, c.sx * 0.93, c.sy * 0.93, c.sz * 0.93, c.ry);
      }

      // All baked together into one mesh (one draw, where there'd be one
      // for each shape), each vertex keeping where it sits on its rock's
      // own shape (see seasonalRocks: snow drifts against their feet).
      let count = 0;
      placed.forEach((list, s) => (count += list.length * ALL_SHAPES[s].attributes.position.count));
      if (!count) return null;
      const positions = new Float32Array(count * 3), normals = new Float32Array(count * 3), colors = new Float32Array(count * 3), locals = new Float32Array(count * 3), mosses = new Float32Array(count * 2);
      // How lichened the rocks here are (up high, and in dry country); rock
      // by rock a little more or less.
      const cw = generator.getBiomeWeights((cx + 0.5) * config.chunkSize, (cz + 0.5) * config.chunkSize, {});
      const high = generator.getMountainness((cx + 0.5) * config.chunkSize, (cz + 0.5) * config.chunkSize);
      const dry = Math.min(1, 0.8 * high + 0.35 * ((cw.savanna ?? 0) + (cw.volcanic ?? 0)));
      let rockIndex = 0;
      let o = 0;
      const ranges = new Map(); // boulder key -> [first vertex, vertex count]
      const rocks = []; // [first vertex, vertex count, boulder key]
      placed.forEach((list, s) => {
        const shape = ALL_SHAPES[s].attributes;
        for (const m of list) {
          rocks.push([o / 3, shape.position.count, m.boulderKey]);
          normalMatrix.getNormalMatrix(m);
          locals.set(shape.position.array, o);
          colors.set(shape.color.array, o);
          const vary = 0.5 + hash2(cx * 97 + rockIndex, cz * 89 + rockIndex++, 0x5a55);
          for (let i = 0; i < shape.position.count; i++) mosses[(o / 3 + i) * 2 + 1] = dry * vary;
          for (let i = 0; i < shape.position.count; i++, o += 3) {
            v.fromBufferAttribute(shape.position, i).applyMatrix4(m);
            positions[o] = v.x;
            positions[o + 1] = v.y;
            positions[o + 2] = v.z;
            v.fromBufferAttribute(shape.normal, i).applyMatrix3(normalMatrix).normalize();
            normals[o] = v.x;
            normals[o + 1] = v.y;
            normals[o + 2] = v.z;
          }
        }
      });
      // The faces sunk wholly in the ground (half of a rock, often, and
      // every face of its underside) are never seen: left out.
      let w = 0;
      const below = (i) => positions[i * 3 + 1] < groundHeightAt(positions[i * 3], positions[i * 3 + 2]) - 0.08;
      for (const [first, n, key] of rocks) {
        const start = w;
        for (let i = first; i < first + n; i += 3) {
          if (below(i) && below(i + 1) && below(i + 2)) continue;
          if (w !== i) {
            positions.copyWithin(w * 3, i * 3, i * 3 + 9);
            normals.copyWithin(w * 3, i * 3, i * 3 + 9);
            colors.copyWithin(w * 3, i * 3, i * 3 + 9);
            locals.copyWithin(w * 3, i * 3, i * 3 + 9);
            mosses.copyWithin(w * 2, i * 2, i * 2 + 6);
          }
          w += 3;
        }
        if (key) ranges.set(key, [start, w - start]);
      }
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new BufferAttribute(positions.subarray(0, w * 3), 3));
      geometry.setAttribute('normal', new BufferAttribute(normals.subarray(0, w * 3), 3));
      geometry.setAttribute('color', new BufferAttribute(colors.subarray(0, w * 3), 3));
      geometry.setAttribute('rockLocal', new BufferAttribute(locals.subarray(0, w * 3), 3));
      geometry.setAttribute('rockMoss', new BufferAttribute(mosses.subarray(0, w * 2), 2));
      geometry.computeBoundingSphere();
      const mesh = new Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.solid = true; // torches can go on rocks too
      const group = new Group();
      group.name = 'rocks';
      group.add(mesh);
      group.userData.key = `${cx},${cz}`;
      group.userData.boulders = boulders;
      group.userData.ranges = ranges;
      layer.boulders.set(group.userData.key, boulders);
      groups.set(group.userData.key, group);
      return group;
    },

    dispose(group) {
      if (layer.boulders.get(group.userData.key) === group.userData.boulders) layer.boulders.delete(group.userData.key);
      if (groups.get(group.userData.key) === group) groups.delete(group.userData.key);
      for (const mesh of group.children) mesh.geometry.dispose();
    },
  };
  return layer;
}
