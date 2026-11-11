import { BufferAttribute, BufferGeometry, Group, Mesh } from 'three';

/**
 * Far off, a layer's per-chunk meshes (a river's water, a lake's) merged
 * into squares of several chunks a side: one draw for a whole square
 * instead of one for every chunk in it. What's merged must be plain
 * meshes, unindexed, in their chunk's own frame, all with one material
 * (see the ground's own tiles, ChunkManager.#tileOf).
 *
 * `add` a chunk's geometry (kept, not copied), getting a handle; `remove`
 * it by that handle; `flush` each frame rebuilds the squares that changed.
 * `group` holds the merged meshes: added to the scene by whoever made it.
 */
export function createTiler({ chunkSize, tile = 4, material, name, renderOrder = 0, receiveShadow = true, pad = 0 }) {
  const group = new Group();
  group.name = `${name} tiles`;
  const tiles = new Map();
  let nextId = 1;

  const tiler = {
    group,

    /** A chunk's geometry (in the chunk's frame), into its square. Returns a handle. */
    add(cx, cz, geometry) {
      const tx = Math.floor(cx / tile), tz = Math.floor(cz / tile), key = `${tx},${tz}`;
      let t = tiles.get(key);
      if (!t) tiles.set(key, (t = { tx, tz, members: new Map(), mesh: null, dirty: true }));
      const id = nextId++;
      t.members.set(id, { cx, cz, geometry });
      t.dirty = true;
      return { key, id };
    },

    remove(handle) {
      const t = handle && tiles.get(handle.key);
      if (!t || !t.members.delete(handle.id)) return;
      t.dirty = true;
    },

    /** The squares whose chunks changed, merged afresh. */
    flush() {
      for (const [key, t] of tiles) {
        if (!t.dirty) continue;
        t.dirty = false;
        if (t.mesh) {
          group.remove(t.mesh);
          t.mesh.geometry.dispose();
          t.mesh = null;
        }
        if (!t.members.size) {
          tiles.delete(key);
          continue;
        }
        t.mesh = merge(t);
        if (t.mesh) group.add(t.mesh);
      }
    },
  };

  function merge(t) {
    const ox = t.tx * tile * chunkSize, oz = t.tz * tile * chunkSize;
    // (Every attribute any of them has: one missing from a chunk left at nought there.)
    const sizes = new Map(), kinds = new Map();
    let count = 0;
    for (const m of t.members.values()) {
      const g = m.geometry;
      count += g.attributes.position.count;
      for (const [n, a] of Object.entries(g.attributes)) if (!sizes.has(n)) (sizes.set(n, a.itemSize), kinds.set(n, a.array.constructor));
    }
    if (!count) return null;
    const out = {};
    for (const [n, size] of sizes) out[n] = new (kinds.get(n))(count * size);
    let at = 0;
    for (const m of t.members.values()) {
      const g = m.geometry, n = g.attributes.position.count;
      for (const [name, size] of sizes) {
        const a = g.attributes[name];
        if (!a) continue;
        if (name === 'position') {
          const p = a.array, dst = out.position, dx = m.cx * chunkSize - ox, dz = m.cz * chunkSize - oz;
          for (let i = 0; i < n; i++) {
            dst[(at + i) * 3] = p[i * 3] + dx;
            dst[(at + i) * 3 + 1] = p[i * 3 + 1];
            dst[(at + i) * 3 + 2] = p[i * 3 + 2] + dz;
          }
        } else out[name].set(a.array.subarray(0, n * size), at * size);
      }
      at += n;
    }
    const geometry = new BufferGeometry();
    for (const [n, size] of sizes) geometry.setAttribute(n, new BufferAttribute(out[n], size));
    geometry.computeBoundingSphere();
    geometry.boundingSphere.radius += pad;
    const mesh = new Mesh(geometry, material);
    mesh.name = name;
    mesh.position.set(ox, 0, oz);
    mesh.renderOrder = renderOrder;
    mesh.receiveShadow = receiveShadow;
    mesh.updateMatrixWorld();
    return mesh;
  }

  return tiler;
}
