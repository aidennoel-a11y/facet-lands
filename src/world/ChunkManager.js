import { Box3, BufferAttribute, BufferGeometry, Group, Mesh } from 'three';
import { buildChunkGeometry, chunkFromData } from './ChunkMesher.js';

const LOOKAHEAD = 3; // seconds: the land where you'll be by then is made ready ahead of you
const NEIGHBOURS = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];

/**
 * Keeps a ring of chunks loaded around the camera.
 *
 * - Chunks within `viewDistance` are built, farther ones are dropped.
 * - Nearby chunks use more triangles than distant ones (LOD).
 * - The heavy work (the terrain mesh, where rocks lie, where far trees
 *   stand) is done by a pool of workers off the main thread, most urgent
 *   first; putting the results together (and the lighter layers) is spread
 *   over frames (`chunkBuildBudgetMs`) so moving never causes a long stall.
 *   Missing chunks are built nearest first, favouring the ones in front of
 *   the camera so what you look at fills in quickest. (Without workers,
 *   everything is built right here, the same way.)
 * - Chunks outside the camera's view stay loaded but aren't drawn (three.js
 *   frustum culling), so turning around is instant and costs nothing.
 *
 * Extending: register a layer with `addLayer({ name, build, dispose })`.
 * A layer may also give `reuseKey(context)`: a string that changes whenever
 * its output would; when a chunk changes detail level and the key is the
 * same, its object is kept instead of rebuilt.
 * `build(context)` is called every time a chunk is (re)built and may return
 * an Object3D (trees, water plane, rocks...) that is added to the chunk and
 * removed with it; `update(time)`, if present, runs every frame. See
 * layers/WaterLayer.js and layers/TreeLayer.js.
 */
export class ChunkManager {
  constructor(scene, generator, config, material) {
    this.scene = scene;
    this.generator = generator;
    this.config = config;
    this.material = material;

    this.root = new Group();
    this.root.name = 'terrain';
    scene.add(this.root);

    this.chunks = new Map(); // "cx,cz" -> chunk record
    this.queue = []; // chunks waiting to be built, nearest first
    this.layers = [];
    this.centerKey = null;
    this.triangleCount = 0;
    // What to draw (on top of three's per-mesh view-frustum culling):
    //   surface  terrain and every non-cave layer (trees, grass, water...)
    //   caves    'all', or 'mouths' for only the chunks with a cave mouth
    this.visibility = { surface: true, caves: 'all' };
    // Far chunks' ground is drawn in tiles of several chunks merged into one
    // mesh (they're only a few dozen triangles each, and a draw call apiece
    // would cost far more than drawing them): "tx,tz" -> { members, mesh, dirty }.
    this.tiles = new Map();

    // Workers, if there can be any.
    this.workers = [];
    this.epoch = 0; // bumped when everything's rebuilt: older results are dropped
    this.wanted = new Map(); // "cx,cz" -> the LOD it should be at
    this.inFlight = new Map(); // "cx,cz" -> job handed to a worker
    this.ready = []; // jobs back from a worker, to put together
    // (As many as the processor has cores to spare, leaving two for the page
    // itself and the browser: 2 on a 4-thread laptop, 10 on a 16-thread one.)
    const count = typeof Worker !== 'undefined' && typeof window !== 'undefined'
      ? Math.max(1, Math.min(10, (navigator.hardwareConcurrency || 4) - 2))
      : 0;
    for (let k = 0; k < count; k++) {
      try {
        const worker = new Worker(new URL('./chunkWorker.js', import.meta.url), { type: 'module' });
        worker.busy = 0;
        worker.onmessage = (event) => this.#received(worker, event.data);
        worker.onerror = () => {
          // A broken worker: carry on without it (its jobs are built here).
          this.workers = this.workers.filter((w) => w !== worker);
          for (const [key, job] of this.inFlight) if (job.worker === worker) this.inFlight.delete(key), this.queue.push(job);
        };
        this.workers.push(worker);
      } catch {
        break;
      }
    }
    this.nextId = 1;
    this.tasks = new Map(); // id -> { resolve, reject } for other work handed to the workers (see task)
    // For tuning: main-thread time spent putting chunks together, per layer.
    this.stats = { builds: 0, ms: 0, terrainMs: 0, layers: {} };
    // (How much more of each frame than usual goes to putting chunks
    // together: more while a world's loading, behind the loading screen.)
    this.budgetScale = 1;
    this.velocity = { x: 0, z: 0 }; // (how you're moving, for the land ahead: see update)
    this.rugged = new Map(); // (see rebuildAll)
  }

  /** Changes what's drawn; see `visibility`. Cheap to call every frame. */
  setVisibility(surface, caves, eye = null) {
    // (From the surface the caves shown depend on where you stand: looked at again as you move.)
    const moved = caves === 'mouths' && eye && (!this.eye || Math.hypot(eye.x - this.eye.x, eye.z - this.eye.z) > 2);
    if (surface === this.visibility.surface && caves === this.visibility.caves && !moved) return;
    if (eye) this.eye = { x: eye.x, y: eye.y, z: eye.z };
    this.visibility = { surface, caves };
    for (const chunk of this.chunks.values()) this.#applyVisibility(chunk);
  }

  /**
   * Underground: only these chunks' caves drawn ("cx,cz": those you could
   * see into, see CaveSystem.visibleChunks), or all of them (null).
   */
  setCaveSet(set) {
    const same = set === this.caveSet || (set && this.caveSet && set.size === this.caveSet.size && [...set].every((k) => this.caveSet.has(k)));
    if (same) return;
    this.caveSet = set;
    if (this.visibility.caves === 'all') for (const chunk of this.chunks.values()) this.#applyVisibility(chunk);
  }

  #applyVisibility(chunk) {
    const { surface, caves } = this.visibility;
    chunk.mesh.visible = surface && !chunk.merged;
    for (const tile of this.tiles.values()) if (tile.mesh) tile.mesh.visible = surface;
    // (From the surface, only the caves behind a mouth within a few dozen
    // metres: any further and the opening is too small to see into, and
    // the tunnels would only cost triangles.)
    const eye = this.eye;
    const near = (object) => !!eye && object.userData.mouths?.some((m) => Math.hypot(m.x - eye.x, m.z - eye.z) < 45);
    for (const { layer, object } of chunk.layerObjects) {
      object.visible = layer.name === 'caves' ? (caves === 'all' && (!this.caveSet || this.caveSet.has(chunk.key))) || (object.userData.hasMouth === true && near(object)) : surface;
    }
  }

  addLayer(layer) {
    this.layers.push(layer);
    this.rebuildAll();
  }

  /** Swap in a new generator (e.g. new seed) and rebuild everything. */
  setGenerator(generator) {
    this.generator = generator;
    this.rebuildAll();
  }

  /**
   * Rivers one thread has worked out, for all the others: taken in here
   * (the main thread's world), and passed on to the other workers. Working
   * them out is most of the time a new stretch of land takes; this way
   * it's done once, not once on every thread.
   */
  #shareRivers(message, from = null) {
    if (message.seed !== this.generator.seedText) return;
    if (from) this.generator.rivers.share(message.delta);
    for (const w of this.workers) if (w !== from) w.postMessage({ kind: 'rivers', seed: message.seed, config: this.config, delta: message.delta });
  }

  rebuildAll() {
    this.scouted = false;
    this.rugged = new Map(); // "cx,cz" -> how rugged its land is (see #rugged)
    if (this.current) (this.#abort(this.current.job), (this.current = null));
    for (const chunk of this.chunks.values()) this.#unload(chunk);
    this.chunks.clear();
    this.queue.length = 0;
    this.centerKey = null;
    this.epoch++;
    this.inFlight.clear();
    this.ready.length = 0;
    this.wanted.clear();
  }

  lodFor(distance) {
    const { lods } = this.config;
    for (let i = 0; i < lods.length; i++) if (distance <= lods[i].maxDistance) return i;
    return lods.length - 1;
  }

  /**
   * Call once per frame.
   * @param position  camera (or player) position
   * @param time      seconds, passed on to layers' update()
   * @param forward   optional camera view direction, to build what's in view first
   */
  update(position, time = 0, forward = null) {
    for (const layer of this.layers) layer.update?.(time);
    // (Rivers worked out here, on the main thread, for the workers too.)
    const fresh = this.workers.length ? this.generator.rivers?.takeFresh() : null;
    if (fresh) this.#shareRivers({ seed: this.generator.seedText, delta: fresh });
    const { chunkSize } = this.config;
    const ccx = Math.floor(position.x / chunkSize);
    const ccz = Math.floor(position.z / chunkSize);
    // Where you'll be in a few seconds, going the way you're going: the
    // land there is made ready ahead of you, a chunk or two at a time as
    // you go, rather than all at once as you come into it.
    const now = performance.now();
    if (this.lastPos) {
      const dt = Math.max(1e-3, (now - this.lastPos.t) / 1000);
      const k = Math.min(1, dt * 2); // (smoothed over half a second or so)
      this.velocity.x += ((position.x - this.lastPos.x) / dt - this.velocity.x) * k;
      this.velocity.z += ((position.z - this.lastPos.z) / dt - this.velocity.z) * k;
    }
    this.lastPos = { x: position.x, z: position.z, t: now };
    let ahead = LOOKAHEAD;
    const reach = Math.hypot(this.velocity.x, this.velocity.z) * ahead;
    if (reach > chunkSize * 2.5) ahead *= (chunkSize * 2.5) / reach; // (flying fast: no further than a few chunks on)
    const pcx = Math.floor((position.x + this.velocity.x * ahead) / chunkSize);
    const pcz = Math.floor((position.z + this.velocity.z * ahead) / chunkSize);
    const key = `${ccx},${ccz}|${pcx},${pcz}|${this.underground ? 1 : 0}`;
    if (key !== this.centerKey) {
      this.centerKey = key;
      this.centre = [ccx, ccz];
      this.#refreshWanted(ccx, ccz, pcx, pcz);
      for (const chunk of this.chunks.values()) this.#applyVisibility(chunk);
    }
    if (this.queue.length && forward) this.#prioritise(position, forward);
    this.#processQueue();
    this.#rebuildTiles(); // (after this frame's chunks are in, so none is ever missing)
  }

  /** Re-order pending chunks: near first, and chunks behind you count double. */
  #prioritise(position, forward) {
    const { chunkSize } = this.config;
    const flen = Math.hypot(forward.x, forward.z) || 1;
    const fx = forward.x / flen;
    const fz = forward.z / flen;
    for (const job of this.queue) {
      const dx = (job.cx + 0.5) * chunkSize - position.x;
      const dz = (job.cz + 0.5) * chunkSize - position.z;
      const d = Math.hypot(dx, dz);
      const facing = d > 0 ? (dx * fx + dz * fz) / d : 1; // 1 ahead, -1 behind
      job.priority = d * (1.5 - 0.5 * facing);
    }
    // Most urgent last, since the queue is consumed with pop().
    this.queue.sort((a, b) => b.priority - a.priority);
  }

  #refreshWanted(ccx, ccz, pcx = ccx, pcz = ccz) {
    let { viewDistance } = this.config;
    const wanted = this.wanted;
    wanted.clear();
    this.queue.length = 0;
    // Underground the surface can't be seen: nothing more of it is loaded
    // or sharpened, but the chunks round you (whose caves you're in: out
    // to the caves' ring) still are, and what's loaded already stays as it
    // is, for when you come up. (The world goes on: only the drawing waits.)
    if (this.underground) {
      viewDistance = this.config.lods[this.config.caveMaxLod].maxDistance;
      (pcx = ccx), (pcz = ccz);
      for (const [key, chunk] of this.chunks) wanted.set(key, chunk.lod);
    }

    // (Round where you are, and round where you're going: each chunk at the
    // detail the nearer of the two wants.)
    const x0 = Math.min(ccx, pcx) - viewDistance, x1 = Math.max(ccx, pcx) + viewDistance;
    const z0 = Math.min(ccz, pcz) - viewDistance, z1 = Math.max(ccz, pcz) + viewDistance;
    for (let cz = z0; cz <= z1; cz++) {
      for (let cx = x0; cx <= x1; cx++) {
        const dx = cx - ccx, dz = cz - ccz, px = cx - pcx, pz = cz - pcz;
        const distance = Math.sqrt(dx * dx + dz * dz);
        if (this.underground ? Math.max(Math.abs(dx), Math.abs(dz)) > viewDistance : distance > viewDistance + 0.5 && Math.sqrt(px * px + pz * pz) > viewDistance + 0.5) continue;
        const key = `${cx},${cz}`;
        const lod = Math.min(this.lodFor(Math.max(Math.abs(dx), Math.abs(dz))), this.lodFor(Math.max(Math.abs(px), Math.abs(pz))));
        wanted.set(key, lod);
        const resolution = this.#resolutionFor(key, lod);

        const existing = this.chunks.get(key);
        const pending = this.inFlight.get(key);
        if ((!existing || existing.lod !== lod || existing.resolution !== resolution) && !(pending && pending.lod === lod && pending.resolution === resolution)) {
          this.queue.push({ key, cx, cz, lod, resolution, distance });
        }
      }
    }

    // Drop chunks that fell out of range.
    for (const [key, chunk] of this.chunks) {
      if (!wanted.has(key)) {
        this.#unload(chunk);
        this.chunks.delete(key);
      }
    }

    // Nearest first; pop() takes from the end.
    this.queue.sort((a, b) => b.distance - a.distance);
  }

  #processQueue() {
    // (With a pile of finished chunks waiting, starting a world or flying
    // fast, more of the frame goes to putting them in; walking, the usual
    // small slice, so it stays smooth.)
    // (And when the frames are coming slow, less: the land fills in a
    // little later, rather than the game stuttering while it does.)
    const start = performance.now(), gap = start - (this.lastProcess ?? start);
    this.lastProcess = start;
    this.slow = gap > 19 ? Math.min(1, (this.slow ?? 0) + 0.2) : Math.max(0, (this.slow ?? 0) - 0.05);
    const backlog = this.ready.length > 6;
    const deadline = start + this.config.chunkBuildBudgetMs * (backlog ? 2.5 - 1.5 * this.slow : 1 - 0.5 * this.slow) * this.budgetScale;
    this.#dispatch();
    // Put together what's ready (at least one, so progress is guaranteed).
    let steps = 0;
    while (steps === 0 || performance.now() < deadline) {
      if (!this.current) {
        let job = this.ready.shift();
        if (!job) {
          // Without workers, build one right here.
          const k = this.#nextLocal();
          if (k < 0) return;
          job = this.queue.splice(k, 1)[0];
        }
        if (this.#stale(job)) continue;
        this.current = { job, steps: this.#steps(job) };
      }
      // (One part way through: carried on with, unless it's gone out of range meanwhile.)
      const { job } = this.current;
      if (!this.wanted.has(job.key)) {
        this.#abort(job);
        this.current = null;
        continue;
      }
      const t = performance.now();
      const { done } = this.current.steps.next();
      this.stats.ms += performance.now() - t;
      steps++;
      if (done) {
        this.current = null;
        this.stats.builds++;
      }
    }
  }

  // A chunk part way put together, no longer wanted: what was made for it thrown away.
  #abort(job) {
    const p = job.partial;
    if (!p) return;
    job.partial = null;
    if (!p.sameMesh) p.chunk.mesh.geometry.dispose();
    for (const { layer, object } of p.chunk.layerObjects) if (!p.kept.has(object)) layer.dispose?.(object);
  }

  /**
   * Hands the most urgent jobs to the workers (a few each, so none sits
   * idle between jobs). Even a chunk keeping its mesh at a new level of
   * detail goes to one, for the trees, rocks and so on it now needs.
   * Called every frame and whenever a worker finishes one.
   */
  #dispatch() {
    while (this.workers.length && this.queue.length) {
      // (A new world: one job at first, to one worker, which works out the
      // rivers round about; the rest start once they have its rivers to
      // build on, instead of all working out the same ones at once. See #shareRivers.)
      if (!this.scouted && this.inFlight.size) break;
      const worker = this.#idleWorker();
      if (!worker) break;
      this.#send(worker, this.queue.pop());
    }
  }

  /** The most urgent queued job to build here (without workers), or -1. */
  #nextLocal() {
    return this.workers.length ? -1 : this.queue.length - 1;
  }

  #idleWorker() {
    let best = null;
    for (const w of this.workers) if (w.busy < 3 && (!best || w.busy < best.busy)) best = w;
    return best;
  }

  #send(worker, job) {
    const { config } = this;
    job.id = this.nextId++;
    job.epoch = this.epoch;
    job.worker = worker;
    job.resolution ??= config.lods[job.lod].resolution;
    worker.busy++;
    this.inFlight.set(job.key, job);
    worker.postMessage({
      id: job.id,
      seed: this.generator.seedText,
      config,
      cx: job.cx,
      cz: job.cz,
      resolution: job.resolution,
      wantRocks: job.lod <= Math.max(config.rockMaxLod, config.treeMaxLod),
      wantTrees: job.lod <= config.treeMaxLod,
      wantGrass: job.lod <= config.grassMaxLod,
      wantFarGrass: job.lod <= (config.farGrassMaxLod ?? -1),
      wantFarTrees: job.lod > config.treeMaxLod && job.lod <= (config.farTreeMaxLod ?? -1),
      wantRivers: true,
      wantReeds: job.lod <= 1,
      wantUnderstory: job.lod === 0,
    });
  }

  /**
   * Hands some other job to the least busy worker (see chunkWorker: e.g.
   * { kind: 'minimap', ... }): a Promise of its result. Rejects if there
   * are no workers.
   */
  task(message) {
    // (While the first worker's working out a new world's rivers, to it: another would only work them out again.)
    const scout = !this.scouted && [...this.inFlight.values()][0]?.worker;
    const worker = scout || this.workers.reduce((best, w) => (!best || w.busy < best.busy ? w : best), null);
    if (!worker) return Promise.reject(new Error('no workers'));
    const id = this.nextId++;
    worker.busy++;
    return new Promise((resolve, reject) => {
      this.tasks.set(id, { resolve, reject });
      worker.postMessage({ ...message, id, seed: this.generator.seedText, config: this.config });
    });
  }

  #received(worker, message) {
    if (message.kind === 'rivers') return this.#shareRivers(message, worker);
    const task = this.tasks.get(message.id);
    if (task) {
      worker.busy--;
      this.tasks.delete(message.id);
      task.resolve(message.result);
      this.#dispatch();
      return;
    }
    worker.busy--;
    for (const [key, job] of this.inFlight) {
      if (job.id !== message.id) continue;
      this.inFlight.delete(key);
      if (job.epoch === this.epoch) {
        job.prepared = message;
        this.ready.push(job);
        this.scouted = true;
      }
      break;
    }
    this.#dispatch();
  }

  /**
   * Whether a job is no longer needed: its chunk is out of range, or
   * already built at the level it's wanted at. (A chunk now wanted at
   * another level still takes a worker's mesh if that level uses the same
   * resolution; a job here just builds whatever level is wanted.)
   */
  #stale(job) {
    const lod = this.wanted.get(job.key);
    if (lod === undefined) return true;
    const resolution = this.#resolutionFor(job.key, lod), built = this.chunks.get(job.key);
    if (built?.lod === lod && built.resolution === resolution) return true;
    if (lod === job.lod && resolution === job.resolution) return false;
    if (job.prepared && resolution !== job.resolution) return true;
    job.lod = lod;
    job.resolution = resolution;
    return false;
  }

  /**
   * The ground's detail for a chunk at level `lod`: the level's own, or,
   * where the land's rugged (mountains, mesas' walls, sea cliffs, the
   * badlands: what's seen from far off), finer, up to the level used out
   * to 640 m. (Only the ground: what stands on it goes by `lod`.) See #rugged.
   */
  #resolutionFor(key, lod) {
    const base = this.config.lods[lod].resolution;
    const level = this.noRugged ? 0 : this.rugged.get(key);
    // (Plain land, open sea or deep woods, off away from you: coarser, for
    // nothing shows the difference there; full detail again as you come near.)
    if (level < 0 && lod >= 1) return Math.max(4, level === -2 ? base / 4 : base / 2);
    if (!level || level < 0) return base;
    const finest = this.config.lods[Math.min(2, this.config.lods.length - 1)].resolution;
    return Math.max(base, Math.min(finest, base * (level === 2 ? 4 : 2)));
  }

  /**
   * Whether a chunk's ground can be drawn coarser when it's off away from
   * you: -2 open sea well under the water (nothing of the bed shows), -1
   * flat plain land or ground deep under thick woods; 0 not. Never where a
   * creek or river runs, nor along a shore (their banks need the detail).
   */
  #simple(heights, cx, cz) {
    const { gridY, size: n } = heights, C = this.config.chunkSize, sea = this.config.seaLevel;
    let lo = Infinity, hi = -Infinity;
    for (let a = 0; a < n * n; a += 3) {
      const y = gridY[a];
      if (y < lo) lo = y;
      if (y > hi) hi = y;
    }
    if (hi < sea - 4) return -2;
    if (lo < sea + 1.5) return 0; // (a shore)
    const g = this.generator, x0 = cx * C, z0 = cz * C;
    if (g.rivers?.inBox(x0 - 8, z0 - 8, x0 + C + 8, z0 + C + 8)?.length) return 0;
    if (hi - lo < 7) return -1; // (flat)
    let wood = 0;
    for (const [u, v] of [[0.5, 0.5], [0.15, 0.15], [0.85, 0.15], [0.15, 0.85], [0.85, 0.85]]) wood += g.getForestDensity(x0 + u * C, z0 + v * C) / 5;
    return wood > 0.72 && hi - lo < 40 ? -1 : 0; // (the ground hardly seen under the trees)
  }

  /**
   * How rugged a chunk's land is, from its ground as built: 2 steep and
   * high (mountainsides, cliffs), 1 broken (badlands, crags), 0 plain or
   * rolling. Its slopes are looked at some 32 m apart, whatever its
   * detail, so it comes out the same however it was built.
   */
  #rugged(heights, resolution, cx = null, cz = null) {
    const { gridX, gridY, gridZ, size: n } = heights;
    const simple = cx === null ? 0 : this.#simple(heights, cx, cz);
    if (simple) return simple;
    const cell = this.config.chunkSize / resolution, k = Math.max(1, Math.round(32 / cell));
    let lo = Infinity, hi = -Infinity, steep = 0;
    for (let j = 0; j < n; j += k) {
      for (let i = 0; i < n; i += k) {
        const a = j * n + i, y = gridY[a];
        lo = Math.min(lo, y);
        hi = Math.max(hi, y);
        for (const b of [i + k < n ? a + k : -1, j + k < n ? a + k * n : -1]) {
          if (b < 0) continue;
          const run = Math.hypot(gridX[b] - gridX[a], gridZ[b] - gridZ[a]) || 1;
          steep = Math.max(steep, Math.abs(gridY[b] - y) / run);
        }
      }
    }
    const range = hi - lo;
    // (Tuned over the world: badlands, mesas, cliffs and the high mountains, not
    // rolling hills; some one chunk in seven, and one in fourteen of ordinary country.)
    return range > 70 || (steep > 0.8 && range > 45) ? 2 : steep > 0.55 && range > 25 ? 1 : 0;
  }

  /**
   * Puts a chunk together, a step at a time (its ground, then each layer:
   * trees, grass, rocks...), so a chunk with a lot on it is spread over a
   * few frames instead of making one of them long. Its old self (at
   * another level of detail) stays till it's all there (see #processQueue).
   */
  *#steps(job) {
    const { key, cx, cz, lod, prepared = null } = job;
    const { chunkSize, lods } = this.config;
    const resolution = job.resolution ?? lods[lod].resolution;
    // A chunk changing detail level keeps whatever wouldn't change: its
    // terrain if the resolution is the same, and any layer whose output
    // depends on nothing that changed (see layer.reuseKey).
    const previous = this.chunks.get(key);
    const sameMesh = previous && previous.resolution === resolution;
    const t0 = performance.now();
    const { geometry, triangles, heights, groundHeightAt, surface } = sameMesh
      ? previous.terrain
      : prepared
        ? chunkFromData(this.generator, this.config, cx, cz, resolution, prepared.data)
        : buildChunkGeometry(this.generator, this.config, cx, cz, resolution);
    this.stats.terrainMs += performance.now() - t0;
    // What a worker worked out for the layers (rock candidates...).
    if (prepared) for (const layer of this.layers) layer.accept?.(prepared, this.generator);

    const group = new Group();
    group.name = `chunk ${key}`;
    group.position.set(cx * chunkSize, 0, cz * chunkSize);

    const mesh = new Mesh(geometry, this.material);
    mesh.name = 'ground';
    mesh.castShadow = true; // hills shade the valleys behind them
    mesh.userData.solid = true; // things (torches) can be placed on it
    mesh.receiveShadow = true;
    group.add(mesh);

    const merged = lod >= (this.config.groundMergeLod ?? Infinity);
    if (merged) mesh.castShadow = mesh.receiveShadow = false;
    const chunk = {
      key, cx, cz, lod, resolution, group, mesh, triangles, groundHeightAt, merged,
      terrain: { geometry, triangles, heights, groundHeightAt, surface },
      surface,
      layerObjects: [],
      reuseKeys: new Map(), // layer -> its reuse key for this build
    };
    const kept = new Set(); // objects handed over from `previous`
    job.partial = { chunk, kept, sameMesh }; // (to be thrown away, if it's no longer wanted part way: see #abort)
    yield;

    for (const layer of this.layers) {
      const context = { chunk, cx, cz, lod, resolution, heights, groundHeightAt, generator: this.generator, config: this.config, prepared };
      const reuseKey = layer.reuseKey?.(context) ?? null;
      let object;
      if (reuseKey !== null && previous && previous.reuseKeys.get(layer) === reuseKey) {
        object = previous.layerObjects.find((o) => o.layer === layer)?.object ?? null;
        if (object) kept.add(object);
      } else {
        const t = performance.now();
        object = layer.build(context);
        this.stats.layers[layer.name] = (this.stats.layers[layer.name] || 0) + performance.now() - t;
      }
      chunk.reuseKeys.set(layer, reuseKey);
      if (object) {
        group.add(object);
        chunk.layerObjects.push({ layer, object });
        // (The little things on it, whose shadows are only cast close by: see cull.)
        object.traverse((m) => m.userData?.smallShadow && ((m.userData.baseCast ??= m.castShadow), (chunk.smallCasters ??= []).push(m)));
        chunk.smallOn = undefined;
        this.cullDirty = true;
      }
      // (A pause after each layer that took real work.)
      if (object && !kept.has(object)) yield;
    }
    job.partial = null;

    // What in it can receive shadows, and the box it all lies in (see setShadowVolume).
    chunk.shadowMeshes = [];
    group.traverse((o) => {
      if (!o.isMesh) return;
      o.userData.shadowReceive ??= o.receiveShadow;
      if (o.userData.shadowReceive) chunk.shadowMeshes.push(o);
    });
    geometry.boundingBox ?? geometry.computeBoundingBox();
    const b = geometry.boundingBox;
    chunk.box = new Box3().set(b.min, b.max).translate(group.position);
    chunk.box.min.y -= 8; // (skirts, and anything sunk in the ground)
    chunk.box.max.y += 45; // trees, rocks and needles standing on it
    // (The very top of anything on it, for hiding it behind the hills: the
    // tallest trees, redwoods and the jungle's giants, stand some 65 m.)
    chunk.top = b.max.y + (this.#tall(cx, cz) ? 70 : 30);
    this.cullDirty = true;
    chunk.shadowed = null;
    this.#applyShadow(chunk);

    // Replace an older LOD of the same chunk only once the new one is ready,
    // so there is never a hole.
    if (previous) this.#unload(previous, sameMesh ? geometry : null, kept);

    this.chunks.set(key, chunk);
    if (merged) this.#tileOf(chunk, true);
    // (Rugged land, seen for the first time: wanted in finer detail, now and from now on.)
    if (!this.rugged.has(key)) {
      this.rugged.set(key, this.#rugged(heights, resolution, cx, cz));
      const finer = this.#resolutionFor(key, lod);
      if (finer !== resolution && this.wanted.get(key) === lod) this.queue.push({ key, cx, cz, lod, resolution: finer, distance: Math.hypot(cx - (this.centre?.[0] ?? cx), cz - (this.centre?.[1] ?? cz)) });
    }
    this.#applyVisibility(chunk);
    this.root.add(group);
    this.triangleCount += triangles;
  }

  /**
   * Tells the chunks where the shadow map reaches (a Frustum: the
   * shadow-casting light's view volume), or null for everywhere. Chunks
   * wholly outside it can't be in shadow (the shadow map would find them
   * lit anyway), so they skip sampling it: the picture is exactly the same
   * but the GPU is spared most of the land in view. Call now and then as
   * the light and the player move.
   */
  setShadowVolume(frustum) {
    this.shadowVolume = frustum;
    for (const chunk of this.chunks.values()) this.#applyShadow(chunk);
  }

  #applyShadow(chunk) {
    const on = !this.shadowVolume || this.shadowVolume.intersectsBox(chunk.box);
    if (chunk.shadowed === on) return;
    chunk.shadowed = on;
    for (const mesh of chunk.shadowMeshes) mesh.receiveShadow = on;
  }

  // Whether the tallest trees (redwoods, the jungle's giants) may stand on a chunk. (Remembered.)
  #tall(cx, cz) {
    const key = `${cx},${cz}`, cache = (this.tallCache ??= new Map());
    if (!cache.has(key)) {
      const C = this.config.chunkSize;
      let tall = false;
      for (const [u, v] of [[0.5, 0.5], [0, 0], [1, 0], [0, 1], [1, 1]]) {
        const w = this.generator.getBiomeWeights((cx + u) * C, (cz + v) * C, {});
        if (w.redwood + w.jungle + w.mangrove > 0.001) tall = true;
      }
      if (cache.size > 20000) cache.clear();
      cache.set(key, tall);
    }
    return cache.get(key);
  }

  /**
   * Hides the chunks the land between hides from `eye` (behind a ridge, a
   * hill, a mountain): they cost nothing to draw. Worked out on the CPU,
   * from the land as drawn, afresh whenever you move or new land comes in,
   * so it never lags behind (nothing pops in a moment late), and only ever
   * hides what's certainly out of sight:
   *  - every patch of land (see ChunkMesher's occluder) is solid only up to
   *    the lowest point of it, and blocks the view only along the ways that
   *    wholly cross it; nearer patches first, each raising the skyline
   *    round you, as the slope up to it from your eye;
   *  - a chunk's hidden when the top of anything on it (its tallest trees)
   *    is below the skyline along every way it spans, from nearer land only;
   *  - never within 250 m (it'd cast shadows you can see), nor underground.
   */
  cull(eye) {
    const moved = !this.cullEye || Math.abs(eye.x - this.cullEye.x) + Math.abs(eye.z - this.cullEye.z) > 0.25 || Math.abs(eye.y - this.cullEye.y) > 0.1;
    // (New land in, while you stand still: four times a second is plenty;
    // a chunk just built is drawn till then, which only ever costs a little.)
    const now = performance.now();
    if (!moved && (!this.cullDirty || now - (this.culledAt ?? 0) < 250)) return;
    this.culledAt = now;
    this.cullEye = { x: eye.x, y: eye.y, z: eye.z };
    this.cullDirty = false;
    const ground = this.groundHeightAt(eye.x, eye.z);
    const on = this.occlusion !== false && this.visibility.surface && eye.y > ground - 0.5;
    this.culled = 0;
    // Small things (bushes, sticks, fallen logs) cast their shadows only
    // close by, where they show: further off they're left out of the
    // shadow maps altogether.
    {
      const C = this.config.chunkSize;
      for (const chunk of this.chunks.values()) {
        if (!chunk.smallCasters) continue;
        const x0 = chunk.cx * C, z0 = chunk.cz * C, dx = Math.max(x0 - eye.x, 0, eye.x - x0 - C), dz = Math.max(z0 - eye.z, 0, eye.z - z0 - C);
        const near = dx * dx + dz * dz < 45 * 45;
        if (chunk.smallOn === near) continue;
        chunk.smallOn = near;
        chunk.smallCasters = chunk.smallCasters.filter((m) => m.parent);
        for (const m of chunk.smallCasters) m.castShadow = near && m.userData.baseCast;
      }
    }
    if (!on) {
      for (const chunk of this.chunks.values()) chunk.group.visible = true;
      return;
    }
    const C = this.config.chunkSize, ex = eye.x, ey = eye.y + 0.5, ez = eye.z; // (a little high: a step up never shows what was hidden)
    const ccx = Math.floor(ex / C), ccz = Math.floor(ez / C);
    // (Worked in arrays kept from one time to the next: nothing new made
    // each time, so no pauses to clear away the old.)
    const sc = (this.cullScratch ??= { n: 0, far: new Float64Array(0), a0: new Float64Array(0), a1: new Float64Array(0), slope: new Float64Array(0), order: [], targets: [] });
    const grow = (need) => {
      if (sc.far.length >= need) return;
      const size = Math.max(need, sc.far.length * 2, 1024);
      for (const k of ['far', 'a0', 'a1', 'slope']) sc[k] = new Float64Array(size);
    };
    // The box (x0, z0)-(x1, z1) seen from the eye: its nearest and farthest
    // distances and the ways it spans (left in `box`).
    const box = (this.cullBox ??= { near: 0, far: 0, a0: 0, a1: 0 });
    const span = (x0, z0, x1, z1) => {
      const dx = Math.max(x0 - ex, 0, ex - x1), dz = Math.max(z0 - ez, 0, ez - z1);
      const fx = Math.max(Math.abs(x0 - ex), Math.abs(x1 - ex)), fz = Math.max(Math.abs(z0 - ez), Math.abs(z1 - ez));
      box.near = Math.sqrt(dx * dx + dz * dz);
      box.far = Math.sqrt(fx * fx + fz * fz);
      const mid = Math.atan2((z0 + z1) / 2 - ez, (x0 + x1) / 2 - ex);
      let lo = 0, hi = 0;
      for (let c = 0; c < 4; c++) {
        const x = c & 1 ? x1 : x0, z = c & 2 ? z1 : z0;
        let d = Math.atan2(z - ez, x - ex) - mid;
        if (d > Math.PI) d -= Math.PI * 2;
        else if (d < -Math.PI) d += Math.PI * 2;
        if (d < lo) lo = d;
        if (d > hi) hi = d;
      }
      box.a0 = mid + lo;
      box.a1 = mid + hi;
    };
    let n = 0;
    const addOccluder = (x0, z0, x1, z1, low) => {
      if (!Number.isFinite(low)) return;
      span(x0, z0, x1, z1);
      if (box.near < 20) return; // (right by you: it spans too much to tell)
      grow(n + 1);
      sc.far[n] = box.far;
      sc.a0[n] = box.a0;
      sc.a1[n] = box.a1;
      // (The least it rises over the line of sight, anywhere across it.)
      sc.slope[n] = (low - ey) / (low > ey ? box.far : box.near);
      n++;
    };
    const targets = sc.targets;
    targets.length = 0;
    for (const chunk of this.chunks.values()) {
      const x0 = chunk.cx * C, z0 = chunk.cz * C;
      const mins = chunk.surface?.occluder;
      if (mins) {
        // The land that blocks the view: each patch its lowest point (finer near).
        const S = Math.round(Math.sqrt(mins.length));
        if (Math.max(Math.abs(chunk.cx - ccx), Math.abs(chunk.cz - ccz)) <= 4) {
          const P = C / S;
          for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) addOccluder(x0 + i * P, z0 + j * P, x0 + (i + 1) * P, z0 + (j + 1) * P, mins[j * S + i]);
        } else {
          chunk.occLow ??= mins.reduce((a, b) => Math.min(a, b), Infinity);
          addOccluder(x0, z0, x0 + C, z0 + C, chunk.occLow);
        }
      }
      span(x0, z0, x0 + C, z0 + C);
      // (Within 250 m never hidden: its shadows might show beyond the hill. With the sun high, they're short: 150 m.)
      if (box.near < (this.sunHigh ? 150 : 250)) {
        if (!chunk.group.visible) chunk.group.visible = true;
        continue;
      }
      const top = chunk.top ?? Infinity;
      const t = (chunk.cullTarget ??= {});
      t.chunk = chunk;
      t.near = box.near;
      t.a0 = box.a0;
      t.a1 = box.a1;
      t.slope = (top - ey) / (top > ey ? box.near : box.far);
      targets.push(t);
    }
    const order = sc.order;
    order.length = n;
    for (let i = 0; i < n; i++) order[i] = i;
    const far = sc.far;
    order.sort((a, b) => far[a] - far[b]);
    targets.sort((a, b) => a.near - b.near);
    const N = 720, step = (Math.PI * 2) / N, sky = (this.sky ??= new Float64Array(N));
    sky.fill(-Infinity);
    let k = 0;
    for (const t of targets) {
      // (The skyline from the land nearer than it: the ways each patch wholly covers.)
      for (; k < n && far[order[k]] <= t.near; k++) {
        const o = order[k], slope = sc.slope[o];
        for (let b = Math.ceil(sc.a0[o] / step), end = Math.floor(sc.a1[o] / step); b < end; b++) {
          const i = ((b % N) + N) % N;
          if (slope > sky[i]) sky[i] = slope;
        }
      }
      let hidden = true;
      for (let b = Math.floor(t.a0 / step), end = Math.floor(t.a1 / step); b <= end && hidden; b++) if (!(sky[((b % N) + N) % N] > t.slope)) hidden = false;
      if (t.chunk.group.visible === hidden) t.chunk.group.visible = !hidden;
      if (hidden) this.culled++;
    }
  }

  /** Removes a chunk; `keepGeometry` and `keep` (layer objects) were handed on to its replacement. */
  #unload(chunk, keepGeometry = null, keep = null) {
    this.cullDirty = true;
    this.root.remove(chunk.group);
    if (chunk.merged) this.#tileOf(chunk, false);
    if (chunk.mesh.geometry !== keepGeometry) chunk.mesh.geometry.dispose();
    for (const { layer, object } of chunk.layerObjects) if (!keep || !keep.has(object)) layer.dispose?.(object);
    this.triangleCount -= chunk.triangles;
  }

  // Adds a far chunk's ground to its tile (or takes it out).
  #tileOf(chunk, add) {
    const T = this.config.groundTile ?? 4;
    const tkey = `${Math.floor(chunk.cx / T)},${Math.floor(chunk.cz / T)}`;
    let tile = this.tiles.get(tkey);
    if (!tile) {
      if (!add) return;
      tile = { tx: Math.floor(chunk.cx / T), tz: Math.floor(chunk.cz / T), members: new Map(), mesh: null, dirty: true };
      this.tiles.set(tkey, tile);
    }
    if (add) tile.members.set(chunk.key, chunk);
    else if (tile.members.get(chunk.key) === chunk) tile.members.delete(chunk.key);
    else return;
    tile.dirty = true;
  }

  // Rebuilds the merged meshes of tiles whose chunks have changed.
  #rebuildTiles() {
    const { chunkSize } = this.config;
    const T = this.config.groundTile ?? 4;
    for (const [tkey, tile] of this.tiles) {
      if (!tile.dirty) continue;
      tile.dirty = false;
      if (tile.mesh) {
        this.root.remove(tile.mesh);
        tile.mesh.geometry.dispose();
        tile.mesh = null;
      }
      if (!tile.members.size) {
        this.tiles.delete(tkey);
        continue;
      }
      const ox = tile.tx * T * chunkSize, oz = tile.tz * T * chunkSize;
      let count = 0;
      for (const c of tile.members.values()) count += c.mesh.geometry.attributes.position.count;
      const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), col = new Float32Array(count * 3), cold = new Float32Array(count);
      let at = 0;
      for (const c of tile.members.values()) {
        const g = c.mesh.geometry;
        const p = g.attributes.position.array, n = g.attributes.position.count;
        const dx = c.cx * chunkSize - ox, dz = c.cz * chunkSize - oz;
        for (let i = 0; i < n; i++) {
          pos[(at + i) * 3] = p[i * 3] + dx;
          pos[(at + i) * 3 + 1] = p[i * 3 + 1];
          pos[(at + i) * 3 + 2] = p[i * 3 + 2] + dz;
        }
        nor.set(g.attributes.normal.array, at * 3);
        col.set(g.attributes.color.array, at * 3);
        cold.set(g.attributes.aCold.array, at);
        at += n;
      }
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new BufferAttribute(pos, 3));
      geometry.setAttribute('normal', new BufferAttribute(nor, 3));
      geometry.setAttribute('color', new BufferAttribute(col, 3));
      geometry.setAttribute('aCold', new BufferAttribute(cold, 1));
      geometry.computeBoundingSphere();
      const mesh = new Mesh(geometry, this.material);
      mesh.name = 'ground';
      mesh.position.set(ox, 0, oz);
      mesh.visible = this.visibility.surface;
      tile.mesh = mesh;
      this.root.add(mesh);
    }
  }

  /**
   * Height of the loaded triangle surface at a world position (what you'd
   * actually stand on). Falls back to the generator where nothing is loaded.
   * NaN means there's a cave mouth here: no ground surface at all.
   */
  groundHeightAt(x, z) {
    const { chunkSize } = this.config;
    const cx = Math.floor(x / chunkSize);
    const cz = Math.floor(z / chunkSize);
    // Vertex jitter lets a chunk's surface poke slightly past its square,
    // so check the neighbours before giving up.
    for (const [dx, dz] of NEIGHBOURS) {
      const chunk = this.chunks.get(`${cx + dx},${cz + dz}`);
      if (!chunk) continue;
      const h = chunk.groundHeightAt(x - (cx + dx) * chunkSize, z - (cz + dz) * chunkSize);
      if (h !== null) return h;
    }
    if (this.generator.caves?.isHole(x, z)) return NaN; // a cave mouth
    return this.generator.getBaseHeight(x, z); // (no chunk here yet: roughly, without working out the rivers)
  }

  /**
   * How much of the land round `position` is in: { done, total } of the
   * chunks within `rings` of the one you're on, each at the detail it
   * should be (see the loading screen in main).
   */
  readyNear(position, rings) {
    const { chunkSize } = this.config;
    const ccx = Math.floor(position.x / chunkSize), ccz = Math.floor(position.z / chunkSize);
    let done = 0, total = 0;
    for (let dz = -rings; dz <= rings; dz++) {
      for (let dx = -rings; dx <= rings; dx++) {
        total++;
        const chunk = this.chunks.get(`${ccx + dx},${ccz + dz}`);
        if (chunk && chunk.lod === this.lodFor(Math.max(Math.abs(dx), Math.abs(dz)))) done++;
      }
    }
    return { done, total };
  }

  get loadedCount() {
    return this.chunks.size;
  }

  get pendingCount() {
    return this.queue.length + this.inFlight.size + this.ready.length;
  }
}
