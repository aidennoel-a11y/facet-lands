import { DataTexture, LinearFilter, RedFormat, Vector2 } from 'three';

/**
 * Grass cut short with a sickle (or scythe): a map of the ground round you,
 * a metre to a texel, how freshly cut each metre is (see GrassLayer: the
 * tufts there drawn short, as stubble). It grows back over a couple of days.
 */
const N = 256;
export const cutMap = new DataTexture(new Uint8Array(N * N), N, N, RedFormat);
cutMap.magFilter = LinearFilter;
cutMap.minFilter = LinearFilter;
cutMap.needsUpdate = true;
export const cutUniforms = { uCutMap: { value: cutMap }, uCutOrigin: { value: new Vector2(1e9, 1e9) }, uCutSize: { value: N } };

export class GrassCut {
  constructor() {
    this.paths = new Map(); // "i,k" -> [how worn, the day last trodden]: the ways you keep walking, worn bare
    this.pathVersion = 0;
    this.cells = new Map(); // "i,k" -> the day it was cut
    this.origin = null;
    this.wait = 0;
  }

  /** Cut round (x, z), `r` metres, on `day` (world days). */
  /** Returns how many square metres of it were standing (not cut already). */
  cut(x, z, r, day) {
    let fresh = 0;
    for (let k = Math.floor(z - r); k <= Math.floor(z + r); k++) {
      for (let i = Math.floor(x - r); i <= Math.floor(x + r); i++) {
        if (Math.hypot(i + 0.5 - x, k + 0.5 - z) > r) continue;
        if (!this.cells.has(`${i},${k}`)) fresh++;
        this.cells.set(`${i},${k}`, day);
      }
    }
    this.wait = 0;
    return fresh;
  }

  /**
   * A step on the grass at (x, z): where you walk again and again the
   * grass is trodden down, then worn away to a bare path (see pathsNear,
   * tilledSoil), which grows over again if you stop using it.
   */
  tread(x, z, day) {
    const i = Math.floor(x), k = Math.floor(z), key = `${i},${k}`;
    if (key === this.lastTread) return;
    this.lastTread = key;
    for (let dk = -1; dk <= 1; dk++) {
      for (let di = -1; di <= 1; di++) {
        const d = Math.hypot(i + di + 0.5 - x, k + dk + 0.5 - z);
        if (d > 1.1) continue;
        const kk = `${i + di},${k + dk}`, was = this.paths.get(kk), w0 = was ? this.#worn(was, day) : 0;
        const w = Math.min(60, w0 + (d < 0.6 ? 1 : 0.45));
        if (Math.floor(w / 4) !== Math.floor(w0 / 4) && w > 6) (this.pathVersion++), (this.wait = 0);
        this.paths.set(kk, [w, day]);
      }
    }
  }

  /** Paved over (a stone road): the grass there gone for good. */
  pave(x, z) {
    for (let dk = -1; dk <= 1; dk++) for (let di = -1; di <= 1; di++) this.paths.set(`${Math.floor(x) + di},${Math.floor(z) + dk}`, [60, 1e9]);
    this.pathVersion++;
    this.wait = 0;
  }

  // (Wear fading as the grass comes back: a few treads' worth a day.)
  #worn([w, at], day) {
    return w - 2.5 * Math.max(0, day - at);
  }

  /**
   * How much of the `size`-metre square at (x, z) is bare (0..1): grass cut
   * short in the last couple of days, or a worn path, or paved: a firebreak.
   */
  bareAt(x, z, size, day) {
    let bare = 0, n = 0;
    const h = size / 2;
    for (let k = Math.floor(z - h); k < Math.floor(z + h); k++) {
      for (let i = Math.floor(x - h); i < Math.floor(x + h); i++) {
        n++;
        const key = `${i},${k}`, cut = this.cells.get(key), path = this.paths.get(key);
        if ((cut !== undefined && day - cut < 2.5) || (path && this.#worn(path, day) > 8)) bare++;
      }
    }
    return n ? bare / n : 0;
  }

  /** How worn (0..1) each metre of path is round (x, z): [[x, z, amount], ...]. */
  pathsNear(x, z, r, day) {
    const out = [];
    for (const [key, v] of this.paths) {
      const w = this.#worn(v, day);
      if (w <= 0) {
        this.paths.delete(key);
        continue;
      }
      const [i, k] = key.split(',').map(Number);
      if (Math.abs(i - x) > r || Math.abs(k - z) > r) continue;
      const s = Math.min(1, Math.max(0, (w - 6) / 18));
      if (s > 0) out.push([i + 0.5, k + 0.5, s]);
    }
    return out;
  }

  /** Keeps the map round you up to date (now and then, or when you've cut more). */
  update(dt, eye, day) {
    this.wait -= dt;
    const oi = Math.round(eye.x / 64) * 64 - N / 2, ok = Math.round(eye.z / 64) * 64 - N / 2;
    if (this.wait > 0 && this.origin && this.origin[0] === oi && this.origin[1] === ok) return;
    this.wait = 5;
    this.origin = [oi, ok];
    const data = cutMap.image.data;
    data.fill(0);
    for (const [key, at] of this.cells) {
      const age = day - at;
      if (age > 2) {
        this.cells.delete(key); // (grown back)
        continue;
      }
      const [i, k] = key.split(',').map(Number), u = i - oi, v = k - ok;
      if (u < 0 || v < 0 || u >= N || v >= N) continue;
      data[v * N + u] = Math.round(255 * (age < 0.5 ? 1 : 1 - (age - 0.5) / 1.5));
    }
    // (And along the paths you've worn, the grass trodden short, or gone.)
    for (const [px, pz, s] of this.pathsNear(oi + N / 2, ok + N / 2, N / 2, day)) {
      const u = Math.floor(px) - oi, v = Math.floor(pz) - ok;
      if (u < 0 || v < 0 || u >= N || v >= N) continue;
      data[v * N + u] = Math.max(data[v * N + u], Math.round(255 * Math.min(1, s * 1.4)));
    }
    cutMap.needsUpdate = true;
    cutUniforms.uCutOrigin.value.set(oi, ok);
  }

  toJSON() {
    return { cut: [...this.cells], paths: [...this.paths].map(([k, [w, at]]) => [k, [Math.round(w * 10) / 10, Math.round(at * 1000) / 1000]]) };
  }

  load(saved) {
    const list = Array.isArray(saved) ? saved : saved?.cut; // (older saves: just the cut grass)
    this.cells = new Map(list ?? []);
    this.paths = new Map(Array.isArray(saved) ? [] : saved?.paths ?? []);
    this.pathVersion++;
    this.wait = 0;
  }
}
