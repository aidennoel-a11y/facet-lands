import { BoxGeometry, BufferAttribute, Color, CylinderGeometry, DodecahedronGeometry, Group, Mesh, MeshLambertMaterial } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { hash2, mulberry32 } from '../../noise/random.js';

/**
 * Ruins: the stone bones of old strongholds, here and there over the land
 * (about one to a square of 640 m, on open, fairly level ground): a broken
 * square tower with a stone stair up its side to a floor high in it (a
 * lookout over the country), the walls of a courtyard fallen to stumps in
 * places, an arched gateway standing alone before it, columns (some broken
 * off), a cobbled way in, blocks tumbled in the grass; mossed and grown
 * over with ivy. Sandstone in the dry country. Chests were left in them
 * (see Game.ruinChest): one or two in the courtyard, a better one up the
 * tower.
 *
 * Solid: walls, tower, columns and the big blocks are boxes you walk into;
 * the stair's steps, the lookout floor and the tops of the broken walls are
 * boxes you can stand on (see collide, surfaceAt).
 */
const CELL = 640;
const GREY = [0xb4b0a6, 0xa6a298, 0xc2beb2, 0x9a978e, 0xb0aa94, 0xc6c0b2, 0xa29e92];
const SAND = [0xd2b080, 0xc4a274, 0xdcbe8c, 0xb8966a, 0xccaa7c, 0xe2c694];
const MOSS = [0x4f6a34, 0x5c7a3a, 0x46602e, 0x6a8a44];
const IVY = [0x2e4a22, 0x3a5a28, 0x34522a];

/** The ruin in grid cell (I, K), if any: { x, z, rot, seed, key } (not yet checked against the land). */
export function ruinSite(I, K, seed) {
  if (hash2(I, K, seed ^ 0x52a1) > 0.5) return null;
  const x = (I + 0.15 + 0.7 * hash2(I, K, seed ^ 0x52a2)) * CELL, z = (K + 0.15 + 0.7 * hash2(I, K, seed ^ 0x52a3)) * CELL;
  return { x, z, rot: hash2(I, K, seed ^ 0x52a4) * Math.PI * 2, seed: Math.floor(hash2(I, K, seed ^ 0x52a5) * 1e9), key: `${I},${K}` };
}

/** Whether the land at a site will take a ruin: dry, open, not steep, not up a mountain. */
export function ruinFits(site, generator, seaLevel) {
  let lo = Infinity, hi = -Infinity;
  for (let k = 0; k < 17; k++) {
    const a = (k / 8) * Math.PI * 2, r = k === 16 ? 0 : k < 8 ? 18 : 9;
    const h = generator.getHeight(site.x + Math.cos(a) * r, site.z + Math.sin(a) * r);
    lo = Math.min(lo, h);
    hi = Math.max(hi, h);
  }
  if (lo < seaLevel + 3 || hi - lo > 5.5) return false;
  if (generator.getMountainness(site.x, site.z) > 0.7) return false;
  if (generator.caves?.mouthsNear?.(site.x - 40, site.z - 40, site.x + 40, site.z + 40)?.length) return false;
  return true;
}

const shadeColour = new Color();
function colour(g, hex, rand, vary = 0.16) {
  const n = g.attributes.position.count, col = new Float32Array(n * 3);
  shadeColour.set(hex);
  for (let k = 0; k < n; k += 3) {
    const s = 1 - vary / 2 + rand() * vary;
    for (let v = 0; v < 3; v++) col.set([shadeColour.r * s, shadeColour.g * s, shadeColour.b * s], (k + v) * 3);
  }
  g.setAttribute('color', new BufferAttribute(col, 3));
  return g;
}

// One ruin: its stone, into `parts` (geometries in the chunk's frame, its
// corner at x0, z0), what's solid of it into `solids` (world), and its
// chests to `onChest`.
function buildRuin(site, generator, x0, z0, parts, solids, onChest) {
  const rand = mulberry32(site.seed);
  const rot = site.rot, ca = Math.cos(rot), sa = Math.sin(rot);
  const w = generator.getBiomeWeights(site.x, site.z, {});
  const STONE = (w.desert ?? 0) + (w.badlands ?? 0) + (w.saltFlat ?? 0) > 0.5 ? SAND : GREY;
  const stone = () => STONE[Math.floor(rand() * STONE.length)];
  // (The ruin's own frame: u along it, v across; to the world and back.)
  const wx = (u, v) => site.x + ca * u + sa * v, wz = (u, v) => site.z - sa * u + ca * v;
  const ground = (u, v) => generator.getHeight(wx(u, v), wz(u, v));
  // A piece, made in the ruin's frame (x = u, z = v), turned and set into the chunk.
  const put = (g, hex, vary) => {
    g = g.index ? g.toNonIndexed() : g;
    g.deleteAttribute('uv');
    g.rotateY(rot);
    g.translate(site.x - x0, 0, site.z - z0);
    parts.push(colour(g, hex, rand, vary));
  };
  const block = (u, v, y, su, sy, sv, hex, [rx, ry, rz] = [0, 0, 0]) => {
    const g = new BoxGeometry(su, sy, sv).toNonIndexed();
    if (rx) g.rotateX(rx);
    if (rz) g.rotateZ(rz);
    if (ry) g.rotateY(ry);
    g.translate(u, y, v);
    put(g, hex);
  };
  // Something solid: a box in the ruin's frame (half-sizes), bottom to top (world heights).
  const solid = (u, v, hu, hv, bottom, top, turn = 0) => solids.push({ x: wx(u, v), z: wz(u, v), hx: hu, hz: hv, rot: rot + turn, bottom, top, r: Math.hypot(hu, hv) });

  // A run of wall from (u1, v1) to (u2, v2), `thick`, each 0.6 m of it
  // standing as high as `height(t)` says (0 where it's fallen), in courses
  // of rough blocks; moss on the tops; ivy down the faces here and there.
  const wallRun = (u1, v1, u2, v2, thick, height, { gap = null, mossy = 0.35 } = {}) => {
    const len = Math.hypot(u2 - u1, v2 - v1), du = (u2 - u1) / len, dv = (v2 - v1) / len;
    const turn = Math.atan2(-dv, du); // (the run's own direction, as a turn of the frame)
    const n = Math.max(1, Math.round(len / 0.6)), step = len / n;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, mu = u1 + du * step * (i + 0.5), mv = v1 + dv * step * (i + 0.5);
      const g0 = Math.min(ground(mu - dv * thick / 2, mv + du * thick / 2), ground(mu + dv * thick / 2, mv - du * thick / 2));
      const h = height(t, i);
      if (h <= 0.05) continue;
      const base = g0 - 0.5, top = g0 + h;
      for (let y = base, row = 0; y < top - 0.05; y += 0.42, row++) {
        const ch = Math.min(0.4, top - y);
        // (Each other course set off by half a block: two half blocks to the column.)
        const split = (row + i) % 2 === 0;
        for (const [off, l] of split ? [[0, step]] : [[-step / 4, step / 2], [step / 4, step / 2]]) {
          if (gap && t > gap[0] && t < gap[1] && y - g0 > gap[2] && y - g0 < gap[3]) continue;
          const bu = mu + du * off, bv = mv + dv * off;
          const top3 = y + ch > top - 0.42 && rand() < mossy;
          block(bu, bv, y + ch / 2, l - 0.03, ch - 0.02, thick * (0.94 + rand() * 0.1), top3 ? MOSS[Math.floor(rand() * MOSS.length)] : stone(), [0, turn + (rand() - 0.5) * 0.04, (rand() - 0.5) * 0.03]);
        }
      }
      // (Mortar behind, so no light shows between the blocks.)
      block(mu, mv, (base + top) / 2, step, top - base - 0.04, thick * 0.4, 0x7a776e, [0, turn, 0]);
      if (gap && t > gap[0] && t < gap[1]) {
        // (A doorway through it: solid only below and above the opening.)
        if (gap[2] > 0.05) solid(mu, mv, step / 2, thick / 2, base, g0 + gap[2], turn);
        if (h > gap[3]) solid(mu, mv, step / 2, thick / 2, g0 + gap[3], top, turn);
      } else solid(mu, mv, step / 2 + 0.02, thick / 2, base, top, turn);
      // Ivy hanging down its faces.
      if (rand() < 0.18 && h > 1.4) {
        const side = rand() < 0.5 ? 1 : -1, len2 = h * (0.4 + rand() * 0.5);
        block(mu - dv * side * (thick / 2 + 0.03), mv + du * side * (thick / 2 + 0.03), top - len2 / 2, 0.5 + rand() * 0.4, len2, 0.06, IVY[Math.floor(rand() * IVY.length)], [0, turn, 0]);
      }
      // Bushes and long grass at its foot.
      if (rand() < 0.12) {
        const side = rand() < 0.5 ? 1 : -1, r = 0.35 + rand() * 0.45, g = new DodecahedronGeometry(r, 0);
        g.scale(1.2, 0.8, 1.1);
        g.translate(mu - dv * side * (thick / 2 + r * 0.8), g0 + r * 0.5, mv + du * side * (thick / 2 + r * 0.8));
        put(g, MOSS[Math.floor(rand() * MOSS.length)], 0.3);
      }
    }
  };
  // How high a stretch of courtyard wall still stands: in places fallen to
  // nothing, in others to a stump; here and there a stretch near whole.
  const ruined = (base) => {
    const p = rand() * 10, q = rand() * 10;
    return (t) => {
      const h = base * (0.55 + 0.45 * Math.sin(t * 7.3 + p) * Math.sin(t * 3.1 + q)) + (rand() - 0.5) * 0.5;
      return Math.sin(t * 11 + p) > 0.82 ? 0 : Math.max(0, h);
    };
  };

  // The courtyard walls, three sides and the stumps of the fourth, the way in through it.
  const S = 8, T = 0.7;
  wallRun(-S, -S, S, -S, T, ruined(2.6 + rand() * 1.4));
  wallRun(S, -S, S, 3, T, ruined(2.4 + rand() * 1.4));
  wallRun(-S, S, 3, S, T, ruined(2.2 + rand() * 1.6));
  wallRun(-S, -S, -S, -2.2, T, ruined(1.6 + rand()));
  wallRun(-S, 2.2, -S, S, T, ruined(1.6 + rand()));

  // The tower, in the far corner: 5 m square, its walls broken off high
  // up; a doorway into the courtyard; a floor high in it, reached by a
  // stair up its outside and a gap in its wall at the top of the stair.
  const H = 8 + rand() * 3, P = 4.5, A = 3, B = 8;
  const broken = (t) => H - Math.max(0, Math.sin(t * 9 + site.seed % 7) * 2.6 + rand() * 1.2);
  wallRun(A, A, B, A, 0.8, broken, { gap: [0.38, 0.62, 0, 2.4] }); // (the door, courtyard side)
  wallRun(B, A, B, B, 0.8, broken);
  wallRun(A, A, A, B, 0.8, broken);
  wallRun(A, B, B, B, 0.8, broken, { gap: [0.68, 0.94, P - 0.1, P + 2.3] }); // (the way in at the top of the stair)
  // The floor up in it: planks long gone, a stone slab on corbels.
  const gt = ground((A + B) / 2, (A + B) / 2);
  block((A + B) / 2, (A + B) / 2, gt + P - 0.15, B - A - 0.7, 0.3, B - A - 0.7, stone());
  solid((A + B) / 2, (A + B) / 2, (B - A - 0.7) / 2, (B - A - 0.7) / 2, gt + P - 0.3, gt + P);
  // The stair: steps up along the outside of the tower's far wall.
  const steps = Math.round(P / 0.3), run = (B - A - 0.4) / steps;
  for (let k = 0; k < steps; k++) {
    const u = A + 0.2 + run * (k + 0.5), v = B + 0.95, top = gt + (k + 1) * (P / steps);
    const g0 = Math.min(ground(u, v), gt) - 0.3;
    block(u, v, (g0 + top) / 2, run + 0.02, top - g0, 1.1, stone());
    solid(u, v, run / 2 + 0.01, 0.55, g0, top);
  }
  // A landing at the top, by the gap in the wall.
  block(B - 0.6, B + 0.95, gt + P - 0.15, 1.2, 0.3, 1.1, stone());

  // The gateway, standing alone before the courtyard: two piers and an arch.
  const gu = -S - 5, gg = ground(gu, 0);
  for (const side of [-1, 1]) {
    for (let y = gg - 0.4, row = 0; y < gg + 3.2; y += 0.45, row++) block(gu, side * 1.75, y + 0.22, 1.0, 0.43, 1.0 + (row % 2) * 0.08, stone(), [0, (rand() - 0.5) * 0.05, 0]);
    solid(gu, side * 1.75, 0.5, 0.5, gg - 0.4, gg + 3.2);
    // (Moss on top of the pier, and ivy down it.)
    if (rand() < 0.6) block(gu, side * 1.75, gg + 2.8, 1.06, 0.9, 0.08, IVY[Math.floor(rand() * 3)], [0, Math.PI / 2, 0]);
  }
  const R = 1.75;
  for (let k = 0; k < 9; k++) {
    const a = ((k + 0.5) / 9) * Math.PI;
    // (A wedge of the arch, along its curve: some of the keystones fallen.)
    if (k === 4 && rand() < 0.25) continue;
    block(gu, R * Math.cos(a), gg + 3.2 + R * Math.sin(a), 0.95, 0.5, 0.62, k === 4 ? MOSS[1] : stone(), [Math.PI / 2 - a, 0, 0]);
  }

  // Columns down one side of the courtyard: some whole, some broken off.
  for (let k = 0; k < 4; k++) {
    const u = -5 + k * 3.2, v = -4.6, g0 = ground(u, v), whole = rand() < 0.35, h = whole ? 3.6 : 0.8 + rand() * 2.4;
    block(u, v, g0 - 0.1, 1.0, 0.4, 1.0, stone());
    const shaft = new CylinderGeometry(0.32, 0.36, h, 8, 1);
    shaft.translate(u, g0 + 0.1 + h / 2, v);
    put(shaft, stone(), 0.1);
    if (whole) block(u, v, g0 + 0.1 + h + 0.15, 0.9, 0.3, 0.9, stone());
    else if (rand() < 0.7) {
      // (Its top lying where it fell.)
      const fall = rand() * Math.PI * 2, drum = new CylinderGeometry(0.32, 0.32, 1.2, 8, 1);
      drum.rotateZ(Math.PI / 2);
      drum.rotateY(fall);
      drum.translate(u + Math.cos(fall) * 1.6, ground(u + Math.cos(fall) * 1.6, v) + 0.25, v - Math.sin(fall) * 1.6);
      put(drum, stone(), 0.1);
    }
    solid(u, v, 0.36, 0.36, g0 - 0.3, g0 + 0.1 + h + (whole ? 0.3 : 0));
  }

  // The cobbled way: up to the gateway, through it and into the courtyard.
  for (let u = -S - 14; u < 2; u += 0.55) {
    for (let v = -1.3; v < 1.3; v += 0.55) {
      if (rand() < (u > -S ? 0.45 : 0.22)) continue; // (grown over in places)
      const ou = u + rand() * 0.1, ov = v + rand() * 0.1;
      block(ou, ov, ground(ou, ov) + 0.02, 0.48, 0.1, 0.48, stone(), [0, rand() * 0.4, 0]);
    }
  }
  // Blocks tumbled down in the grass round the walls.
  for (let k = 0; k < 14; k++) {
    const a = rand() * Math.PI * 2, d = 6 + rand() * 6, u = Math.cos(a) * d, v = Math.sin(a) * d;
    const s = 0.4 + rand() * 0.5;
    block(u, v, ground(u, v) + s * 0.25, s * 1.4, s, s * 1.1, rand() < 0.2 ? MOSS[0] : stone(), [rand() * 0.4, rand() * 3, rand() * 0.4]);
    if (s > 0.7) solid(u, v, s * 0.6, s * 0.5, ground(u, v) - 0.2, ground(u, v) + s * 0.7, 0);
  }

  // The chests: in the courtyard, and up in the tower.
  if (onChest) {
    const at = (u, v, y, name, best) => onChest({ key: `${site.key}:${name}`, x: wx(u, v), y, z: wz(u, v), rot: rot + rand() * 0.6 - 0.3, best });
    at(-3.5, 4.6, ground(-3.5, 4.6), 'yard', false);
    if (rand() < 0.5) at(1.5, -6.6, ground(1.5, -6.6), 'wall', false);
    at(A + 1.2, A + 1.2, gt + P, 'tower', true);
  }
}

export function createRuinLayer(config) {
  const material = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const fits = new Map(); // "I,K" -> the site, or null
  const site = (I, K, generator) => {
    const key = `${I},${K}`;
    if (!fits.has(key)) {
      const s = ruinSite(I, K, generator.seed);
      fits.set(key, s && ruinFits(s, generator, config.seaLevel) ? s : null);
    }
    return fits.get(key);
  };
  const solids = new Map(); // "cx,cz" -> [{ x, z, hx, hz, rot, bottom, top, r }] (world)
  // (The stone near a point: what's in the chunks round it.)
  const near = (x, z) => {
    const size = config.chunkSize, cx = Math.floor(x / size), cz = Math.floor(z / size), out = [];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const list = solids.get(`${cx + dx},${cz + dz}`);
      if (list) for (const b of list) if (Math.abs(b.x - x) < b.r + 1 && Math.abs(b.z - z) < b.r + 1) out.push(b);
    }
    return out;
  };
  const frame = (b, x, z) => {
    const c = Math.cos(b.rot), s = Math.sin(b.rot), ox = x - b.x, oz = z - b.z;
    return [ox * c - oz * s, ox * s + oz * c, c, s];
  };

  const layer = {
    name: 'ruins',
    material,
    onChest: null, // ({ key, x, y, z, rot, best }) => a chest's place, when its ruin's built near you

    /** The ruins near (x, z), within `r` metres: [{ x, z, key, ... }] (only those the land takes). */
    sitesNear(x, z, r, generator) {
      const out = [];
      for (let K = Math.floor((z - r) / CELL); K <= Math.floor((z + r) / CELL); K++) {
        for (let I = Math.floor((x - r) / CELL); I <= Math.floor((x + r) / CELL); I++) {
          const s = site(I, K, generator);
          if (s && Math.hypot(s.x - x, s.z - z) <= r) out.push(s);
        }
      }
      return out;
    },

    /** The top of any of a ruin's stone you'd stand on at (x, z), from your feet at `feetY`, or -Infinity. */
    surfaceAt(x, z, feetY) {
      let top = -Infinity;
      for (const b of near(x, z)) {
        if (b.top > feetY + 0.65 || b.top < top) continue;
        const [u, v] = frame(b, x, z);
        if (Math.abs(u) <= b.hx && Math.abs(v) <= b.hz) top = b.top;
      }
      return top;
    },

    /** Pushes a circle (you, walking, feet at `feetY`) out of the ruins' stone. */
    collide(position, radius, feetY) {
      for (const b of near(position.x, position.z)) {
        if (feetY > b.top - 0.6 || feetY + 1.75 < b.bottom) continue; // (up on it, or under it)
        const [u, v, c, s] = frame(b, position.x, position.z);
        const cu = Math.max(-b.hx, Math.min(b.hx, u)), cv = Math.max(-b.hz, Math.min(b.hz, v));
        let du = u - cu, dv = v - cv, d = Math.hypot(du, dv);
        if (d >= radius) continue;
        if (d === 0) {
          const pu = b.hx - Math.abs(u), pv = b.hz - Math.abs(v);
          if (pu < pv) (du = Math.sign(u) || 1), (dv = 0), (d = -pu);
          else (du = 0), (dv = Math.sign(v) || 1), (d = -pv);
        } else (du /= d), (dv /= d);
        const push = radius - d;
        position.x += (du * c + dv * s) * push;
        position.z += (-du * s + dv * c) * push;
      }
    },

    reuseKey({ lod }) {
      return lod > 2 ? 'none' : lod === 0 ? 'ruins0' : 'ruins';
    },

    build({ cx, cz, lod, generator }) {
      if (lod > 2) return null;
      const size = config.chunkSize, x0 = cx * size, z0 = cz * size;
      const I0 = Math.floor(x0 / CELL), K0 = Math.floor(z0 / CELL);
      const parts = [], list = [];
      for (let K = K0 - 1; K <= K0 + 1; K++) {
        for (let I = I0 - 1; I <= I0 + 1; I++) {
          const s = site(I, K, generator);
          if (!s || Math.floor(s.x / size) !== cx || Math.floor(s.z / size) !== cz) continue;
          buildRuin(s, generator, x0, z0, parts, list, lod === 0 ? layer.onChest : null);
        }
      }
      if (!parts.length) return null;
      const geometry = mergeGeometries(parts);
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      const mesh = new Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.solid = true; // (torches go on it)
      const group = new Group();
      group.name = 'ruins';
      group.add(mesh);
      group.userData.key = `${cx},${cz}`;
      group.userData.solids = list;
      solids.set(group.userData.key, list);
      return group;
    },

    dispose(group) {
      if (solids.get(group.userData.key) === group.userData.solids) solids.delete(group.userData.key);
      for (const mesh of group.children) mesh.geometry.dispose();
    },
  };
  return layer;
}
