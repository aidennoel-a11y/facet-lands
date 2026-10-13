import { BoxGeometry, BufferAttribute, Color, CylinderGeometry, DodecahedronGeometry, Group, Mesh, MeshLambertMaterial } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { hash2, mulberry32 } from '../../noise/random.js';

/**
 * Ruins: the stone bones of old places, here and there over the land (about
 * one to a square of 1.3 km, on open, fairly level ground), all of the one
 * old, mossed, ivy-hung stone (sandstone in the dry country), in ten kinds
 * (RUIN_KINDS), small to big: a stronghold's courtyard and tower, a lone
 * watchtower, a gatehouse, a temple of columns on a platform, a great hall,
 * a chapel, a castle with its keep and corner towers, a hamlet of fallen
 * cottages round a well, a ring of standing stones, an aqueduct's arches.
 * Chests were left in them (see Game.ruinChest), the `best` ones holding
 * better things (up towers, by altars).
 *
 * Solid: walls, towers, columns, piers and the big blocks are boxes you walk
 * into; steps, platforms, floors and the tops of broken walls are boxes you
 * can stand on (see collide, surfaceAt).
 */
const CELL = 640;
const GREY = [0xb4b0a6, 0xa6a298, 0xc2beb2, 0x9a978e, 0xb0aa94, 0xc6c0b2, 0xa29e92];
const SAND = [0xd2b080, 0xc4a274, 0xdcbe8c, 0xb8966a, 0xccaa7c, 0xe2c694];
const MOSS = [0x4f6a34, 0x5c7a3a, 0x46602e, 0x6a8a44];
const IVY = [0x2e4a22, 0x3a5a28, 0x34522a];

/** The ruin in grid cell (I, K), if any: { x, z, rot, seed, key } (not yet checked against the land). */
export function ruinSite(I, K, seed) {
  if (hash2(I, K, seed ^ 0x52a1) > 0.25) return null; // (one cell in four or so: then only where the land will take one)
  const x = (I + 0.15 + 0.7 * hash2(I, K, seed ^ 0x52a2)) * CELL, z = (K + 0.15 + 0.7 * hash2(I, K, seed ^ 0x52a3)) * CELL;
  const kind = Math.min(9, Math.floor(hash2(I, K, seed ^ 0x52a6) * 10));
  return { x, z, rot: hash2(I, K, seed ^ 0x52a4) * Math.PI * 2, seed: Math.floor(hash2(I, K, seed ^ 0x52a5) * 1e9), key: `${I},${K}`, kind, size: RUIN_SIZE[kind] };
}

/** Whether the land at a site will take a ruin: dry, open, not steep, not up a mountain. */
export function ruinFits(site, generator, seaLevel) {
  let lo = Infinity, hi = -Infinity;
  for (let k = 0; k < 17; k++) {
    const a = (k / 8) * Math.PI * 2, r = k === 16 ? 0 : k < 8 ? site.size : site.size / 2;
    const h = generator.getHeight(site.x + Math.cos(a) * r, site.z + Math.sin(a) * r);
    lo = Math.min(lo, h);
    hi = Math.max(hi, h);
  }
  if (lo < seaLevel + 3 || hi - lo > 4 + site.size / 8) return false;
  if (generator.getMountainness(site.x, site.z) > 0.7) return false;
  if (generator.caves?.mouthsNear?.(site.x - site.size - 22, site.z - site.size - 22, site.x + site.size + 22, site.z + site.size + 22)?.length) return false;
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

// The ten kinds of ruin, all in the one old stone, and how far each spreads
// (metres from its middle): the land under it must take that.
export const RUIN_KINDS = ['stronghold', 'watchtower', 'gatehouse', 'temple', 'hall', 'chapel', 'castle', 'hamlet', 'circle', 'aqueduct', 'keep'];
const RUIN_SIZE = [18, 9, 13, 12, 16, 10, 24, 18, 9, 20, 34];

/**
 * The Lost Keep: one in each world, very far out (15 to 20 km from its
 * middle, where you start), on open, dry, fairly level ground (the first of
 * a ring of places round that the land will take). A great castle, its
 * walls whole and too high to climb; in the middle, the great keep, a stair
 * winding up round it to its top, and up there an altar that wants the
 * trophies of all the great beasts (see Game.#offer). Set them all: the end
 * of the long road, and the last chest.
 */
// (Read from the land before its rivers: quick, so far out, where nothing's been worked out yet.)
function keepFits(site, generator, seaLevel) {
  let lo = Infinity, hi = -Infinity;
  for (let k = 0; k < 17; k++) {
    const a = (k / 8) * Math.PI * 2, r = k === 16 ? 0 : k < 8 ? site.size : site.size / 2;
    const h = generator.landHeight(site.x + Math.cos(a) * r, site.z + Math.sin(a) * r);
    lo = Math.min(lo, h);
    hi = Math.max(hi, h);
  }
  return lo > seaLevel + 4 && hi - lo < 8 && generator.getMountainness(site.x, site.z) < 0.7;
}
const keeps = new WeakMap();
export function keepSite(generator, seaLevel) {
  if (keeps.has(generator)) return keeps.get(generator);
  let found = null, last = null;
  for (let k = 0; k < 64 && !found; k++) {
    const a = hash2(k, 7, generator.seed ^ 0x6ee9) * Math.PI * 2, r = 15000 + 5000 * hash2(k, 8, generator.seed ^ 0x6ee9);
    const site = { x: Math.cos(a) * r, z: Math.sin(a) * r, rot: hash2(k, 9, generator.seed ^ 0x6ee9) * Math.PI * 2, seed: 4242 + k, key: 'keep', kind: 10, size: RUIN_SIZE[10], keep: true };
    last = site;
    if (keepFits(site, generator, seaLevel)) found = site;
  }
  found ??= last;
  keeps.set(generator, found);
  return found;
}

// One ruin: its stone, into `parts` (geometries in the chunk's frame, its
// corner at x0, z0), what's solid of it into `solids` (world), and its
// chests to `onChest`.
function buildRuin(site, generator, x0, z0, parts, solids, onChest, gateParts = null) {
  const rand = mulberry32(site.seed);
  const rot = site.rot, ca = Math.cos(rot), sa = Math.sin(rot);
  const w = generator.getBiomeWeights(site.x, site.z, {});
  const STONE = (w.desert ?? 0) + (w.badlands ?? 0) + (w.saltFlat ?? 0) > 0.5 ? SAND : GREY;
  const stone = () => STONE[Math.floor(rand() * STONE.length)];
  const moss = () => MOSS[Math.floor(rand() * MOSS.length)];
  // (The ruin's own frame: u along it, v across; to the world and back.)
  const wx = (u, v) => site.x + ca * u + sa * v, wz = (u, v) => site.z - sa * u + ca * v;
  const ground = (u, v) => generator.getHeight(wx(u, v), wz(u, v));
  // A piece, made in the ruin's frame (x = u, z = v), turned and set into the chunk.
  let into = parts; // (the Keep's sealed gate goes into a mesh of its own: see gateParts)
  const put = (g, hex, vary) => {
    g = g.index ? g.toNonIndexed() : g;
    g.deleteAttribute('uv');
    g.rotateY(rot);
    g.translate(site.x - x0, 0, site.z - z0);
    into.push(colour(g, hex, rand, vary));
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
  const solid = (u, v, hu, hv, bottom, top, turn = 0, gate = false) => solids.push({ x: wx(u, v), z: wz(u, v), hx: hu, hz: hv, rot: rot + turn, bottom, top, r: Math.hypot(hu, hv), gate });
  // The chests: `best` ones hold the better things.
  const chest = (u, v, y, name, best = false, extra = {}) => onChest?.({ key: `${site.key}:${name}`, x: wx(u, v), y, z: wz(u, v), rot: rot + rand() * 0.6 - 0.3, best, ...extra });

  // A run of wall from (u1, v1) to (u2, v2), `thick`, each 0.6 m of it
  // standing as high as `height(t)` says (0 where it's fallen), in courses
  // of rough blocks; moss on the tops; ivy down the faces here and there.
  // `gaps` ([t0, t1, y0, y1], along it and up it) are doorways and windows.
  const wallRun = (u1, v1, u2, v2, thick, height, { gaps = [], mossy = 0.35 } = {}) => {
    const len = Math.hypot(u2 - u1, v2 - v1), du = (u2 - u1) / len, dv = (v2 - v1) / len;
    const turn = Math.atan2(-dv, du); // (the run's own direction, as a turn of the frame)
    const n = Math.max(1, Math.round(len / 0.6)), step = len / n;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, mu = u1 + du * step * (i + 0.5), mv = v1 + dv * step * (i + 0.5);
      const g0 = Math.min(ground(mu - dv * thick / 2, mv + du * thick / 2), ground(mu + dv * thick / 2, mv - du * thick / 2));
      const h = height(t, i);
      if (h <= 0.05) continue;
      const base = g0 - 0.5, top = g0 + h;
      const gap = gaps.find((q) => t > q[0] && t < q[1]);
      for (let y = base, row = 0; y < top - 0.05; y += 0.42, row++) {
        const ch = Math.min(0.4, top - y);
        if (gap && y - g0 > gap[2] - 0.2 && y - g0 < gap[3]) continue;
        // (Each other course set off by half a block: two half blocks to the column.)
        const split = (row + i) % 2 === 0;
        for (const [off, l] of split ? [[0, step]] : [[-step / 4, step / 2], [step / 4, step / 2]]) {
          const bu = mu + du * off, bv = mv + dv * off;
          const top3 = y + ch > top - 0.42 && rand() < mossy;
          block(bu, bv, y + ch / 2, l - 0.03, ch - 0.02, thick * (0.94 + rand() * 0.1), top3 ? moss() : stone(), [0, turn + (rand() - 0.5) * 0.04, (rand() - 0.5) * 0.03]);
        }
      }
      if (gap) {
        // (A doorway or window through it: solid, and backed, only below and above the opening.)
        if (gap[2] > 0.05) {
          solid(mu, mv, step / 2, thick / 2, base, g0 + gap[2], turn);
          block(mu, mv, (base + g0 + gap[2] - 0.2) / 2, step, g0 + gap[2] - 0.2 - base, thick * 0.4, 0x7a776e, [0, turn, 0]);
        }
        if (h > gap[3]) solid(mu, mv, step / 2, thick / 2, g0 + gap[3], top, turn);
      } else {
        // (Mortar behind, so no light shows between the blocks.)
        block(mu, mv, (base + top) / 2, step, top - base - 0.04, thick * 0.4, 0x7a776e, [0, turn, 0]);
        solid(mu, mv, step / 2 + 0.02, thick / 2, base, top, turn);
      }
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
        put(g, moss(), 0.3);
      }
    }
  };
  // A closed run of wall round the points given.
  const wallLoop = (pts, thick, height, gapsOf = () => ({})) => {
    for (let k = 0; k < pts.length; k++) {
      const [u1, v1] = pts[k], [u2, v2] = pts[(k + 1) % pts.length];
      wallRun(u1, v1, u2, v2, thick, height, gapsOf(k));
    }
  };
  // How high a stretch of wall still stands: in places fallen to nothing,
  // in others to a stump; here and there a stretch near whole.
  const ruined = (base, fallen = 0.82) => {
    const p = rand() * 10, q = rand() * 10;
    return (t) => {
      const h = base * (0.55 + 0.45 * Math.sin(t * 7.3 + p) * Math.sin(t * 3.1 + q)) + (rand() - 0.5) * 0.5;
      return Math.sin(t * 11 + p) > fallen ? 0 : Math.max(0, h);
    };
  };

  // A square tower, `size` across with its corner at (u0, v0), broken off
  // high up; a doorway in its near side (v0); with `stair`, a floor high in
  // it, reached by steps up its outside and a gap in the wall at their top.
  // Gives where the floor is (for a chest).
  const tower = (u0, v0, size, H, stair = true) => {
    const u1 = u0 + size, v1 = v0 + size, P = Math.min(H - 2.5, 3.5 + size * 0.2);
    const broken = (t) => H - Math.max(0, Math.sin(t * 9 + (site.seed % 7)) * 2.6 + rand() * 1.2);
    wallRun(u0, v0, u1, v0, 0.8, broken, { gaps: [[0.38, 0.62, 0, 2.4]] });
    wallRun(u1, v0, u1, v1, 0.8, broken, { gaps: H > 6 ? [[0.42, 0.58, H * 0.62, H * 0.62 + 1.1]] : [] }); // (an arrow slit)
    wallRun(u0, v0, u0, v1, 0.8, broken);
    wallRun(u0, v1, u1, v1, 0.8, broken, { gaps: stair ? [[0.68, 0.94, P - 0.1, P + 2.3]] : [] });
    const gt = ground((u0 + u1) / 2, (v0 + v1) / 2);
    if (!stair) return null;
    // The floor up in it: planks long gone, a stone slab on corbels.
    block((u0 + u1) / 2, (v0 + v1) / 2, gt + P - 0.15, size - 0.7, 0.3, size - 0.7, stone());
    solid((u0 + u1) / 2, (v0 + v1) / 2, (size - 0.7) / 2, (size - 0.7) / 2, gt + P - 0.3, gt + P);
    // The stair: steps up along the outside of the far wall.
    const steps = Math.round(P / 0.3), run = (size - 0.4) / steps;
    for (let k = 0; k < steps; k++) {
      const u = u0 + 0.2 + run * (k + 0.5), v = v1 + 0.95, top = gt + (k + 1) * (P / steps);
      const g0 = Math.min(ground(u, v), gt) - 0.3;
      block(u, v, (g0 + top) / 2, run + 0.02, top - g0, 1.1, stone());
      solid(u, v, run / 2 + 0.01, 0.55, g0, top);
    }
    block(u1 - 0.6, v1 + 0.95, gt + P - 0.15, 1.2, 0.3, 1.1, stone()); // (a landing at the top)
    return { u: u0 + 1.2, v: v0 + 1.2, y: gt + P };
  };

  // An arch of wedged stones, its middle at (u, v), springing from height
  // y, `R` across to each side, spanning along v (`across` false: along u).
  const arch = (u, v, y, R, across = true) => {
    for (let k = 0; k < 9; k++) {
      const a = ((k + 0.5) / 9) * Math.PI;
      if (k === 4 && rand() < 0.25) continue; // (its keystone fallen)
      const hex = k === 4 ? MOSS[1] : stone();
      if (across) block(u, v + R * Math.cos(a), y + R * Math.sin(a), 0.95, 0.5, 0.62, hex, [Math.PI / 2 - a, 0, 0]);
      else block(u + R * Math.cos(a), v, y + R * Math.sin(a), 0.62, 0.5, 0.95, hex, [0, 0, a - Math.PI / 2]);
    }
  };
  // A pier of squared blocks from the ground up to `top` (world height).
  const pier = (u, v, top, s = 1.0) => {
    const g0 = ground(u, v);
    for (let y = g0 - 0.4, row = 0; y < top - 0.05; y += 0.45, row++) {
      const h = Math.min(0.43, top - y);
      block(u, v, y + h / 2, s, h, s + (row % 2) * 0.08, stone(), [0, (rand() - 0.5) * 0.05, 0]);
    }
    solid(u, v, s / 2, s / 2, g0 - 0.4, top);
    if (rand() < 0.4) block(u + s / 2 + 0.03, v, top - 0.6, 0.06, 1.2, s * 0.9, IVY[Math.floor(rand() * 3)]);
  };
  // The gateway: two piers and an arch over the way between them (along u).
  const gateway = (gu, gv = 0, R = 1.75) => {
    const gg = ground(gu, gv);
    for (const side of [-1, 1]) pier(gu, gv + side * R, gg + 3.2);
    arch(gu, gv, gg + 3.2, R);
  };
  // A column on its plinth from height `y0` (or the ground): whole, or broken off with its top lying by it.
  const column = (u, v, y0 = null, tall = 3.6, wholeChance = 0.35) => {
    const g0 = y0 ?? ground(u, v), whole = rand() < wholeChance, h = whole ? tall : 0.8 + rand() * (tall - 1.2);
    block(u, v, g0 - 0.1, 1.0, 0.4, 1.0, stone());
    const shaft = new CylinderGeometry(0.32, 0.36, h, 8, 1);
    shaft.translate(u, g0 + 0.1 + h / 2, v);
    put(shaft, stone(), 0.1);
    if (whole) block(u, v, g0 + 0.1 + h + 0.15, 0.9, 0.3, 0.9, stone());
    else if (rand() < 0.7) {
      const fall = rand() * Math.PI * 2, drum = new CylinderGeometry(0.32, 0.32, 1.2, 8, 1);
      const fu = u + Math.cos(fall) * 1.6, fv = v - Math.sin(fall) * 1.6;
      drum.rotateZ(Math.PI / 2);
      drum.rotateY(fall);
      drum.translate(fu, Math.max(ground(fu, fv), y0 ?? -Infinity) + 0.25, fv);
      put(drum, stone(), 0.1);
    }
    solid(u, v, 0.36, 0.36, g0 - 0.3, g0 + 0.1 + h + (whole ? 0.3 : 0));
    return whole ? g0 + 0.1 + h + 0.3 : 0;
  };
  // A cobbled way, grown over in places.
  const cobbles = (u1, u2, v1, v2, grown = 0.3) => {
    for (let u = u1; u < u2; u += 0.55) {
      for (let v = v1; v < v2; v += 0.55) {
        if (rand() < grown) continue;
        const ou = u + rand() * 0.1, ov = v + rand() * 0.1;
        block(ou, ov, ground(ou, ov) + 0.02, 0.48, 0.1, 0.48, stone(), [0, rand() * 0.4, 0]);
      }
    }
  };
  // Blocks tumbled down in the grass round about.
  const rubble = (count, near, far) => {
    for (let k = 0; k < count; k++) {
      const a = rand() * Math.PI * 2, d = near + rand() * (far - near), u = Math.cos(a) * d, v = Math.sin(a) * d;
      const s = 0.4 + rand() * 0.5, g0 = ground(u, v);
      block(u, v, g0 + s * 0.25, s * 1.4, s, s * 1.1, rand() < 0.2 ? MOSS[0] : stone(), [rand() * 0.4, rand() * 3, rand() * 0.4]);
      if (s > 0.7) solid(u, v, s * 0.6, s * 0.5, g0 - 0.2, g0 + s * 0.7, 0);
    }
  };
  // A raised floor of big slabs over (u1..u2, v1..v2), level at its highest ground and a step up: gives its top.
  const platform = (u1, u2, v1, v2, rise = 0.5) => {
    let lo = Infinity, hi = -Infinity;
    for (const [u, v] of [[u1, v1], [u2, v1], [u1, v2], [u2, v2], [(u1 + u2) / 2, (v1 + v2) / 2]]) {
      const g = ground(u, v);
      lo = Math.min(lo, g);
      hi = Math.max(hi, g);
    }
    const top = hi + rise;
    for (let u = u1; u < u2 - 0.01; u += 2) {
      for (let v = v1; v < v2 - 0.01; v += 2) {
        const su = Math.min(2, u2 - u), sv = Math.min(2, v2 - v);
        block(u + su / 2, v + sv / 2, (lo - 0.5 + top) / 2 - (rand() < 0.15 ? 0.06 : 0), su - 0.04, top - lo + 0.5, sv - 0.04, rand() < 0.1 ? MOSS[2] : stone());
      }
    }
    solid((u1 + u2) / 2, (v1 + v2) / 2, (u2 - u1) / 2, (v2 - v1) / 2, lo - 0.5, top);
    return top;
  };
  // Steps down from a platform's edge at u = edge, out along -u, across v1..v2.
  const stepsDown = (edge, v1, v2, top) => {
    const g0 = ground(edge - 1, (v1 + v2) / 2);
    const n = Math.max(1, Math.ceil((top - g0) / 0.28));
    for (let k = 0; k < n; k++) {
      const y = top - (k + 1) * ((top - g0) / n), u = edge - 0.45 - k * 0.5;
      block(u, (v1 + v2) / 2, (y + g0 - 0.4) / 2 + 0.01, 0.5, y - g0 + 0.4, v2 - v1, stone());
      solid(u, (v1 + v2) / 2, 0.25, (v2 - v1) / 2, g0 - 0.4, y);
    }
  };

  switch (site.kind) {
    case 1: {
      // A lone watchtower on a rise, a stump of wall round it.
      const top = tower(-3, -3, 6, 10 + rand() * 4, true);
      wallRun(-7, -6, -7, 3, 0.6, ruined(1.3));
      wallRun(-7, -6, 2, -7, 0.6, ruined(1.1));
      rubble(10, 4.5, 8.5);
      chest(top.u, top.v, top.y, 'tower', true);
      if (rand() < 0.5) chest(-5.5, 4.5, ground(-5.5, 4.5), 'foot');
      break;
    }
    case 2: {
      // A gatehouse on an old road: the arch, two squat towers either side, the walls going off from them.
      gateway(0, 0, 1.75);
      tower(-2, 2.4, 4, 5 + rand() * 2, false);
      tower(-2, -6.4, 4, 5 + rand() * 2, false);
      wallRun(0, 6.4, 0, 13, 0.8, ruined(3));
      wallRun(0, -6.4, 0, -13, 0.8, ruined(3));
      cobbles(-11, 11, -1.3, 1.3, 0.3);
      rubble(10, 5, 11);
      chest(3, -3.2, ground(3, -3.2), 'gate');
      if (rand() < 0.6) chest(-1, 4.2, ground(-1, 4.2), 'guard', true);
      break;
    }
    case 3: {
      // A temple: a stepped platform, two rows of columns (a few still under their lintels), an altar at the back.
      const top = platform(-7, 7, -4.5, 4.5, 0.7);
      stepsDown(-7, -3, 3, top);
      const tops = [];
      for (const v of [-3.3, 3.3]) for (let k = 0; k < 6; k++) tops.push([-5.5 + k * 2.2, v, column(-5.5 + k * 2.2, v, top, 4.2, 0.45)]);
      for (let k = 0; k + 1 < tops.length; k++) {
        const [u1, v1, t1] = tops[k], [u2, v2, t2] = tops[k + 1];
        if (t1 && t2 && v1 === v2) block((u1 + u2) / 2, v1, Math.min(t1, t2) + 0.25, 3.2, 0.5, 0.9, stone());
      }
      block(5.6, 0, top + 0.5, 1.2, 1.0, 2.4, stone());
      solid(5.6, 0, 0.6, 1.2, top, top + 1.0);
      chest(4.4, 0, top, 'altar', true);
      rubble(8, 8, 11);
      break;
    }
    case 4: {
      // A great hall: long walls with tall window gaps, a door each end, a row of columns down its middle.
      const L = 12 + rand() * 3, W = 6;
      const windows = [[0.15, 0.22, 1.6, 3.4], [0.39, 0.46, 1.6, 3.4], [0.54, 0.61, 1.6, 3.4], [0.78, 0.85, 1.6, 3.4]];
      wallRun(-L, -W, L, -W, 0.8, ruined(4.6, 0.9), { gaps: windows });
      wallRun(-L, W, L, W, 0.8, ruined(4.6, 0.9), { gaps: windows });
      wallRun(-L, -W, -L, W, 0.8, ruined(5.2, 0.95), { gaps: [[0.4, 0.6, 0, 2.8]] });
      wallRun(L, -W, L, W, 0.8, ruined(4, 0.95), { gaps: [[0.42, 0.58, 0, 2.4]] });
      for (let u = -L + 4; u < L - 2; u += 4) column(u, 0, null, 4.4, 0.4);
      cobbles(-L - 6, -L, -1.2, 1.2, 0.35);
      rubble(14, W + 2, W + 9);
      chest(L - 2, W - 1.6, ground(L - 2, W - 1.6), 'dais', true);
      chest(-L + 2.5, -W + 1.6, ground(-L + 2.5, -W + 1.6), 'hall');
      break;
    }
    case 5: {
      // A chapel: a small nave, its end rounded into an apse, an altar stone, a gable still standing over the door.
      const pts = [[-5, -3], [4, -3], [5.8, -2], [6.6, 0], [5.8, 2], [4, 3], [-5, 3]];
      for (let k = 0; k < pts.length; k++) {
        const [u1, v1] = pts[k], [u2, v2] = pts[(k + 1) % pts.length];
        const door = k === pts.length - 1;
        wallRun(u1, v1, u2, v2, 0.7, door ? () => 5 + rand() * 0.3 : ruined(3.2, 0.9), { gaps: door ? [[0.38, 0.62, 0, 2.6]] : k === 0 || k === 5 ? [[0.45, 0.6, 1.7, 2.9]] : [] });
      }
      block(5, 0, ground(5, 0) + 0.45, 1, 0.9, 2, stone());
      solid(5, 0, 0.5, 1, ground(5, 0) - 0.2, ground(5, 0) + 0.9);
      chest(3.8, 0, ground(3.8, 0), 'altar', true);
      cobbles(-11, -5, -1, 1, 0.4);
      rubble(7, 6.5, 10);
      break;
    }
    case 6: {
      // A castle: a curtain wall round a big bailey, towers at its corners, a keep in the middle, a gate in front.
      const S = 15;
      wallRun(-S, -S, -S, -2.4, 1.0, ruined(4.8));
      wallRun(-S, 2.4, -S, S, 1.0, ruined(4.8));
      wallRun(-S, S, S, S, 1.0, ruined(4.6));
      wallRun(S, S, S, -S, 1.0, ruined(4.6));
      wallRun(S, -S, -S, -S, 1.0, ruined(4.8));
      for (const [u, v] of [[-S - 2, -S - 2], [S - 2, -S - 2], [-S - 2, S - 2], [S - 2, S - 2]]) tower(u, v, 4, 5.5 + rand() * 2.5, false);
      gateway(-S, 0, 2);
      const top = tower(-3, -3, 7, 12 + rand() * 3, true);
      cobbles(-S - 8, -3, -1.4, 1.4, 0.4);
      rubble(12, S + 3, S + 8);
      chest(top.u, top.v, top.y, 'keep', true);
      chest(-S + 3, S - 3, ground(-S + 3, S - 3), 'bailey');
      if (rand() < 0.6) chest(S - 3, -S + 3, ground(S - 3, -S + 3), 'store');
      break;
    }
    case 7: {
      // An abandoned hamlet: the low walls of a few cottages round an old well.
      const houses = [[-10, -8], [5, -10], [-9, 6], [6, 6]];
      houses.forEach(([u, v], n) => {
        const a = 4 + rand() * 2.5, b = 3.5 + rand() * 1.5;
        wallLoop([[u, v], [u + a, v], [u + a, v + b], [u, v + b]], 0.6, ruined(1.8 + rand(), 0.75), (k) => (k === 0 ? { gaps: [[0.35, 0.6, 0, 2.2]] } : {}));
        if (n % 2 === 0 || rand() < 0.4) chest(u + a - 1, v + b - 1, ground(u + a - 1, v + b - 1), `house${n}`, n === 0);
      });
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2, u = Math.cos(a) * 1.15, v = Math.sin(a) * 1.15;
        block(u, v, ground(u, v) + 0.3, 0.7, 1.0, 0.45, stone(), [0, -a + Math.PI / 2, 0]);
      }
      solid(0, 0, 1.4, 1.4, ground(0, 0) - 0.2, ground(0, 0) + 0.8);
      block(0, 0, ground(0, 0) + 0.79, 1.7, 0.02, 1.7, 0x1c2a30);
      cobbles(-4, 4, -1, 1, 0.55);
      rubble(10, 3, 15);
      break;
    }
    case 8: {
      // A ring of standing stones, some fallen, some still under lintels; a flat stone in the middle.
      const n = 10 + Math.floor(rand() * 4), R = 6, up = [];
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2, u = Math.cos(a) * R, v = Math.sin(a) * R, g0 = ground(u, v);
        const h = 3.2 + rand() * 1.2, fallen = rand() < 0.25;
        if (fallen) {
          const lay = a + (rand() - 0.5) * 0.8;
          block(u + Math.cos(lay) * 1.6, v + Math.sin(lay) * 1.6, g0 + 0.3, h, 0.6, 1.0, stone(), [0, -lay, 0]);
          up.push(0);
        } else {
          block(u, v, g0 + h / 2 - 0.4, 1.0, h, 0.6, rand() < 0.2 ? MOSS[3] : stone(), [0, -a, (rand() - 0.5) * 0.08]);
          solid(u, v, 0.5, 0.3, g0 - 0.4, g0 + h - 0.4, -a);
          up.push(g0 + h - 0.4);
        }
      }
      for (let k = 0; k < n; k++) {
        const t1 = up[k], t2 = up[(k + 1) % n];
        if (!t1 || !t2 || rand() < 0.4) continue;
        const a = ((k + 0.5) / n) * Math.PI * 2, l = 2 * R * Math.sin(Math.PI / n) + 1;
        block(Math.cos(a) * R, Math.sin(a) * R, Math.min(t1, t2) + 0.25, 0.7, 0.5, l, stone(), [0, -a, 0]);
      }
      const g0 = ground(0, 0);
      block(0, 0, g0 + 0.3, 2.4, 0.6, 1.4, stone());
      solid(0, 0, 1.2, 0.7, g0 - 0.2, g0 + 0.6);
      chest(0, 1.5, ground(0, 1.5), 'circle', true);
      break;
    }
    case 9: {
      // An aqueduct: a row of tall piers, arches between them, the channel along their tops (broken off in places).
      const N = 9, gap = 4.2, Rr = (gap - 1.2) / 2;
      let hi = -Infinity;
      for (let k = 0; k < N; k++) hi = Math.max(hi, ground((k - (N - 1) / 2) * gap, 0));
      const Y = hi + 6 + rand() * 2, standing = [];
      for (let k = 0; k < N; k++) {
        const u = (k - (N - 1) / 2) * gap, whole = rand() < 0.75;
        pier(u, 0, whole ? Y : ground(u, 0) + 1 + rand() * 3, 1.2);
        standing.push(whole);
      }
      for (let k = 0; k + 1 < N; k++) {
        if (!standing[k] || !standing[k + 1]) continue;
        const u = (k - (N - 1) / 2 + 0.5) * gap;
        arch(u, 0, Y - Rr - 0.35, Rr, false);
        if (rand() < 0.75) {
          block(u, 0, Y + 0.3, gap + 0.02, 0.6, 1.5, stone());
          for (const side of [-1, 1]) block(u, side * 0.6, Y + 0.85, gap, 0.5, 0.3, rand() < 0.3 ? moss() : stone());
          solid(u, 0, gap / 2, 0.75, Y - 0.2, Y + 0.6);
        }
      }
      rubble(14, 3, 18);
      chest(-gap * 2 + 1.4, 1.8, ground(-gap * 2 + 1.4, 1.8), 'pier');
      if (rand() < 0.5) chest(gap * 3 - 1.4, -1.8, ground(gap * 3 - 1.4, -1.8), 'pier2', true);
      break;
    }
    case 10: {
      // The Lost Keep: a curtain wall, whole and high, round a great court;
      // towers at its corners and either side of its gate; the great keep
      // tower in the middle, a stair winding up round it to its top, and the
      // altar up there.
      const S = 22, W = 7.2, whole = () => W;
      wallRun(-S, -S, -S, -2.6, 1.4, whole, { mossy: 0.2 });
      wallRun(-S, 2.6, -S, S, 1.4, whole, { mossy: 0.2 });
      wallRun(-S, S, S, S, 1.4, whole, { mossy: 0.2 });
      wallRun(S, S, S, -S, 1.4, whole, { mossy: 0.2 });
      wallRun(S, -S, -S, -S, 1.4, whole, { mossy: 0.2 });
      for (const [u, v] of [[-S - 3, -S - 3], [S - 3, -S - 3], [-S - 3, S - 3], [S - 3, S - 3]]) tower(u, v, 6, 12 + rand() * 2, false);
      tower(-S - 4, -8.6, 6, 13, false);
      tower(-S - 4, 2.6, 6, 13, false);
      // (Over the gate: a high arch, and a walk of stone across from tower to tower.)
      const gg = ground(-S, 0);
      arch(-S, 0, gg + 5.2, 2.6);
      block(-S, 0, gg + W - 0.3, 1.6, 0.8, 6.2, stone());
      // The great keep in the middle: square and whole, 17 m to its flat
      // top, a stair winding up round its outside, the altar up on its top.
      const K = 5, P = 17, gk = ground(0, 0), keepTop = gk + P;
      wallRun(-K, -K, K, -K, 0.9, () => P, { gaps: [[0.4, 0.6, 0, 2.6]], mossy: 0.15 });
      wallRun(K, -K, K, K, 0.9, () => P, { gaps: [[0.45, 0.55, 8, 9.4]], mossy: 0.15 });
      wallRun(K, K, -K, K, 0.9, () => P, { gaps: [[0.45, 0.55, 12, 13.4]], mossy: 0.15 });
      wallRun(-K, K, -K, -K, 0.9, () => P, { mossy: 0.15 });
      // (Its top: flags on a slab, and a parapet round three sides; open on the side the stair comes up.)
      block(0, 0, keepTop - 0.15, 2 * K + 0.6, 0.3, 2 * K + 0.6, stone());
      solid(0, 0, K + 0.3, K + 0.3, keepTop - 0.6, keepTop);
      for (const [u1, v1, u2, v2] of [[-K, -K, K, -K], [K, -K, K, K], [K, K, -K, K]]) {
        const len = Math.hypot(u2 - u1, v2 - v1), n = Math.round(len / 1.0);
        for (let k = 0; k < n; k++) {
          if (k % 2) continue; // (merlons and gaps)
          const t = (k + 0.5) / n, u = u1 + (u2 - u1) * t, v = v1 + (v2 - v1) * t;
          block(u, v, keepTop + 0.5, u1 === u2 ? 0.6 : 1.0, 1.0, u1 === u2 ? 1.0 : 0.6, stone());
          solid(u, v, u1 === u2 ? 0.3 : 0.5, u1 === u2 ? 0.5 : 0.3, keepTop, keepTop + 1);
        }
      }
      // The stair: round the outside, once, from the ground at the north-west
      // corner up to the top there (gentle: a long way round for the height).
      const h = K + 0.95, perim = 8 * h, start = 1.6, n = Math.ceil(P / 0.3), run = (perim - start) / n;
      const along = (d) => {
        // (A point on the square round the keep, `d` along it from the corner (-h, h), going +u first.)
        const side = Math.min(3, Math.floor(d / (2 * h))), t = d - side * 2 * h;
        return [[-h + t, h, 0], [h, h - t, 1], [h - t, -h, 0], [-h, -h + t, 1]][side];
      };
      for (let k = 0; k < n; k++) {
        const [u, v, across] = along(start + run * (k + 0.5)), stepTop = gk + ((k + 1) * P) / n, g0 = Math.min(ground(u, v), gk) - 0.3;
        block(u, v, (g0 + stepTop) / 2, across ? 1.2 : run + 0.06, stepTop - g0, across ? run + 0.06 : 1.2, stone());
        solid(u, v, across ? 0.6 : run / 2 + 0.02, across ? run / 2 + 0.02 : 0.6, g0, stepTop);
      }
      // (Landings at the turns.)
      for (const [u, v, k] of [[h, h, 0.25], [h, -h, 0.5], [-h, -h, 0.75], [-h, h, 1]]) {
        const top = gk + Math.min(P, P * ((k * perim - start) / (perim - start))), g0 = Math.min(ground(u, v), gk) - 0.3;
        block(u, v, (g0 + top) / 2, 1.2, top - g0, 1.2, stone());
        solid(u, v, 0.6, 0.6, g0, top);
      }
      // (Over the gate: no door now; the way stands open.)
      // The court: cobbled from the gate to the keep's door.
      cobbles(-S + 1, -K, -1.5, 1.5, 0.15);
      cobbles(-S - 26, -S - 2, -1.6, 1.6, 0.25);
      rubble(10, S + 8, S + 16);
      // Up on the top: the altar, wanting the trophies of the great beasts (see Game.#offer).
      chest(1.5, 0, keepTop, 'altar', false, { altar: true, rot: rot });
      chest(S - 3, S - 3, ground(S - 3, S - 3), 'court', true);
      break;
    }
    default: {
      // A stronghold: a courtyard's walls, a tower in its far corner, a gateway standing before it, columns down one side.
      const S = 8, T = 0.7;
      wallRun(-S, -S, S, -S, T, ruined(2.6 + rand() * 1.4));
      wallRun(S, -S, S, 3, T, ruined(2.4 + rand() * 1.4));
      wallRun(-S, S, 3, S, T, ruined(2.2 + rand() * 1.6));
      wallRun(-S, -S, -S, -2.2, T, ruined(1.6 + rand()));
      wallRun(-S, 2.2, -S, S, T, ruined(1.6 + rand()));
      const top = tower(3, 3, 5, 8 + rand() * 3, true);
      gateway(-S - 5);
      for (let k = 0; k < 4; k++) column(-5 + k * 3.2, -4.6);
      cobbles(-S - 14, 2, -1.3, 1.3, 0.3);
      rubble(14, 6, 12);
      chest(-3.5, 4.6, ground(-3.5, 4.6), 'yard');
      if (rand() < 0.5) chest(1.5, -6.6, ground(1.5, -6.6), 'wall');
      chest(top.u, top.v, top.y, 'tower', true);
    }
  }
}

export function createRuinLayer(config) {
  const material = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const fits = new Map(); // "I,K" -> the site, or null
  // (`budget`: how many more places may be worked out now; past it, unknown ones are skipped, and `layer.more` says so.)
  const site = (I, K, generator, budget = null) => {
    const key = `${I},${K}`;
    if (!fits.has(key)) {
      if (budget) {
        if (budget.left <= 0) return (layer.more = true), null;
        budget.left--;
      }
      const s = ruinSite(I, K, generator.seed), keep = keepSite(generator, config.seaLevel);
      // (None crowding the Lost Keep.)
      fits.set(key, s && Math.hypot(s.x - keep.x, s.z - keep.z) > 160 && ruinFits(s, generator, config.seaLevel) ? s : null);
    }
    return fits.get(key);
  };
  const solids = new Map(); // "cx,cz" -> [{ x, z, hx, hz, rot, bottom, top, r }] (world)
  const gates = new Set(); // (the Keep's sealed gate, while it's built)
  const rough = new Map(); // (the big map's rough guesses: see sitesRoughly)
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
    keepOpen: false, // (the Lost Keep's gate: see openKeep)

    /** The Lost Keep's sealed gate opened (or shut again: a new world). */
    openKeep(open) {
      layer.keepOpen = open;
      for (const g of gates) g.visible = !open;
    },

    /** Where the Lost Keep is. */
    keep(generator) {
      return keepSite(generator, config.seaLevel);
    },

    /** The ruins near (x, z), within `r` metres: [{ x, z, key, ... }] (only those the land takes). */
    sitesNear(x, z, r, generator, budget = null) {
      const out = [];
      const left = budget === null ? null : { left: budget };
      if (left) layer.more = false;
      for (let K = Math.floor((z - r) / CELL); K <= Math.floor((z + r) / CELL); K++) {
        for (let I = Math.floor((x - r) / CELL); I <= Math.floor((x + r) / CELL); I++) {
          const s = site(I, K, generator, left);
          if (s && Math.hypot(s.x - x, s.z - z) <= r) out.push(s);
        }
      }
      const keep = keepSite(generator, config.seaLevel);
      if (Math.hypot(keep.x - x, keep.z - z) <= r) out.push(keep);
      return out;
    },

    /**
     * For the big map (testing): the ruins over a wide stretch, judged
     * roughly from the land before its rivers (quick, however far: the
     * real ones are judged closer, when they're built). A few new places
     * each call (`budget`); `layer.more` while some are left.
     */
    sitesRoughly(x, z, r, generator, labelAt) {
      // (Judged from the map's own drawing: no ruin on water, a mountainside or the ice.)
      const NOT = new Set(['Ocean', 'Coral reef', 'Kelp forest', 'Lake', 'Mountains', 'Snowy peaks', 'Volcano', 'Sea cliffs', 'Wetlands', 'Marsh']);
      const out = [], keep = keepSite(generator, config.seaLevel);
      layer.more = false;
      for (let K = Math.floor((z - r) / CELL); K <= Math.floor((z + r) / CELL); K++) {
        for (let I = Math.floor((x - r) / CELL); I <= Math.floor((x + r) / CELL); I++) {
          const key = `${I},${K}`;
          let s = fits.has(key) ? fits.get(key) : rough.get(key);
          if (s === undefined) {
            const c = ruinSite(I, K, generator.seed);
            if (c) {
              const label = labelAt?.(c.x, c.z);
              if (label === null || label === undefined) continue; // (its part of the map not drawn yet)
              s = Math.hypot(c.x - keep.x, c.z - keep.z) > 160 && !NOT.has(label) ? c : null;
            } else s = null;
            rough.set(key, s);
          }
          if (s && Math.hypot(s.x - x, s.z - z) <= r) out.push(s);
        }
      }
      if (Math.hypot(keep.x - x, keep.z - z) <= r) out.push(keep);
      return out;
    },

    /** The ruins by their keys ("I,K", or 'keep'): those you've been to, with no working out. */
    sitesOf(keys, generator) {
      const out = [];
      for (const key of keys) {
        if (key === 'keep') out.push(keepSite(generator, config.seaLevel));
        else {
          const [I, K] = key.split(',').map(Number);
          const s = Number.isFinite(I) && Number.isFinite(K) ? ruinSite(I, K, generator.seed) : null;
          if (s) out.push(s);
        }
      }
      return out;
    },

    /** The top of any of a ruin's stone you'd stand on at (x, z), from your feet at `feetY`, or -Infinity. */
    surfaceAt(x, z, feetY) {
      let top = -Infinity;
      for (const b of near(x, z)) {
        if (b.top > feetY + 0.65 || b.top < top || (b.gate && layer.keepOpen)) continue;
        const [u, v] = frame(b, x, z);
        if (Math.abs(u) <= b.hx && Math.abs(v) <= b.hz) top = b.top;
      }
      return top;
    },

    /** Pushes a circle (you, walking, feet at `feetY`) out of the ruins' stone. */
    collide(position, radius, feetY) {
      for (const b of near(position.x, position.z)) {
        if (feetY > b.top - 0.6 || feetY + 1.75 < b.bottom) continue; // (up on it, or under it)
      if (b.gate && layer.keepOpen) continue; // (the Keep's gate, open)
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
      const parts = [], list = [], gateParts = [];
      const keep = keepSite(generator, config.seaLevel);
      if (Math.floor(keep.x / size) === cx && Math.floor(keep.z / size) === cz) buildRuin(keep, generator, x0, z0, parts, list, lod === 0 ? layer.onChest : null, gateParts);
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
      if (gateParts.length) {
        // (The Keep's sealed gate: its own mesh, gone once it's opened.)
        const g = mergeGeometries(gateParts);
        g.computeVertexNormals();
        const gate = new Mesh(g, material);
        gate.name = 'keep gate';
        gate.castShadow = gate.receiveShadow = true;
        gate.visible = !layer.keepOpen;
        group.add(gate);
        gates.add(gate);
        group.userData.gate = gate;
      }
      group.userData.key = `${cx},${cz}`;
      group.userData.solids = list;
      solids.set(group.userData.key, list);
      return group;
    },

    dispose(group) {
      if (solids.get(group.userData.key) === group.userData.solids) solids.delete(group.userData.key);
      if (group.userData.gate) gates.delete(group.userData.gate);
      for (const mesh of group.children) mesh.geometry.dispose();
    },
  };
  return layer;
}
