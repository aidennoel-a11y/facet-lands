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
const GRID = 2; // metres between the surface's vertices
const MARGIN = 3; // how far past a channel's edge the surface runs on under the banks

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
function sprayData(rivers, x0, z0, chunkSize) {
  const starts = [], velocities = [], lives = [], mist = [], mistLife = [];
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
        }
      }
    }
  }
  if (!n) return null;
  const out = { starts: new Float32Array(starts), velocities: new Float32Array(velocities), lives: new Float32Array(lives) };
  if (mist.length) Object.assign(out, { mist: new Float32Array(mist), mistLife: new Float32Array(mistLife) });
  return out;
}

/**
 * The river water over chunk (cx, cz): the surface's faces { positions,
 * colors (rgba), flows, streaks, freezes, mouths } and its waterfalls' spray, or
 * null if there's none.
 */
export function riverData(generator, config, cx, cz) {
  const { chunkSize, seaLevel } = config;
  const rivers = generator.rivers;
  const x0 = cx * chunkSize, z0 = cz * chunkSize;
  const courses = rivers.inBox(x0, z0, x0 + chunkSize, z0 + chunkSize);
  if (!courses.length) return null;

  // The water at each grid point: its level, current, white water, how
  // far in from the channel's edge, and how much it has given way to a
  // lake or the sea it runs into.
  const cells = chunkSize / GRID;
  const n = cells + 1;
  const level = new Float32Array(n * n).fill(NaN);
  const flow = new Float32Array(n * n * 4);
  const inset = new Float32Array(n * n);
  const river = new Float32Array(n * n); // 1 in the river, 0 out in the lake it flows into
  const depth = new Float32Array(n * n); // of the water, for the lake's colours
  const ice = new Float32Array(n * n); // still water in cold lands freezes in winter
  const tint = new Uint8Array(n * n);
  let any = false;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = x0 + i * GRID, z = z0 + j * GRID;
      const w = rivers.waterAt(x, z, MARGIN);
      if (!w) continue;
      const k = j * n + i;
      river[k] = smoothstep(seaLevel - 0.6, seaLevel + 0.3, generator.getBaseHeight(x, z));
      // Out over a lake it sits a hair higher, clear of the lake's ripples.
      level[k] = w.level + 0.03 + 0.07 * (1 - river[k]);
      depth[k] = w.level - generator.getHeight(x, z);
      const drop = Math.max(0, w.drop);
      flow[k * 4] = w.along;
      flow[k * 4 + 1] = Math.min(1.5, w.across);
      flow[k * 4 + 2] = w.pond ? 0 : (0.6 + Math.min(2.4, drop * 6)) * river[k];
      flow[k * 4 + 3] = Math.min(1, Math.max(0, (drop - 0.25) / 0.5));
      inset[k] = w.inset;
      if (w.pond) ice[k] = w.tint === 2 ? 0 : generator.getSeasonality(x, z); // (hot springs never freeze)
      tint[k] = w.tint || 0;
      any = true;
    }
  }
  if (!any) return null;

  const positions = [];
  const colors = [];
  const flows = [];
  const streaks = [];
  const freezes = [];
  const mouths = [];
  const seed = generator.seed ^ 0x3c6ef372;
  const tri = (a, b, c, shade) => {
    if (Number.isNaN(level[a]) || Number.isNaN(level[b]) || Number.isNaN(level[c])) return;
    const r = (river[a] + river[b] + river[c]) / 3;
    if (r === 0) return; // well out in the lake
    const deep = smoothstep(0, 3, (inset[a] + inset[b] + inset[c]) / 3);
    const t = smoothstep(-1, 16, (depth[a] + depth[b] + depth[c]) / 3);
    lakeColor.copy(LAKE_SHALLOW).lerp(LAKE_DEEP, t);
    color.copy(SHALLOW).lerp(DEEP, deep).lerp(lakeColor, 1 - r);
    const tt = Math.max(tint[a], tint[b], tint[c]);
    if (tt) color.copy(TINTS[tt][0]).lerp(TINTS[tt][1], deep);
    color.multiplyScalar(shade);
    // Where two rivers meet, their distances along don't match: no
    // streaks on the few faces that straddle the two.
    const spread = Math.max(flow[a * 4], flow[b * 4], flow[c * 4]) - Math.min(flow[a * 4], flow[b * 4], flow[c * 4]);
    const streaky = spread < 8 ? 1 : 0;
    const clear = 0.5 + 0.18 * deep; // see-through, more so at the edges
    const alpha = clear;
    for (const k of [a, b, c]) {
      positions.push((k % n) * GRID, level[k], Math.floor(k / n) * GRID);
      colors.push(color.r, color.g, color.b, alpha);
      flows.push(flow[k * 4], flow[k * 4 + 1], flow[k * 4 + 2], flow[k * 4 + 3]);
      streaks.push(streaky);
      freezes.push(ice[k]);
      // Fading away where it runs out into a lake or the sea, so the two
      // waters meet with no edge between them (see RiverLayer).
      mouths.push(smoothstep(0.05, 0.85, river[k]));
    }
  };
  for (let j = 0; j < cells; j++) {
    for (let i = 0; i < cells; i++) {
      const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
      const gi = cx * cells + i, gj = cz * cells + j;
      const s0 = 0.96 + hash2(gi * 2, gj, seed) * 0.06;
      const s1 = 0.96 + hash2(gi * 2 + 1, gj, seed) * 0.06;
      if (hash2(gi, gj, seed + 1) < 0.5) {
        tri(a, c, d, s0);
        tri(a, d, b, s1);
      } else {
        tri(a, c, b, s0);
        tri(b, c, d, s1);
      }
    }
  }
  if (!positions.length) return null;
  return {
    positions: new Float32Array(positions),
    colors: new Float32Array(colors),
    flows: new Float32Array(flows),
    streaks: new Float32Array(streaks),
    freezes: new Float32Array(freezes),
    mouths: new Float32Array(mouths),
    spray: sprayData(courses, x0, z0, chunkSize),
  };
}
