import { BufferAttribute, BufferGeometry } from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { CaveField } from './CaveField.js';
import { buildChunkData, sampleGrid } from './caveMesher.js';

const MAX_CACHED = 72; // chunks of cave data kept around (least recently used go first)

// Two background workers shared by every world (seed); results are routed
// back by request id. Where workers aren't available (e.g. tests in Node),
// chunks are built synchronously instead.
let workers = null;
let nextId = 1;
const requests = new Map(); // id -> (data) => void
// (The chunks waiting their turn, and how many each worker has in hand. A
// worker is given one at a time, the waiting one nearest you first: so the
// cave you're walking into is never stuck behind ones you've left behind.)
const waiting = [];
const busy = [];
const inFlight = new Map(); // id -> job, handed to a worker and not back yet
/** Where you are, for which cave to build next (set each frame: see CaveLayer.update). */
export const caveQueueFocus = { x: 0, z: 0 };
// (Three or four of them, sharing the work: a cave of many chunks fills in sooner.)
function getWorker() {
  if (workers === null) {
    workers = [];
    try {
      if (typeof Worker !== 'undefined' && typeof window !== 'undefined') {
        const cores = navigator.hardwareConcurrency ?? 4;
        for (let k = 0; k < (cores >= 8 ? 4 : cores >= 4 ? 3 : 2); k++) {
          const w = new Worker(new URL('./caveWorker.js', import.meta.url), { type: 'module' });
          const index = k;
          busy.push(0);
          w.onmessage = (event) => {
            const done = requests.get(event.data.id);
            if (!done) return; // (a warm-up's answer)
            requests.delete(event.data.id);
            inFlight.delete(event.data.id);
            busy[index] = Math.max(0, busy[index] - 1);
            done(event.data.data);
            dispatch();
          };
          workers.push(w);
        }
      }
    } catch {
      workers = [];
    }
  }
  return workers.length ? workers : false;
}

// Hands the nearest waiting chunks to the idle workers.
function dispatch() {
  for (let k = 0; k < workers.length && waiting.length; k++) {
    if (busy[k] > 0) continue;
    let best = 0, bestD = Infinity;
    for (let i = 0; i < waiting.length; i++) {
      const d = Math.hypot(waiting[i].x - caveQueueFocus.x, waiting[i].z - caveQueueFocus.z);
      if (d < bestD) (bestD = d), (best = i);
    }
    const job = waiting.splice(best, 1)[0];
    if (job.cancelled?.()) {
      requests.delete(job.message.id);
      k--;
      continue;
    }
    busy[k]++;
    inFlight.set(job.message.id, job);
    workers[k].postMessage(job.message);
  }
}

/** Rivers worked out on another thread, for the cave workers to take in too (see ChunkManager.#shareRivers). */
export function shareCaveRivers(seed, config, delta) {
  getWorker();
  for (const w of workers) w.postMessage({ kind: 'rivers', seed, config, delta });
}

function toGeometry(part) {
  if (!part) return null;
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(part.position, 3));
  g.setAttribute('normal', new BufferAttribute(part.normal, 3));
  g.setAttribute('color', new BufferAttribute(part.color, 3));
  g.setAttribute('skyLight', new BufferAttribute(part.skyLight, 1));
  if (part.glow) g.setAttribute('glow', new BufferAttribute(part.glow, 3));
  g.computeBoundingSphere();
  return g;
}

/** A flat sheet of water or lava (see liquidChunk). */
function toLiquid(part) {
  if (!part) return null;
  let g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(part.position, 3));
  g.setAttribute('color', new BufferAttribute(part.colour, 3));
  // (One sheet, its squares sharing their corners: no seam anywhere between them.)
  g = mergeVertices(g, 1e-3);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/**
 * Everything cave-related the rest of the world talks to.
 *
 *  - Per-chunk cave data (field grid, rock mesh, stalagmites), built on a
 *    background worker and cached. Meshes are shared between LOD rebuilds.
 *  - Terrain questions: which terrain triangles to cut for cave mouths, and
 *    how deep chunk skirts may hang without walling off an entrance ramp.
 *  - Physics: what you'd stand on at a point (cave floor or terrain), the
 *    roof over your head, and collisions with stalagmites.
 */
export class CaveSystem {
  constructor(generator, config) {
    this.generator = generator;
    this.chunkSize = config.chunkSize;
    this.config = { seaLevel: config.seaLevel, chunkSize: config.chunkSize };
    this.field = new CaveField(generator, config);
    this.cache = new Map(); // "cx,cz" -> { ready, grid, rock, deco, obstacles, users, listeners }
  }

  // --- Chunk data --------------------------------------------------------------

  /** The cave workers made ready for this world, each building a cave round (cx, cz) to start with. */
  warm(cx, cz) {
    getWorker();
    for (const w of workers) w.postMessage({ kind: 'warm', seed: this.generator.seedText, config: this.config, cx, cz });
  }

  /**
   * The cave you're in (or at the mouth of), if the workers still haven't
   * built it after a few seconds (a worker's first cave can take a long
   * while: it has the lie of the land to work out first), built here and
   * now instead: one short hitch rather than a long wait in the dark.
   * Call every frame with where you are.
   */
  rescue(x, z) {
    const now = performance.now();
    if (now < (this.rescueAt ?? 0)) return;
    const S = this.chunkSize;
    for (const list of [waiting, [...inFlight.values()]]) {
      for (const job of list) {
        if (now - job.at < 6000 || job.cancelled?.() || Math.abs(job.x - x) > S * 1.01 || Math.abs(job.z - z) > S * 1.01) continue;
        const i = waiting.indexOf(job);
        if (i >= 0) waiting.splice(i, 1);
        this.rescueAt = now + 1500; // (one at a time, a moment apart)
        job.build();
        return;
      }
    }
  }

  /**
   * Cave data for a chunk, requesting it if needed. `acquire` marks it in use
   * (pair with release()). The entry may still be loading; see whenReady().
   */
  chunk(cx, cz, acquire = false) {
    const key = `${cx},${cz}`;
    let entry = this.cache.get(key);
    if (entry) {
      this.cache.delete(key); // re-insert: most recently used last
      this.cache.set(key, entry);
    } else {
      entry = { ready: false, grid: undefined, rock: null, deco: null, water: null, lava: null, obstacles: [], features: new Float32Array(0), pools: new Float32Array(0), users: 0, listeners: [] };
      this.cache.set(key, entry);
      this.#request(key, entry, cx, cz);
    }
    if (acquire) entry.users++;
    this.#evict();
    return entry;
  }

  /** Calls `fn(entry)` once the chunk's caves are built (now, if they are). */
  whenReady(entry, fn) {
    if (entry.ready) fn(entry);
    else entry.listeners.push(fn);
  }

  #request(key, entry, cx, cz) {
    const apply = (data) => {
      if (this.cache.get(key) !== entry || entry.ready) return; // evicted meanwhile (or built here already: see rescue)
      entry.grid = data.grid;
      entry.rock = toGeometry(data.rock);
      entry.rockFar = toGeometry(data.rockFar);
      entry.deco = toGeometry(data.deco);
      entry.plants = toGeometry(data.plants);
      entry.obstacles = data.obstacles;
      entry.features = data.features ?? new Float32Array(0);
      entry.pools = data.pools ?? new Float32Array(0);
      entry.vines = data.vines ?? new Float32Array(0);
      entry.lights = data.lights ?? new Float32Array(0);
      entry.geysers = data.geysers ?? new Float32Array(0);
      entry.giants = data.giants ?? new Float32Array(0);
      entry.labels = data.labels ?? null;
      entry.portals = data.portals ?? null;
      entry.water = toLiquid(data.water);
      entry.lava = toLiquid(data.lava);
      entry.ready = true;
      for (const fn of entry.listeners.splice(0)) fn(entry);
    };
    if (getWorker()) {
      const id = nextId++;
      requests.set(id, apply);
      const size = this.chunkSize;
      waiting.push({ x: (cx + 0.5) * size, z: (cz + 0.5) * size, at: performance.now(), message: { id, seed: this.generator.seedText, config: this.config, cx, cz }, cancelled: () => this.cache.get(key) !== entry, build: () => apply(this.#here(() => buildChunkData(this.field, cx, cz, this.chunkSize))) });
      dispatch();
    } else {
      apply(buildChunkData(this.field, cx, cz, this.chunkSize));
    }
  }

  // Something worked out here on the main thread after all (a chunk built
  // here in a hurry): the natural openings found here too, for it, rather
  // than waited for from the workers (see CaveField.share).
  #here(fn) {
    const lazy = this.field.lazy;
    this.field.lazy = false;
    try {
      return fn();
    } finally {
      this.field.lazy = lazy;
    }
  }

  /**
   * The cave chunks you could see into from `eye`, underground: starting in
   * the stretch of cave you're in, out through the sides of each chunk it
   * reaches into the stretches of the next that meet it there, and on, but
   * never back the way it came (a line of sight only ever goes on, one way
   * along each axis). A Set of "cx,cz", or null where it can't tell (you're
   * in rock, or your chunk isn't built yet): then all are shown.
   */
  visibleChunks(eye, range = 8) {
    const size = this.chunkSize;
    const cx0 = Math.floor(eye.x / size), cz0 = Math.floor(eye.z / size);
    const start = this.cache.get(`${cx0},${cz0}`);
    if (!start?.ready || !start.grid || !start.labels) return null;
    const { x0, z0, cell, n, ny, yMin } = start.grid;
    const at = (i, j, k) => (i < 0 || k < 0 || j < 0 || i >= n || k >= n || j >= ny ? 0 : start.labels[(k * n + i) * ny + j]);
    const fi = Math.round((eye.x - x0) / cell), fj = Math.round((eye.y - yMin) / cell), fk = Math.round((eye.z - z0) / cell);
    let id = at(fi, fj, fk);
    // (Your eye right by the rock: the nearest air round it.)
    for (let r = 1; r <= 2 && !id; r++) {
      for (let dk = -r; dk <= r && !id; dk++) for (let di = -r; di <= r && !id; di++) for (let dj = -r; dj <= r && !id; dj++) id = at(fi + di, fj + dj, fk + dk);
    }
    if (!id) return null;
    const seen = new Set([`${cx0},${cz0}`]);
    const masks = new Map(); // "cx,cz,id" -> the ways it was reached by
    const queue = [[cx0, cz0, id, 0]];
    masks.set(`${cx0},${cz0},${id}`, [0]);
    const STEP = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    while (queue.length) {
      const [cx, cz, comp, mask] = queue.shift();
      const entry = this.cache.get(`${cx},${cz}`);
      const ports = entry.portals;
      for (let s = 0; s < 4; s++) {
        if (mask & (1 << (s ^ 1))) continue; // (never back again)
        const o = (comp - 1) * 16 + s * 4;
        if (o + 3 >= ports.length || ports[o] < 0) continue;
        const nx = cx + STEP[s][0], nz = cz + STEP[s][1];
        if (Math.abs(nx - cx0) > range || Math.abs(nz - cz0) > range) continue;
        const key = `${nx},${nz}`;
        const next = this.cache.get(key);
        if (!next?.ready) {
          seen.add(key); // (not built yet: nothing there to hide)
          continue;
        }
        if (!next.grid || !next.portals) continue;
        seen.add(key);
        // Its stretches that meet ours across the side: overlapping in height and along it.
        const lo = ports[o] * cell + entry.grid.yMin, hi = ports[o + 1] * cell + entry.grid.yMin;
        const nm = mask | (1 << s), back = (s ^ 1) * 4, np = next.portals;
        for (let c = 0; c * 16 < np.length; c++) {
          const q = c * 16 + back;
          if (np[q] < 0) continue;
          const nlo = np[q] * next.grid.cell + next.grid.yMin, nhi = np[q + 1] * next.grid.cell + next.grid.yMin;
          if (nhi < lo - cell || nlo > hi + cell || np[q + 3] < ports[o + 2] - 1 || np[q + 2] > ports[o + 3] + 1) continue;
          const mk = `${key},${c + 1}`, had = masks.get(mk);
          // (Again only if by a way that lets it go on somewhere new.)
          if (had && had.some((m) => (m & nm) === m)) continue;
          if (had) had.push(nm);
          else masks.set(mk, [nm]);
          queue.push([nx, nz, c + 1, nm]);
        }
      }
    }
    return seen;
  }

  release(cx, cz) {
    const entry = this.cache.get(`${cx},${cz}`);
    if (entry) entry.users = Math.max(0, entry.users - 1);
    this.#evict();
  }

  #evict() {
    if (this.cache.size <= MAX_CACHED) return;
    for (const [key, entry] of this.cache) {
      if (this.cache.size <= MAX_CACHED) break;
      if (entry.users > 0) continue;
      entry.rock?.dispose();
      entry.rockFar?.dispose();
      entry.deco?.dispose();
      entry.plants?.dispose();
      entry.water?.dispose();
      entry.lava?.dispose();
      this.cache.delete(key);
    }
  }

  /** The cached field grid covering a world point, if any (no building). */
  #gridAt(x, y, z) {
    const cx = Math.floor(x / this.chunkSize);
    const cz = Math.floor(z / this.chunkSize);
    const entry = this.cache.get(`${cx},${cz}`);
    if (!entry || !entry.ready) return undefined; // not built yet
    const g = entry.grid;
    if (!g) return null; // known: no caves in this chunk
    if (y < g.yMin || y > g.yMin + (g.ny - 1) * g.cell) return null;
    return g;
  }

  // --- Terrain -----------------------------------------------------------------

  /** Cave entrances near a box (for cutting terrain, skirts and the minimap). */
  mouthsNear(minX, minZ, maxX, maxZ) {
    return this.field.entrancesNear(minX, minZ, maxX, maxZ);
  }

  /** Is the ground at (x, z) inside an entrance's pit (no terrain surface there)? */
  isHole(x, z) {
    return this.mouthsNear(x, z, x, z).some((e) => CaveField.inHole(e, x, z));
  }

  /**
   * Lowest point a chunk skirt hanging from (x, y, z) may reach without
   * cutting into an entrance ramp below it.
   */
  skirtBottom(entrances, x, y, z, depth) {
    for (let d = 0.5; d <= depth; d += 1) {
      for (const e of entrances) if (CaveField.ramp(e, x, y - d, z) < 0.6) return y - d + 0.6;
    }
    return y - depth;
  }

  // --- The deep caves' columns, cached (physics asks the same few over and over) ---

  #column(x, z) {
    const key = `${Math.round(x * 2)},${Math.round(z * 2)}`;
    this.columns ??= new Map();
    let c = this.columns.get(key);
    if (!c) {
      if (this.columns.size > 4000) this.columns.clear();
      c = this.field.column(x, z, this.generator.getHeight(x, z));
      this.columns.set(key, c);
    }
    return c;
  }

  #deepRock(x, z) {
    return this.field.deepRock(this.#column(x, z));
  }

  /**
   * The kind of cave at a point: 0 plain rock, 1 lush, 2 volcanic, 3 ice,
   * 4 dry sandstone (see CaveField.biomeAt). Sampled coarsely and cached.
   */
  biomeAt(x, y, z) {
    // (A great chamber is all one kind, through and through.)
    const ch = this.field.chamberAt(x, z);
    if (ch && ch.e < 1.1 && y < ch.c.y + ch.c.ry && y > ch.c.floor - 12) return ch.c.shaft ? 5 : CaveField.biomeAt(ch.c.scores ??= this.field.biomeScores(ch.c.x, ch.c.z), ch.c.y);
    const key = `${Math.round(x / 24)},${Math.round(z / 24)}`;
    this.kinds ??= new Map();
    let s = this.kinds.get(key);
    if (!s) {
      if (this.kinds.size > 500) this.kinds.clear();
      s = this.field.biomeScores(Math.round(x / 24) * 24, Math.round(z / 24) * 24);
      this.kinds.set(key, s);
    }
    return CaveField.biomeAt(s, y);
  }

  /**
   * The water (or lava) underground at (x, z) near height y: a great
   * chamber's lake, an underground river, a pool on a cave floor; or null.
   * { level, lava, river, pool }.
   */
  waterAt(x, y, z) {
    const col = this.#column(x, z);
    const found = [];
    if (col.chamber && col.chamber.e < 1) found.push({ level: col.chamber.c.lake, river: false });
    if (col.river && col.river.across < col.river.half * 0.92 && col.river.fade > 0.5) found.push({ level: col.river.level - 0.2, river: true });
    if (col.volc > 0.45) {
      const vf = this.field.volcanicFloor(x, z);
      if (vf.floor < vf.lava) found.push({ level: vf.lava, river: false });
    }
    const entry = this.cache.get(`${Math.floor(x / this.chunkSize)},${Math.floor(z / this.chunkSize)}`);
    const pools = entry?.pools ?? [];
    for (let k = 0; k < pools.length; k += 4) if (Math.hypot(x - pools[k], z - pools[k + 2]) < pools[k + 3]) found.push({ level: pools[k + 1], pool: true });
    let best = null;
    for (const w of found) {
      if (y < w.level - 4 || y > w.level + 3) continue;
      // (Only where it really lies: open air over it, rock under it.)
      if (this.caveDensity(x, w.level + 0.15, z) >= 0) continue;
      if (w.river && this.caveDensity(x, w.level - 2.4, z) < 0) continue;
      if (!best || Math.abs(w.level - y) < Math.abs(best.level - y)) best = w;
    }
    if (best) best.lava = this.biomeAt(x, best.level, z) === 2;
    return best;
  }

  // --- Physics -----------------------------------------------------------------

  /**
   * Cave field (caves, entrance tunnels and the entrances' built parts; not
   * the ground) at a point: the grid if built, else computed. Pass the
   * entrances near (x, z) when you already have them.
   */
  caveDensity(x, y, z, entrances = this.mouthsNear(x, z, x, z)) {
    // Inside an entrance's built part, its exact shape is all there is.
    for (const e of entrances) if (CaveField.inBuilt(e, x, y, z)) return CaveField.corridor(e, x, y, z);
    let d;
    const g = this.#gridAt(x, y, z);
    if (g) {
      d = sampleGrid(g, x, y, z);
    } else if (g === null) {
      d = 50; // no caves there
    } else {
      d = this.field.caves(x, y, z, this.generator.getHeight(x, z), this.field.regionRock(x, z), this.#column(x, z), entrances);
      for (const e of entrances) d = Math.min(d, CaveField.ramp(e, x, y, z), CaveField.hull(e, x, y, z));
    }
    return d;
  }

  /**
   * What you'd stand on at (x, z) from feet height `feetY`, given the terrain
   * mesh height there (NaN over an entrance's pit, where the ramp is the
   * ground). Returns { height, inCave, ceiling }.
   */
  /**
   * The cave rock as drawn under (x, z), the highest of it below `fromY`
   * (world), or null if there's none built there: for a rope to lie on the
   * faceted rock itself. (Each chunk's rock indexed by 2 m squares, once,
   * so only the few triangles over the spot are looked at.)
   */
  meshFloor(x, z, fromY, floorsOnly = false) {
    const entry = this.cache.get(`${Math.floor(x / this.chunkSize)},${Math.floor(z / this.chunkSize)}`);
    const g = entry?.ready ? entry.rock : null;
    if (!g || !entry.grid) return null;
    const S = 2, N = Math.ceil(this.chunkSize / S) + 1, pos = g.attributes.position.array;
    if (!entry.floorIndex) {
      const cells = Array.from({ length: N * N }, () => []);
      for (let t = 0; t < pos.length; t += 9) {
        const ax = pos[t], az = pos[t + 2], bx = pos[t + 3], bz = pos[t + 5], cx = pos[t + 6], cz = pos[t + 8];
        const i0 = Math.max(0, Math.floor(Math.min(ax, bx, cx) / S)), i1 = Math.min(N - 1, Math.floor(Math.max(ax, bx, cx) / S));
        const k0 = Math.max(0, Math.floor(Math.min(az, bz, cz) / S)), k1 = Math.min(N - 1, Math.floor(Math.max(az, bz, cz) / S));
        for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) cells[k * N + i].push(t);
      }
      entry.floorIndex = cells.map((c) => Int32Array.from(c));
    }
    const lx = x - entry.grid.x0, lz = z - entry.grid.z0;
    const i = Math.floor(lx / S), k = Math.floor(lz / S);
    if (i < 0 || k < 0 || i >= N || k >= N) return null;
    let best = null;
    for (const t of entry.floorIndex[k * N + i]) {
      const ax = pos[t], ay = pos[t + 1], az = pos[t + 2], bx = pos[t + 3], by = pos[t + 4], bz = pos[t + 5], cx = pos[t + 6], cy = pos[t + 7], cz = pos[t + 8];
      const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (Math.abs(d) < 1e-9) continue;
      const u = ((bz - cz) * (lx - cx) + (cx - bx) * (lz - cz)) / d, v = ((cz - az) * (lx - cx) + (ax - cx) * (lz - cz)) / d, w = 1 - u - v;
      if (u < -1e-6 || v < -1e-6 || w < -1e-6) continue;
      if (floorsOnly) {
        // (Only the floor's facets, not the walls': lying flat enough to stand on.)
        const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        if (Math.abs(ny) < 0.55 * Math.hypot(nx, ny, nz)) continue;
      }
      const y = u * ay + v * by + w * cy;
      if (y < fromY && (best === null || y > best)) best = y;
    }
    return best;
  }

  groundAt(x, feetY, z, terrainHeight) {
    // Fast path: nowhere near a cave.
    const entrances = this.mouthsNear(x, z, x, z);
    if (!entrances.length && this.field.regionRock(x, z) > 10 && Number.isFinite(terrainHeight) && this.#deepRock(x, z) > 10) {
      return { height: terrainHeight, inCave: false, ceiling: Infinity };
    }
    const H = this.generator.getHeight(x, z);
    const surface = Number.isFinite(terrainHeight) ? terrainHeight : H;

    const solid = (y) => Math.min(surface - y, this.caveDensity(x, y, z, entrances)) > 0;
    const top = feetY + 1.2;

    // Rock at step height: a wall. Report where the rock ends above (so the
    // move is refused as too high to step onto).
    if (solid(top)) {
      let y = top;
      for (let k = 0; k < 20 && solid(y); k++) y += 0.5;
      return { height: y, inCave: y < H - 1.5, ceiling: Infinity };
    }

    // Look down for the first solid ground, then refine it.
    let above = top;
    let height = null;
    for (let k = 0; k < 90; k++) {
      const below = above - 0.4;
      if (solid(below)) {
        let lo = below, hi = above;
        for (let r = 0; r < 6; r++) {
          const mid = (lo + hi) / 2;
          if (solid(mid)) lo = mid;
          else hi = mid;
        }
        height = (lo + hi) / 2;
        break;
      }
      above = below;
    }
    if (height === null) height = above; // a deep drop: keep falling

    const inCave = height < H - 1.5;
    // (Underground, the floor as it's drawn: the faceted rock itself, where
    // the field's smooth surface would sink your feet into a facet or float
    // them over one.)
    if (inCave) {
      const drawn = this.meshFloor(x, z, top, true);
      if (drawn !== null && Math.abs(drawn - height) < 0.9) height = drawn;
    }
    let ceiling = Infinity;
    if (inCave) {
      for (let y = feetY + 0.5; y < feetY + 4; y += 0.35) {
        if (solid(y)) {
          ceiling = y;
          break;
        }
      }
    }
    return { height, inCave, ceiling };
  }

  /** Whether there's a clear line through the caves' air from one point to another (no rock between). */
  clearLine(ax, ay, az, bx, by, bz, step = 1.5) {
    const dx = bx - ax, dy = by - ay, dz = bz - az, len = Math.hypot(dx, dy, dz);
    for (let t = 1; t < len - 1; t += step) {
      const x = ax + (dx * t) / len, y = ay + (dy * t) / len, z = az + (dz * t) / len;
      if (Math.min(this.generator.getHeight(x, z) - y, this.caveDensity(x, y, z)) > 0.3) return false;
    }
    return true;
  }

  /** Something no longer in the way at (x, z) (a giant mushroom cut down): its obstacle gone. */
  clearObstacle(x, z) {
    const data = this.cache.get(`${Math.floor(x / this.chunkSize)},${Math.floor(z / this.chunkSize)}`);
    const list = data?.obstacles;
    if (!list) return;
    for (let k = 0; k < list.length; k += 5) if (Math.abs(list[k] - x) < 0.01 && Math.abs(list[k + 1] - z) < 0.01) list[k + 2] = 0;
  }

  /** Pushes a walking player (circle at `position`, feet at feetY) out of stalagmites. */
  collide(position, radius, feetY) {
    const cx = Math.floor(position.x / this.chunkSize);
    const cz = Math.floor(position.z / this.chunkSize);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const data = this.cache.get(`${cx + dx},${cz + dz}`);
        if (!data) continue;
        const list = data.obstacles;
        for (let k = 0; k < list.length; k += 5) {
          if (feetY > list[k + 4] || feetY + 1.7 < list[k + 3]) continue;
          const ox = position.x - list[k];
          const oz = position.z - list[k + 1];
          const min = radius + list[k + 2];
          const d2 = ox * ox + oz * oz;
          if (d2 >= min * min || d2 === 0) continue;
          const d = Math.sqrt(d2);
          position.x += (ox / d) * (min - d);
          position.z += (oz / d) * (min - d);
        }
      }
    }
  }
}
