import { Group, Mesh } from 'three';
import { buildChunkGeometry } from './ChunkMesher.js';

/**
 * Keeps a ring of chunks loaded around the camera.
 *
 * - Chunks within `viewDistance` are built, farther ones are dropped.
 * - Nearby chunks use more triangles than distant ones (LOD).
 * - Building is spread over frames (`chunkBuildBudgetMs`) so moving never
 *   causes a long stall; the closest missing chunks are built first.
 *
 * Extending: register a layer with `addLayer({ name, build, dispose })`.
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
  }

  lodFor(distance) {
    const { lods } = this.config;
    for (let i = 0; i < lods.length; i++) if (distance <= lods[i].maxDistance) return i;
    return lods.length - 1;
  }

  /** Call once per frame with the camera (or player) position and time in seconds. */
  update(position, time = 0) {
    for (const layer of this.layers) layer.update?.(time);
    const { chunkSize } = this.config;
    const ccx = Math.floor(position.x / chunkSize);
    const ccz = Math.floor(position.z / chunkSize);
    const key = `${ccx},${ccz}`;
    if (key !== this.centerKey) {
      this.centerKey = key;
      this.#refreshWanted(ccx, ccz);
    }
    this.#processQueue();
  }

  #refreshWanted(ccx, ccz) {
    const { viewDistance } = this.config;
    const wanted = new Set();
    this.queue.length = 0;

    for (let dz = -viewDistance; dz <= viewDistance; dz++) {
      for (let dx = -viewDistance; dx <= viewDistance; dx++) {
        const distance = Math.sqrt(dx * dx + dz * dz);
        if (distance > viewDistance + 0.5) continue;
        const cx = ccx + dx;
        const cz = ccz + dz;
        const key = `${cx},${cz}`;
        const lod = this.lodFor(Math.max(Math.abs(dx), Math.abs(dz)));
        wanted.add(key);

        const existing = this.chunks.get(key);
        if (!existing || existing.lod !== lod) {
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
    // Always build at least one so progress is guaranteed.
    do {
      const job = this.queue.pop();
      if (!job) return;
      this.#build(job);
    } while (performance.now() < deadline);
  }

  #build({ key, cx, cz, lod }) {
    const { chunkSize, lods } = this.config;
    const resolution = lods[lod].resolution;
    const { geometry, triangles, heights, groundHeightAt } = buildChunkGeometry(this.generator, this.config, cx, cz, resolution);

    const group = new Group();
    group.name = `chunk ${key}`;
    group.position.set(cx * chunkSize, 0, cz * chunkSize);

    const mesh = new Mesh(geometry, this.material);
    mesh.name = 'ground';
    group.add(mesh);

    const chunk = { key, cx, cz, lod, group, mesh, triangles, layerObjects: [] };

    for (const layer of this.layers) {
      const object = layer.build({
        chunk, cx, cz, lod, resolution, heights, groundHeightAt, generator: this.generator, config: this.config,
      });
      if (object) {
        group.add(object);
        chunk.layerObjects.push({ layer, object });
      }
    }

    // Replace an older LOD of the same chunk only once the new one is ready,
    // so there is never a hole.
    const previous = this.chunks.get(key);
    if (previous) this.#unload(previous);

    this.chunks.set(key, chunk);
    this.root.add(group);
    this.triangleCount += triangles;
  }

  #unload(chunk) {
    this.root.remove(chunk.group);
    chunk.mesh.geometry.dispose();
    for (const { layer, object } of chunk.layerObjects) layer.dispose?.(object);
    this.triangleCount -= chunk.triangles;
  }

  get loadedCount() {
    return this.chunks.size;
  }

  get pendingCount() {
    return this.queue.length;
  }
}
