import { Color } from 'three';
import { hash2 } from '../noise/random.js';

// The water of the rivers, streams and ponds over a chunk (see
// RiverLayer), worked out as plain arrays so a chunk's worker can do it.

const DEEP = new Color(0x4fbfc4).lerp(new Color(0x2c67b0), 0.45);
const SHALLOW = new Color(0x4fbfc4).lerp(new Color(0x2c67b0), 0.15);
// The lake and sea's colours (as WaterLayer), which a river turns into at its mouth.
const LAKE_SHALLOW = new Color(0x4fbfc4);
const LAKE_DEEP = new Color(0x2c67b0);
// Tinted ponds: alpine lakes (milky turquoise), hot springs (clear blue, bright at the rim).
const TINTS = [null, [new Color(0x57c9bf), new Color(0x2b98a0)], [new Color(0x7fd6d0), new Color(0x1f86c4)]];
const color = new Color();
const lakeColor = new Color();
const GRID = 2; // metres between the surface's vertices (close by: further off, see riverGrid)
// The surface runs on under the banks until the land stands LIFT above it,
// or at most REACH metres past the channel's edge (see riverData).
const LIFT = 0.5;
const REACH = 4.5;

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * Spray for each waterfall in the chunk: cubes pouring over the lip, and
 * splashing up at the foot; and over the bigger falls a mist, puffs of it
 * billowing up from the foot (`mist`: x, y, z; `mistLife`: seconds, phase,
 * size, rise per life).
 */
/** How hard a waterfall at (x, z) freezes in the depth of winter (0..1): only in the coldest lands. */
export function fallIce(generator, x, z) {
  return smoothstep(0.62, 0.8, generator.getSeasonality(x, z));
}

function sprayData(rivers, x0, z0, chunkSize, generator) {
  const starts = [], velocities = [], lives = [], mist = [], mistLife = [], sprayIce = [], mistIce = [];
  let n = 0;
  for (const course of rivers) {
    const P = course.points;
    for (let i = 0; i < P.length - 1; i++) {
      const a = P[i], b = P[i + 1];
      const run = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      const fall = a.level - b.level;
      if (fall / run < 0.4 || fall < 0.8) continue;
      if (a.x < x0 || a.x >= x0 + chunkSize || a.z < z0 || a.z >= z0 + chunkSize) continue;
      const ux = (b.x - a.x) / run, uz = (b.z - a.z) / run;
      const width = Math.max(1.5, Math.max(a.width, b.width) * 0.8);
      let seed = Math.floor(a.x * 13 + a.z * 7) >>> 0;
      const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
      const drop = Math.sqrt((2 * (fall + 0.3)) / 9.8); // seconds to fall
      const pour = Math.round(10 + width * 4), splash = Math.round(12 + width * 4);
      // (In the coldest lands the falls freeze solid in the depth of winter.)
      const ice = fallIce(generator, a.x, a.z);
      for (let k = 0; k < pour + splash; k++) sprayIce.push(ice);
      for (let k = 0; k < pour; k++) {
        const across = (rand() - 0.5) * width;
        starts.push(a.x - x0 - uz * across, a.level + 0.1, a.z - z0 + ux * across);
        const v = 1.2 + rand() * 1.2;
        velocities.push(ux * v, rand() * 0.4, uz * v);
        lives.push(drop, rand(), 0.22 + rand() * 0.25);
      }
      for (let k = 0; k < splash; k++) {
        const across = (rand() - 0.5) * width * 1.2;
        const out = rand() * 1.5;
        starts.push(b.x - x0 - uz * across + ux * out, b.level + 0.05, b.z - z0 + ux * across + uz * out);
        const up = 1.5 + rand() * 2.5 + Math.min(2, fall * 0.4);
        const a2 = rand() * Math.PI * 2, side = 0.6 + rand() * 1.6;
        velocities.push(Math.cos(a2) * side + ux * 0.8, up, Math.sin(a2) * side + uz * 0.8);
        lives.push((2 * up) / 9.8, rand(), 0.15 + rand() * 0.25);
      }
      n += pour + splash;
      if (fall > 1.5) {
        const puffs = Math.round(5 + Math.min(12, fall * 1.3 + width));
        for (let k = 0; k < puffs; k++) {
          const across = (rand() - 0.5) * width * 1.3;
          const out = 0.5 + rand() * (2 + fall * 0.25);
          mist.push(b.x - x0 - uz * across + ux * out, b.level + 0.2, b.z - z0 + ux * across + uz * out);
          mistLife.push(3 + rand() * 3, rand(), 1.6 + rand() * 1.4 + fall * 0.12, 1.5 + rand() * 1.5 + fall * 0.3);
          mistIce.push(ice);
        }
      }
    }
  }
  if (!n) return null;
  const out = { starts: new Float32Array(starts), velocities: new Float32Array(velocities), lives: new Float32Array(lives), ice: new Float32Array(sprayIce) };
  if (mist.length) Object.assign(out, { mist: new Float32Array(mist), mistLife: new Float32Array(mistLife), mistIce: new Float32Array(mistIce) });
  return out;
}

/**
 * How far apart (m) the river water's grid points are over a chunk whose
 * land is drawn `resolution` cells a side: every 2 m close by, and further
 * off half the land's cells (4 m over 8 m cells, out to 16 m over 32 m).
 */
export function riverGrid(config, resolution) {
  return Math.max(GRID, config.chunkSize / resolution / 2);
}

/**
 * The river water over chunk (cx, cz): the surface's faces { positions,
 * colors (rgba), flows, streaks, freezes, mouths } and its waterfalls' spray, or
 * null if there's none.
 *
 * The surface is sampled on a grid (`grid` metres: see riverGrid), flat at the water's level. It runs
 * on a little way under the banks and is then cut off cleanly along a
 * line worked out between the grid's points (never along the grid's own
 * steps): where the land has risen `LIFT` above the water, or at the
 * latest `REACH` metres past the channel's edge. So the shoreline you see is
 * where the land itself comes up through the water, and the cut edge lies
 * hidden under the bank, at every level of detail (the land is the same
 * function of x and z on both sides of a chunk's border, so neighbouring
 * chunks cut their water along the same line).
 */
export function riverData(generator, config, cx, cz, grid = GRID) {
  const { chunkSize, seaLevel } = config;
  const rivers = generator.rivers;
  const x0 = cx * chunkSize, z0 = cz * chunkSize;
  const courses = rivers.inBox(x0, z0, x0 + chunkSize, z0 + chunkSize);
  // (And the Cascades' falls, their pools and the falls themselves: see fallsWater, fallCurtains.)
  const falls = generator.landmarks?.fallsInBox(x0, z0, x0 + chunkSize, z0 + chunkSize) ?? false;
  if (!courses.length && !falls) return null;

  // The water at each grid point: its level, current, white water, how far
  // in from the channel's edge, how much it has given way to a lake or the
  // sea it runs into, and `keep` (>= 0 where the water shows: see above).
  const cells = chunkSize / grid;
  const n = cells + 1;
  const level = new Float32Array(n * n).fill(NaN);
  const keep = new Float32Array(n * n).fill(-1);
  const flow = new Float32Array(n * n * 4);
  const rgba = new Float32Array(n * n * 4);
  const ice = new Float32Array(n * n); // still water in cold lands freezes in winter
  const mouth = new Float32Array(n * n); // 1 in the river, 0 where it has become the lake or sea
  // (Points out to `search` past the edge get a value too: far enough that
  // every face with a corner beyond it is cut away whole, more than a face's
  // diagonal past REACH.)
  const search = REACH + 1.6 * grid;
  let any = false;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = x0 + i * grid, z = z0 + j * grid;
      const w = rivers.waterAt(x, z, search);
      if (!w) continue;
      const k = j * n + i;
      // (Well inside a channel or pond the bed always lies below the water:
      // the land there needn't be looked at, unless for the lake below.)
      const inside = w.inset > 1.5 && w.level >= seaLevel + 0.35;
      const ground = inside ? -Infinity : generator.getHeight(x, z);
      keep[k] = Math.min(w.level + LIFT - ground, REACH + w.inset);
      if (keep[k] >= 0) any = true;
      // Where it has come down to the level of the lake or sea it runs
      // into, out over that water, it gives way to it: fading out, so the
      // two meet with no edge between them (the lake's own sheet is there:
      // see waterData). (Over a creek's narrow trench the lake's sheet, on
      // its coarser grid, may not reach, so there it gives way only out over
      // the lake itself, where the land lay under water before any river.)
      let lake = 0;
      if (w.level < seaLevel + 0.35) lake = smoothstep(seaLevel + 0.35, seaLevel + 0.1, w.level) * smoothstep(seaLevel + 0.2, seaLevel - 0.8, w.big ? ground : generator.landHeight(x, z));
      mouth[k] = 1 - lake;
      // (Out over the lake it sits a hair higher, clear of the lake's ripples.)
      level[k] = w.level + 0.03 + 0.07 * lake;
      const drop = Math.max(0, w.drop);
      flow[k * 4] = w.along;
      flow[k * 4 + 1] = Math.min(1.5, w.across);
      flow[k * 4 + 2] = w.ripple ? 0.4 : w.pond ? 0 : (0.6 + Math.min(2.4, drop * 6)) * (1 - lake); // (a falls' pool: its ripples running out from the fall)
      flow[k * 4 + 3] = Math.min(1, Math.max(0, (drop - 0.25) / 0.5));
      if (w.pond) ice[k] = w.tint === 2 ? 0 : generator.getSeasonality(x, z); // (hot springs never freeze)
      else if (drop > 0.25 && w.tint !== 2) ice[k] = fallIce(generator, x, z) * Math.min(1, (drop - 0.25) / 0.3); // (and falls, where it's cold enough)
      // Its colour: deeper out from the banks, the lake's colours where it
      // gives way to one; see-through, more so at the edges. (Smooth from
      // point to point: no patchwork of faces.)
      const deep = smoothstep(0, 3, w.inset);
      if (w.tint) {
        color.copy(TINTS[w.tint][0]).lerp(TINTS[w.tint][1], deep);
      } else {
        color.copy(SHALLOW).lerp(DEEP, deep);
        if (lake > 0) color.lerp(lakeColor.copy(LAKE_SHALLOW).lerp(LAKE_DEEP, smoothstep(-1, 16, w.level - ground)), lake);
      }
      rgba[k * 4] = color.r;
      rgba[k * 4 + 1] = color.g;
      rgba[k * 4 + 2] = color.b;
      rgba[k * 4 + 3] = 0.5 + 0.18 * deep;
    }
  }
  if (!any && !falls) return null;

  const positions = [];
  const colors = [];
  const flows = [];
  const streaks = [];
  const freezes = [];
  const mouths = [];
  const seed = generator.seed ^ 0x3c6ef372;
  // A corner of a face: grid point `a`, or the point a fraction `t` of the
  // way from `a` to `b` (where the cut crosses the edge between them).
  const put = (a, b, t, streaky) => {
    const s = 1 - t;
    positions.push(((a % n) * s + (b % n) * t) * grid, level[a] * s + level[b] * t, (Math.floor(a / n) * s + Math.floor(b / n) * t) * grid);
    for (let q = 0; q < 4; q++) colors.push(rgba[a * 4 + q] * s + rgba[b * 4 + q] * t);
    for (let q = 0; q < 4; q++) flows.push(flow[a * 4 + q] * s + flow[b * 4 + q] * t);
    streaks.push(streaky);
    freezes.push(ice[a] * s + ice[b] * t);
    mouths.push(smoothstep(0.05, 0.85, mouth[a] * s + mouth[b] * t));
  };
  const poly = [];
  const tri = (a, b, c) => {
    if (Number.isNaN(level[a]) || Number.isNaN(level[b]) || Number.isNaN(level[c])) return; // (well away from any water)
    if (keep[a] < 0 && keep[b] < 0 && keep[c] < 0) return;
    if (mouth[a] === 0 && mouth[b] === 0 && mouth[c] === 0) return; // (well out in the lake: its own water)
    // (Never a sheet hung between the water at the top of one of the
    // Cascades' falls and the pool at its foot: the fall's own water is there.)
    if (falls && Math.max(level[a], level[b], level[c]) - Math.min(level[a], level[b], level[c]) > 2) return;
    // Where two rivers meet, their distances along don't match: no
    // streaks on the few faces that straddle the two.
    const spread = Math.max(flow[a * 4], flow[b * 4], flow[c * 4]) - Math.min(flow[a * 4], flow[b * 4], flow[c * 4]);
    const streaky = spread < 8 ? 1 : 0;
    // The part of the face where the water shows (keep >= 0): the face
    // itself, or cut off along the line where keep is 0 (a triangle, or a
    // four-sided piece split in two).
    poly.length = 0;
    const corners = [a, b, c];
    for (let e = 0; e < 3; e++) {
      const p = corners[e], q = corners[(e + 1) % 3];
      if (keep[p] >= 0) poly.push(p, p, 0);
      if (keep[p] >= 0 !== keep[q] >= 0) poly.push(p, q, keep[p] / (keep[p] - keep[q]));
    }
    for (let v = 3; v + 3 < poly.length; v += 3) {
      put(poly[0], poly[1], poly[2], streaky);
      put(poly[v], poly[v + 1], poly[v + 2], streaky);
      put(poly[v + 3], poly[v + 4], poly[v + 5], streaky);
    }
  };
  for (let j = 0; j < cells; j++) {
    for (let i = 0; i < cells; i++) {
      const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
      const gi = cx * cells + i, gj = cz * cells + j;
      if (hash2(gi, gj, seed + 1) < 0.5) {
        tri(a, c, d);
        tri(a, d, b);
      } else {
        tri(a, c, b);
        tri(b, c, d);
      }
    }
  }
  const drops = falls ? generator.landmarks.dropsIn(x0, z0, x0 + chunkSize, z0 + chunkSize) : [];
  for (const d of drops) fallCurtain(generator, d, x0, z0, { positions, colors, flows, streaks, freezes, mouths });
  if (!positions.length) return null;
  return {
    positions: new Float32Array(positions),
    colors: new Float32Array(colors),
    flows: new Float32Array(flows),
    streaks: new Float32Array(streaks),
    freezes: new Float32Array(freezes),
    mouths: new Float32Array(mouths),
    spray: grid <= GRID ? joinSpray(sprayData(courses, x0, z0, chunkSize, generator), fallsSpray(generator, drops, x0, z0)) : null,
  };
}

/**
 * A Cascades fall (see LandmarkSites: a drop) as the river's own water,
 * added to the chunk's surface: a curtain pouring from the lip, out over
 * the rock and down into the pool, rounded across (thicker in the middle,
 * as falling water is), spreading as it falls, and behind it a second,
 * darker sheet, so it has depth from any side. Smooth and glassy as it
 * rolls over the lip, then white, the froth racing down it.
 */
function fallCurtain(generator, d, x0, z0, out) {
  const px = -d.dz, pz = d.dx, U = 9 + Math.round(d.w / 2), P = d.prof, ice = fallIce(generator, d.x, d.z);
  let seed = Math.floor(d.x * 13 + d.z * 7) >>> 0;
  const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const ph = rand() * 6.28;
  for (const back of [false, true]) {
    const grid = [];
    let along = 0;
    for (let i = 0; i < P.length; i++) {
      const [o, y0] = P[i], v = i / (P.length - 1);
      if (i) along += Math.hypot(o - P[i - 1][0], y0 - P[i - 1][1]);
      const y = i === P.length - 1 ? y0 - 0.5 : y0; // (on down under the pool's water: no seam)
      const half = d.w * (0.5 + 0.35 * v) * (back ? 0.8 : 1);
      const row = [];
      for (let j = 0; j < U; j++) {
        const u = (j / (U - 1)) * 2 - 1;
        // (Bowed out in the middle, rippling, the back sheet a little in behind.)
        const bulge = d.w * (1 - u * u) * (0.12 + 0.22 * v) + 0.18 * Math.sin(u * 3.1 + v * 11 + ph) * v;
        const off = back ? -0.25 - 0.12 * d.w * (1 - u * u) : 0;
        const x = d.x + d.dx * (o + bulge + off) + px * u * half, z = d.z + d.dz * (o + bulge + off) + pz * u * half;
        const white = (back ? 0.55 : 0.92) * smoothstep(0, 0.22, v) + (back ? 0.1 : 0.25) * (1 - smoothstep(0, 0.22, v));
        row.push([x - x0, y, z - z0, along, u * 0.95, white]);
      }
      grid.push(row);
    }
    const col = back ? [0.36, 0.62, 0.68, 0.7] : [0.78, 0.9, 0.94, 0.78];
    const put = (q) => {
      out.positions.push(q[0], q[1], q[2]);
      out.colors.push(...col);
      out.flows.push(q[3], q[4], 3.2, q[5]);
      out.streaks.push(1);
      out.freezes.push(ice);
      out.mouths.push(1);
    };
    for (let i = 0; i + 1 < grid.length; i++) {
      for (let j = 0; j + 1 < U; j++) {
        const a = grid[i][j], b = grid[i][j + 1], c = grid[i + 1][j], e = grid[i + 1][j + 1];
        put(a), put(c), put(b);
        put(b), put(c), put(e);
      }
    }
  }
}

/** Spray off the Cascades' falls: pouring over the lip, splashing up where it lands, mist billowing up from the pool. */
function fallsSpray(generator, drops, x0, z0) {
  if (!drops.length) return null;
  const starts = [], velocities = [], lives = [], mist = [], mistLife = [], ice = [], mistIce = [];
  for (const d of drops) {
    let seed = Math.floor(d.x * 31 + d.z * 17) >>> 0;
    const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    const fall = d.top - d.bottom, px = -d.dz, pz = d.dx, cold = fallIce(generator, d.x, d.z);
    const t = Math.sqrt((2 * Math.min(fall, 4)) / 9.8);
    for (let k = 0; k < 12 + d.w * 3; k++) {
      const u = (rand() - 0.5) * d.w;
      starts.push(d.x - x0 + px * u + d.dx * (d.ledge ?? 0), d.top + 0.1, d.z - z0 + pz * u + d.dz * (d.ledge ?? 0)); // (from the shelf's end, if it has one)
      const v = 1 + rand() * 1.4;
      velocities.push(d.dx * v, rand() * 0.3, d.dz * v);
      lives.push(t, rand(), 0.2 + rand() * 0.25);
      ice.push(cold);
    }
    for (let k = 0; k < 48 + d.w * 10; k++) {
      const u = (rand() - 0.5) * d.w * 1.6, out = (rand() - 0.3) * 2;
      starts.push(d.ix - x0 + px * u + d.dx * out, d.bottom + 0.05, d.iz - z0 + pz * u + d.dz * out);
      const up = 2 + rand() * 3 + Math.min(3, fall * 0.12), a = rand() * Math.PI * 2, side = 0.8 + rand() * 2;
      velocities.push(Math.cos(a) * side + d.dx * 1.2, up, Math.sin(a) * side + d.dz * 1.2);
      lives.push((2 * up) / 9.8, rand(), 0.18 + rand() * 0.3);
      ice.push(cold);
    }
    for (let k = 0; k < 22 + Math.min(26, fall * 1.2); k++) {
      // (A cloud of it boiling up round the foot, some drifting low out over the pool.)
      const low = rand() < 0.35, u = (rand() - 0.5) * d.w * (low ? 3.5 : 2.2), out = 0.3 + rand() * (low ? 6 + fall * 0.3 : 3 + fall * 0.15);
      mist.push(d.ix - x0 + px * u + d.dx * out, d.bottom + 0.3, d.iz - z0 + pz * u + d.dz * out);
      mistLife.push(3 + rand() * 4, rand(), (low ? 3 : 2.4) + rand() * 2.5 + fall * 0.12, low ? 0.6 + rand() * 1.2 : 2.5 + rand() * 2 + fall * 0.45);
      mistIce.push(cold);
    }
  }
  return { starts: new Float32Array(starts), velocities: new Float32Array(velocities), lives: new Float32Array(lives), ice: new Float32Array(ice), mist: new Float32Array(mist), mistLife: new Float32Array(mistLife), mistIce: new Float32Array(mistIce) };
}

// (Two lots of spray as one.)
function joinSpray(a, b) {
  if (!a || !b) return a ?? b;
  const cat = (x, y) => {
    if (!x) return y;
    if (!y) return x;
    const r = new Float32Array(x.length + y.length);
    r.set(x);
    r.set(y, x.length);
    return r;
  };
  const out = {};
  for (const k of ['starts', 'velocities', 'lives', 'ice', 'mist', 'mistLife', 'mistIce']) {
    const v = cat(a[k], b[k]);
    if (v) out[k] = v;
  }
  return out;
}
