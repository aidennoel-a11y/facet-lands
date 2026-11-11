/**
 * What's slow to work out about a world, kept from one visit to the next:
 * its rivers, streams and lakes, and where its landmarks lie (each `delta`
 * as the builders hand them to one another: see ChunkManager.#shareRivers).
 * Tracing them is most of the wait when a world's first loaded; a world
 * you've been in before has them straight away.
 *
 * In the browser's own store (IndexedDB), by the world's seed and the build
 * of the game (a new build may shape the land differently, so starts
 * afresh). Where there's no store (a private window, say), nothing's kept
 * and the game works as it did.
 */
const DB = 'facet-lands-world', STORE = 'deltas', MAX_BYTES = 80e6;

function open() {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        const s = req.result.createObjectStore(STORE, { autoIncrement: true });
        s.createIndex('world', 'world');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

let db = null;
const ready = typeof indexedDB === 'undefined' ? Promise.resolve(null) : open().then((d) => (db = d));

/** Everything kept for `world` (a key: seed and build): [delta...], oldest first. Other builds' and long-unused worlds' are cleared out. */
export async function loadDeltas(world, build) {
  await ready;
  if (!db) return [];
  return new Promise((resolve) => {
    try {
      const out = [], tx = db.transaction(STORE, 'readwrite'), s = tx.objectStore(STORE);
      let bytes = 0;
      s.openCursor().onsuccess = (e) => {
        const c = e.target.result;
        if (!c) return;
        const v = c.value;
        // (Another build's: the land may not be the same. Gone.)
        if (v.build !== build) c.delete();
        else if (v.world === world) (out.push(v.delta), (bytes += v.bytes ?? 0));
        c.continue();
      };
      tx.oncomplete = () => ((kept.set(world, bytes)), resolve(out));
      tx.onerror = tx.onabort = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

const kept = new Map(); // world -> bytes kept for it
let pending = [], timer = null;

/** One more delta worked out for `world`: kept (written a few seconds on, with whatever else has come by then). */
export function keepDelta(world, build, delta) {
  if (!db) return;
  // (Not the rock spots: each builder's own, soon stale.)
  const { rocks, ...rest } = delta;
  if (!rest.list?.length && !rest.rivers?.length && !rest.streams?.length && !rest.covered?.length && !rest.big && !rest.caves && !rest.sites) return;
  pending.push({ world, build, delta: rest });
  timer ??= setTimeout(flush, 4000);
}

function flush() {
  timer = null;
  const batch = pending;
  pending = [];
  if (!db || !batch.length) return;
  try {
    const tx = db.transaction(STORE, 'readwrite'), s = tx.objectStore(STORE);
    for (const rec of batch) {
      // (A rough size, to keep a world's store within bounds.)
      let bytes = 200;
      for (const r of rec.delta.list ?? []) bytes += 60 + (r.points?.length ?? 0) * 70;
      bytes += rec.delta.big ? JSON.stringify(rec.delta.big).length : 0;
      const had = kept.get(rec.world) ?? 0;
      if (had + bytes > MAX_BYTES) continue;
      kept.set(rec.world, had + bytes);
      s.add({ ...rec, bytes, at: Date.now() });
    }
    tx.onerror = tx.onabort = () => {};
  } catch {
    // (No room, or no store: nothing kept.)
  }
}
