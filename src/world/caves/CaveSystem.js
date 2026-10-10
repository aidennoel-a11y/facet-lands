import { BufferAttribute, BufferGeometry } from 'three';
import { CaveField } from './CaveField.js';
import { buildChunkData, sampleGrid } from './caveMesher.js';

const MAX_CACHED = 48; // chunks of cave data kept around (least recently used go first)

// One background worker shared by every world (seed); results are routed
// back by request id. Where workers aren't available (e.g. tests in Node),
// chunks are built synchronously instead.
let worker = null;
let nextId = 1;
const requests = new Map(); // id -> (data) => void
function getWorker() {
  if (worker === null) {
    try {
      worker = typeof Worker !== 'undefined' && typeof window !== 'undefined'
        ? new Worker(new URL('./caveWorker.js', import.meta.url), { type: 'module' })
        : false;
    } catch {
      worker = false;
    }
    if (worker) {
      worker.onmessage = (event) => {
        const done = requests.get(event.data.id);
        requests.delete(event.data.id);
        done?.(event.data.data);
      };
    }
  }
  return worker;
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
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(part.position, 3));
  g.setAttribute('color', new BufferAttribute(part.colour, 3));
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
      if (this.cache.get(key) !== entry) return; // evicted meanwhile
      entry.grid = data.grid;
      entry.rock = toGeometry(data.rock);
      entry.deco = toGeometry(data.deco);
      entry.obstacles = data.obstacles;
      entry.features = data.features ?? new Float32Array(0);
      entry.pools = data.pools ?? new Float32Array(0);
      entry.vines = data.vines ?? new Float32Array(0);
      entry.water = toLiquid(data.water);
      entry.lava = toLiquid(data.lava);
      entry.ready = true;
      for (const fn of entry.listeners.splice(0)) fn(entry);
    };
    const w = getWorker();
    if (w) {
      const id = nextId++;
      requests.set(id, apply);
      w.postMessage({ id, seed: this.generator.seedText, config: this.config, cx, cz });
    } else {
      apply(buildChunkData(this.field, cx, cz, this.chunkSize));
    }
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
      entry.deco?.dispose();
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
