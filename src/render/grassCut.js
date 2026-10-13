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
    cutMap.needsUpdate = true;
    cutUniforms.uCutOrigin.value.set(oi, ok);
  }

  toJSON() {
    return [...this.cells];
  }

  load(list) {
    this.cells = new Map(list ?? []);
    this.wait = 0;
  }
}
