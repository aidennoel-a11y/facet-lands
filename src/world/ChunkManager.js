import { Box3, BufferAttribute, BufferGeometry, Group, Mesh } from 'three';
import { buildChunkGeometry, chunkFromData } from './ChunkMesher.js';

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
    const count = typeof Worker !== 'undefined' && typeof window !== 'undefined'
      ? Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 2))
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
  }

  /** Changes what's drawn; see `visibility`. Cheap to call every frame. */
  setVisibility(surface, caves) {
    if (surface === this.visibility.surface && caves === this.visibility.caves) return;
    this.visibility = { surface, caves };
    for (const chunk of this.chunks.values()) this.#applyVisibility(chunk);
  }

  #applyVisibility(chunk) {
    const { surface, caves } = this.visibility;
    chunk.mesh.visible = surface && !chunk.merged;
    for (const tile of this.tiles.values()) if (tile.mesh) tile.mesh.visible = surface;
    // (From the surface, only the caves behind the mouths close by: past
    // a couple of chunks the opening is too small to see into.)
    const near = this.centre && Math.max(Math.abs(chunk.cx - this.centre[0]), Math.abs(chunk.cz - this.centre[1])) <= 2;
    for (const { layer, object } of chunk.layerObjects) {
      object.visible = layer.name === 'caves' ? caves === 'all' || (object.userData.hasMouth === true && near) : surface;
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

  rebuildAll() {
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
    const { chunkSize } = this.config;
    const ccx = Math.floor(position.x / chunkSize);
    const ccz = Math.floor(position.z / chunkSize);
    const key = `${ccx},${ccz}`;
    if (key !== this.centerKey) {
      this.centerKey = key;
      this.centre = [ccx, ccz];
      this.#refreshWanted(ccx, ccz);
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

  #refreshWanted(ccx, ccz) {
    const { viewDistance } = this.config;
    const wanted = this.wanted;
    wanted.clear();
    this.queue.length = 0;

    for (let dz = -viewDistance; dz <= viewDistance; dz++) {
      for (let dx = -viewDistance; dx <= viewDistance; dx++) {
        const distance = Math.sqrt(dx * dx + dz * dz);
        if (distance > viewDistance + 0.5) continue;
        const cx = ccx + dx;
        const cz = ccz + dz;
        const key = `${cx},${cz}`;
        const lod = this.lodFor(Math.max(Math.abs(dx), Math.abs(dz)));
        wanted.set(key, lod);

        const existing = this.chunks.get(key);
        const pending = this.inFlight.get(key);
        if ((!existing || existing.lod !== lod) && !(pending && pending.lod === lod)) {
          this.queue.push({ key, cx, cz, lod, distance });
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
    const deadline = performance.now() + this.config.chunkBuildBudgetMs;
    this.#dispatch();
    // Put together what's ready (at least one, so progress is guaranteed).
    let built = 0;
    while (built === 0 || performance.now() < deadline) {
      let job = this.ready.shift();
      if (!job) {
        // Without workers, build one right here.
        const k = this.#nextLocal();
        if (k < 0) return;
        job = this.queue.splice(k, 1)[0];
      }
      if (this.#stale(job)) continue;
      const t = performance.now();
      this.#build(job);
      this.stats.ms += performance.now() - t;
      this.stats.builds++;
      built++;
    }
  }

  /**
   * Hands the most urgent jobs to the workers (a few each, so none sits
   * idle between jobs). Even a chunk keeping its mesh at a new level of
   * detail goes to one, for the trees, rocks and so on it now needs.
   * Called every frame and whenever a worker finishes one.
   */
  #dispatch() {
    while (this.workers.length && this.queue.length) {
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
    job.resolution = config.lods[job.lod].resolution;
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
    });
  }

  /**
   * Hands some other job to the least busy worker (see chunkWorker: e.g.
   * { kind: 'minimap', ... }): a Promise of its result. Rejects if there
   * are no workers.
   */
  task(message) {
    const worker = this.workers.reduce((best, w) => (!best || w.busy < best.busy ? w : best), null);
    if (!worker) return Promise.reject(new Error('no workers'));
    const id = this.nextId++;
    worker.busy++;
    return new Promise((resolve, reject) => {
      this.tasks.set(id, { resolve, reject });
      worker.postMessage({ ...message, id, seed: this.generator.seedText, config: this.config });
    });
  }

  #received(worker, message) {
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
    if (this.chunks.get(job.key)?.lod === lod) return true;
    if (lod === job.lod) return false;
    if (job.prepared && this.config.lods[lod].resolution !== job.resolution) return true;
    job.lod = lod;
    return false;
  }

  #build({ key, cx, cz, lod, prepared = null }) {
    const { chunkSize, lods } = this.config;
    const resolution = lods[lod].resolution;
    // A chunk changing detail level keeps whatever wouldn't change: its
    // terrain if the resolution is the same, and any layer whose output
    // depends on nothing that changed (see layer.reuseKey).
    const previous = this.chunks.get(key);
    const sameMesh = previous && previous.resolution === resolution;
    const t0 = performance.now();
    const { geometry, triangles, heights, groundHeightAt } = sameMesh
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
      terrain: { geometry, triangles, heights, groundHeightAt },
      layerObjects: [],
      reuseKeys: new Map(), // layer -> its reuse key for this build
    };
    const kept = new Set(); // objects handed over from `previous`

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
      }
    }

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
    chunk.shadowed = null;
    this.#applyShadow(chunk);

    // Replace an older LOD of the same chunk only once the new one is ready,
    // so there is never a hole.
    if (previous) this.#unload(previous, sameMesh ? geometry : null, kept);

    this.chunks.set(key, chunk);
    if (merged) this.#tileOf(chunk, true);
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

  /** Removes a chunk; `keepGeometry` and `keep` (layer objects) were handed on to its replacement. */
  #unload(chunk, keepGeometry = null, keep = null) {
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

  get loadedCount() {
    return this.chunks.size;
  }

  get pendingCount() {
    return this.queue.length + this.inFlight.size + this.ready.length;
  }
}
