import { BufferAttribute, BufferGeometry, Color, DoubleSide, DynamicDrawUsage, Euler, InstancedMesh, Matrix4, MeshLambertMaterial, Quaternion, Vector3 } from 'three';
import { hash2, hashSeed } from '../noise/random.js';

const MAX = 120;
const TAU = Math.PI * 2;

/** A low-poly fish a metre long (scaled down): a faceted body, dark above and pale below, and a tail fin. */
function fishGeometry() {
  const nose = [0, 0, 0.5], root = [0, 0, -0.3], top = [0, 0.18, 0.05], belly = [0, -0.15, 0.05], left = [-0.09, 0, 0.05], right = [0.09, 0, 0.05];
  const fin = [[0, 0, -0.26], [0, 0.17, -0.56], [0, -0.15, -0.56]];
  const tris = [
    [nose, top, right], [nose, right, belly], [nose, belly, left], [nose, left, top],
    [root, right, top], [root, belly, right], [root, left, belly], [root, top, left],
    fin, [fin[0], fin[2], fin[1]],
  ];
  const pos = [], col = [];
  const DARK = [0.24, 0.3, 0.28], MID = [0.55, 0.58, 0.54], PALE = [0.86, 0.86, 0.8];
  for (const t of tris) {
    for (const v of t) {
      pos.push(...v);
      col.push(...(v[1] > 0.05 ? DARK : v[1] < -0.05 ? PALE : MID));
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
  g.computeVertexNormals();
  return g;
}

// Their colours: trout, char, bass; and salmon, red for the run in autumn; and silvery fish of the sea.
const RIVER_TINTS = [0x9aa888, 0x8c9a7c, 0x7f8f6a];
const SALMON = 0xc0584a;
const SEA_TINTS = [0xb8c8d8, 0x9fb4c8, 0xc8c0a8];

const m4 = new Matrix4(), q = new Quaternion(), e = new Euler(0, 0, 0, 'YXZ'), p = new Vector3(), s = new Vector3(), tint = new Color();

/**
 * Fish, in the water round you: trout holding in the rivers facing
 * upstream, darting now and then; shoals turning slowly together in the
 * lakes and the shallow sea (seen through the clear water); one leaping
 * clear of the water now and then with a splash; and in summer and autumn
 * salmon leaping at the waterfalls, trying to get up them.
 *
 * Each has its own place in the world (picked by the world's seed, so
 * it's always there), and what it does is worked out from the clock: so
 * online, by the room's shared clock, everyone sees the same fish doing
 * the same thing (ctx.netTime).
 */
export class Fish {
  constructor(scene, materialHook = (m) => m) {
    this.mesh = new InstancedMesh(fishGeometry(), materialHook(new MeshLambertMaterial({ vertexColors: true, side: DoubleSide })), MAX);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.setColorAt(0, new Color());
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.name = 'fish';
    scene.add(this.mesh);
    this.cells = new Map(); // where the fish are, cell by cell (see #cell): worked out once
    this.leaping = new Set(); // (those in the air last frame: a splash as they go in and come out)
    this.falls = [];
    this.wait = 0;
    this.time = 0;
    this.list = []; // (this frame's fish, drawn: { x, y, z, heading, pitch, size, tint, leap })
  }

  clear() {
    this.cells.clear();
    this.leaping.clear();
  }

  // A number 0..1 fixed by the world's seed for (i, j) and `salt`.
  #h(i, j, salt) {
    return hash2(i, j, (this.seed ^ salt) | 0);
  }

  // What lives in a cell of the water, worked out the first time it's
  // needed: a trout holding in a river (kind 'r'), a shoal in a lake or
  // the shallow sea ('s'), or nothing.
  #cell(kind, i, j, size, ctx) {
    const key = `${kind}${i},${j}`;
    const c = this.cells.get(key);
    // (Nothing there is looked at again now and then: the water may not have been worked out yet.)
    if (c && (c.v || this.time - c.at < 3)) return c.v;
    let found = null;
    let x = (i + 0.15 + 0.7 * this.#h(i, j, 0xf151)) * size, z = (j + 0.15 + 0.7 * this.#h(i, j, 0xf152)) * size;
    let w = ctx.waterAt(x, z), bed = ctx.ground(x, z);
    if (!Number.isFinite(bed)) return null; // (the land's not there yet: later)
    const river = (w, bed) => w && w.speed > 0 && w.level - bed > 0.45;
    if (kind === 'r' && this.#h(i, j, 0xf153) < 0.55) {
      // (Looked for over the cell, a couple of metres apart: a creek's only a few metres across.)
      const o = Math.floor(this.#h(i, j, 0xf15b) * 16);
      for (let t = 0; t < 16 && !river(w, bed); t++) {
        const c = (t + o) % 16;
        x = (i + ((c % 4) + 0.5) / 4) * size;
        z = (j + (Math.floor(c / 4) + 0.5) / 4) * size;
        w = ctx.waterAt(x, z);
        bed = ctx.ground(x, z);
      }
      if (river(w, bed)) {
        const up = Math.atan2(-(w.fx ?? 0), -(w.fz ?? 0));
        found = { x, z, y: Math.max(bed + 0.15, w.level - 0.35), level: w.level, up, size: 0.3 + 0.2 * this.#h(i, j, 0xf154), tint: RIVER_TINTS[Math.floor(this.#h(i, j, 0xf155) * 3)] };
        // (It darts up into the current: so long as that's still water.)
        found.dart = ctx.waterAt(x + Math.sin(up) * 1.3, z + Math.cos(up) * 1.3) ? 1.25 : 0;
      }
    } else if (kind === 's' && this.#h(i, j, 0xf156) < 0.4 && w && !(w.speed > 0) && w.level - bed > 1.5 && w.level - bed < 12) {
      // (A shoal wanders round its patch of water, five metres or so each way: so it must all be deep enough.)
      let deep = true;
      for (let k = 0; k < 8 && deep; k++) {
        const px = x + Math.sin((k / 8) * TAU) * 7, pz = z + Math.cos((k / 8) * TAU) * 7;
        const pw = ctx.waterAt(px, pz), pg = ctx.ground(px, pz);
        deep = !!pw && pw.level - pg > 1.2;
      }
      if (deep) {
        const depth = w.level - bed, sea = !!w.lake;
        found = {
          x, z, level: w.level, y: w.level - Math.min(depth * 0.4, 1.4) - 0.3, n: 8 + Math.floor(this.#h(i, j, 0xf157) * 8),
          tint: (sea ? SEA_TINTS : RIVER_TINTS)[Math.floor(this.#h(i, j, 0xf158) * 3)], speed: 0.6 + 0.6 * this.#h(i, j, 0xf159), phase: this.#h(i, j, 0xf15a) * TAU,
        };
      }
    }
    this.cells.set(key, { v: found, at: this.time });
    return found;
  }

  /**
   * @param ctx  { camera, generator, ground(x, z), waterAt(x, z), traces, sound, pan(x, z),
   *              day, winter, autumn, summer, sheltered, seed, netTime }
   */
  update(dt, ctx) {
    this.time += dt;
    this.seed = ctx.seed | 0;
    const T = ctx.netTime ?? this.time; // (online, the room's clock)
    const cam = ctx.camera.position;
    this.mesh.visible = !ctx.sheltered;
    this.wait -= dt;
    if (this.wait <= 0) {
      this.wait = 1;
      this.#findFalls(ctx);
      if (this.cells.size > 4000) this.cells.clear(); // (forgetting the water far behind)
    }
    const list = (this.list = []);
    const high = cam.y - ctx.ground(cam.x, cam.z) > 120; // (not from high up)
    if (!high) {
      // River fish, holding in the stream, darting up it now and then and
      // drifting back. (Cells of 8 m out to 60 m.)
      const R = 8, ci = Math.floor(cam.x / R), cj = Math.floor(cam.z / R);
      for (let j = cj - 8; j <= cj + 8; j++) {
        for (let i = ci - 8; i <= ci + 8; i++) {
          const f = this.#cell('r', i, j, R, ctx);
          if (!f || Math.hypot(f.x - cam.x, f.z - cam.z) > 60) continue;
          const P = 4 + 7 * this.#h(i, j, 0xf160), off = this.#h(i, j, 0xf161) * P;
          const sIn = (T + off) % P;
          const along = f.dart * (sIn < 0.5 ? sIn / 0.5 : 1 - (sIn - 0.5) / (P - 0.5));
          list.push({ id: `r${i},${j}`, x: f.x + Math.sin(f.up) * along, y: f.y, z: f.z + Math.cos(f.up) * along, level: f.level, heading: f.up, size: f.size, tint: f.tint, wig: T * 4 + off, shoal: false });
        }
      }
      // Shoals in the lakes and the shallow sea, wandering round their
      // patch, turning together. (Cells of 40 m out to 90 m; not in winter.)
      if (!(ctx.winter > 0.6)) {
        const S = 40, si = Math.floor(cam.x / S), sj = Math.floor(cam.z / S);
        for (let j = sj - 2; j <= sj + 2; j++) {
          for (let i = si - 2; i <= si + 2; i++) {
            const sh = this.#cell('s', i, j, S, ctx);
            if (!sh || Math.hypot(sh.x - cam.x, sh.z - cam.z) > 90) continue;
            // (Round a loop five metres or so across, at its own pace.)
            const u = T * 0.12 * sh.speed + sh.phase;
            const cx = sh.x + Math.sin(u) * 5, cz = sh.z + Math.sin(u * 0.7 + 1.3) * 4;
            const heading = Math.atan2(Math.cos(u) * 5, Math.cos(u * 0.7 + 1.3) * 0.7 * 4);
            for (let k = 0; k < sh.n; k++) {
              const off = 0.4 + 1.8 * this.#h(i * 31 + k, j, 0xf162);
              list.push({
                id: `s${i},${j},${k}`, x: cx + Math.sin(heading + k * 2.4) * off + Math.sin(T * 0.8 + k) * 0.3, y: sh.y + (this.#h(i, j * 17 + k, 0xf163) - 0.5) * 0.6, z: cz + Math.cos(heading + k * 2.4) * off,
                level: sh.level, heading, size: 0.22 + 0.12 * this.#h(i + k, j, 0xf164), tint: sh.tint, wig: T * 7 + k, shoal: true,
              });
            }
          }
        }
      }
    }
    // Leaps: now and then one clears the water (each every couple of
    // minutes, at its own time).
    for (const f of list) {
      const hh = hash2(hashSeed(f.id) | 0, 7, this.seed ^ 0x1ea9);
      const P = 90 + 120 * hh, start = Math.floor((T + hh * P) / P) * P - hh * P, h = 0.8 + 0.8 * hh, dur = 0.45 + Math.sqrt(h) * 0.35;
      const k = (T - start) / dur;
      if (k >= 0 && k < 1 && Math.hypot(f.x - cam.x, f.z - cam.z) < 45) {
        const d = 0.8 + hh;
        f.x += Math.sin(f.heading) * d * k;
        f.z += Math.cos(f.heading) * d * k;
        f.y = f.level - 0.3 + Math.sin(Math.PI * k) * h;
        f.pitch = -Math.cos(Math.PI * k) * 0.9;
        f.leap = true;
      }
    }
    // Salmon at the falls, in summer and autumn: one after another up the
    // fall (most don't make it: they drop back).
    const run = Math.max(ctx.summer ?? 0, ctx.autumn ?? 0);
    if (run >= 0.3) {
      for (const fall of this.falls) {
        if (Math.hypot(fall.x - cam.x, fall.z - cam.z) > 90) continue;
        const P = 3.5 / run, n0 = Math.floor(T / P);
        for (let n = n0 - 2; n <= n0; n++) {
          const r = (salt) => hash2(fall.i + n * 13, fall.j, this.seed ^ salt);
          const made = r(0x5a1) < 0.35, h = Math.min(4, fall.drop + (made ? 0.6 : -0.3)), dur = 0.45 + Math.sqrt(Math.max(0.2, h)) * 0.35;
          const k = (T - n * P) / dur;
          if (k < 0 || k >= 1) continue;
          const x0 = fall.x + (r(0x5a2) * 2 - 1) * fall.w, z0 = fall.z + (r(0x5a3) * 2 - 1) * fall.w;
          const reach = made ? 2.5 : 0.8 + r(0x5a4);
          const x1 = x0 + Math.sin(fall.up) * reach, z1 = z0 + Math.cos(fall.up) * reach;
          const y0 = fall.low - 0.3, y1 = made ? fall.high - 0.3 : fall.low - 0.3;
          list.push({
            id: `f${fall.key}:${n}`, x: x0 + (x1 - x0) * k, z: z0 + (z1 - z0) * k, y: y0 + (y1 - y0) * k + Math.sin(Math.PI * k) * h, level: k < 0.5 ? fall.low : y1 + 0.3,
            heading: fall.up, pitch: -Math.cos(Math.PI * k) * 0.9, size: 0.55 + 0.25 * r(0x5a5), tint: SALMON, leap: true, wig: 0,
          });
        }
      }
    }
    // (A splash as each goes up out of the water, and as it comes down.)
    const now = new Set();
    for (const f of list) {
      if (!f.leap) continue;
      now.add(f.id);
      if (!this.leaping.has(f.id)) ctx.traces?.splash(f.x, f.level, f.z, 6, 1.6, 0.8);
    }
    for (const id of this.leaping) {
      const f = this.lastLeap?.get(id);
      if (now.has(id) || !f) continue;
      ctx.traces?.splash(f.x, f.level, f.z, 10, 2, 1.1);
      if (Math.hypot(f.x - cam.x, f.z - cam.z) < 40) ctx.sound?.call('splash', ctx.pan(f.x, f.z), 0.35);
    }
    this.leaping = now;
    this.lastLeap = new Map(list.filter((f) => f.leap).map((f) => [f.id, f]));

    // Into the instanced mesh.
    let n = 0;
    for (const f of list) {
      if (n >= MAX) break;
      const wig = f.leap ? Math.sin(this.time * 18) * 0.25 : Math.sin(f.wig ?? 0) * (f.shoal ? 0.18 : 0.1);
      e.set(f.pitch ?? 0, f.heading + wig, 0, 'YXZ');
      q.setFromEuler(e);
      this.mesh.setMatrixAt(n, m4.compose(p.set(f.x, f.y, f.z), q, s.setScalar(f.size)));
      this.mesh.setColorAt(n, tint.set(f.tint));
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  // The falls near you, for the salmon.
  #findFalls(ctx) {
    const cam = ctx.camera.position;
    this.falls = [];
    const g = ctx.generator;
    if (!g?.rivers) return;
    for (const course of g.rivers.inBox(cam.x - 90, cam.z - 90, cam.x + 90, cam.z + 90)) {
      const P = course.points;
      for (let i = 0; i < P.length - 1; i++) {
        const a = P[i], b = P[i + 1];
        const run = Math.hypot(b.x - a.x, b.z - a.z) || 1, drop = a.level - b.level;
        if (drop < 0.8 || drop / run < 0.4 || drop > 4.5) continue;
        if (Math.hypot(b.x - cam.x, b.z - cam.z) > 90) continue;
        this.falls.push({
          key: `${Math.round(a.x)},${Math.round(a.z)}`, i: Math.round(a.x), j: Math.round(a.z),
          x: b.x + ((b.x - a.x) / run) * 1.5, z: b.z + ((b.z - a.z) / run) * 1.5, low: b.level, high: a.level, drop, up: Math.atan2(a.x - b.x, a.z - b.z), w: Math.max(0.5, b.width * 0.3),
        });
      }
    }
  }
}
