import { AdditiveBlending, BoxGeometry, Color, DynamicDrawUsage, Euler, InstancedMesh, Matrix4, MeshBasicMaterial, MeshLambertMaterial, Quaternion, Vector3 } from 'three';
import { hash2 } from '../noise/random.js';
import { gustAt, windDirection, windStrength, windTime } from '../render/wind.js';
import * as Models from './models.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const TAU = Math.PI * 2;
const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const m4 = new Matrix4(), q = new Quaternion(), e = new Euler(), p = new Vector3(), s = new Vector3();
const glow = new Color(0.78, 1, 0.3), dim = new Color(0.12, 0.16, 0.06), col = new Color();

/**
 * The small life of the world:
 *  - wild bees' nests hanging under the boughs of broad-leaved trees here
 *    and there (always in the same trees: see hivesNear), and their bees,
 *    little blocks of yellow and black, milling round the nest and flying
 *    out to the flowers and back, by day, out of the rain and the winter;
 *  - fireflies over the grass and the wetlands on warm summer nights (in
 *    dry country only down by the water),
 *    drifting low and blinking yellow-green;
 *  - dragonflies over the shallows of lakes, ponds and rivers on warm
 *    days, each keeping to its own stretch: hovering, then darting;
 *  - frogs sitting at the water's edge, croaking at dusk and through the
 *    night in spring and summer, hopping about the bank, leaping into the
 *    water if you come near and swimming off, eyes just above it;
 *  - gnats in clouds, hanging over the water and the wet ground in the
 *    marshes, the wetlands, the mangroves and the jungle (and, fewer, by
 *    any water), most of all at dusk; mosquitoes whining about you there
 *    at night; and flies, buzzing round your head.
 *
 * Each (but the flies round your head) has its own place in the world,
 * picked by the world's seed, and what it does is worked out from the
 * clock: so online, by the room's shared clock (ctx.netTime), everyone
 * sees the same bees, fireflies, dragonflies, gnats and frogs. A frog
 * dives when anyone comes near (ctx.people: the others, online).
 */
export class Insects {
  constructor(scene, materialHook = (m) => m) {
    const lambert = materialHook(new MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    this.hiveMesh = new InstancedMesh(Models.hive(), lambert, 64);
    this.beeMesh = new InstancedMesh(Models.bee(), lambert, 400);
    this.flyMesh = new InstancedMesh(Models.firefly(), new MeshBasicMaterial({ color: 0xffffff }), 260);
    this.haloMesh = new InstancedMesh(Models.firefly(), new MeshBasicMaterial({ color: 0xb8ff50, transparent: true, opacity: 0.35, blending: AdditiveBlending, depthWrite: false }), 260);
    for (const m of [this.hiveMesh, this.beeMesh, this.flyMesh, this.haloMesh]) {
      m.instanceMatrix.setUsage(DynamicDrawUsage);
      m.frustumCulled = false;
      m.count = 0;
      scene.add(m);
    }
    this.hiveMesh.castShadow = true;
    this.hiveMesh.name = 'hives';
    this.beeMesh.name = 'bees';
    this.flyMesh.name = 'fireflies';
    this.haloMesh.name = 'firefly glow';
    this.haloMesh.renderOrder = 5;
    this.dragonMeshes = [Models.dragonfly(), Models.dragonfly(0x3a9a48, 0x24402a), Models.dragonfly(0xc83a2a, 0x5a1e18)].map((g) => new InstancedMesh(g, lambert, 16));
    this.frogMesh = new InstancedMesh(Models.frog(), lambert, 24);
    for (const m of [...this.dragonMeshes, this.frogMesh]) {
      m.instanceMatrix.setUsage(DynamicDrawUsage);
      m.frustumCulled = false;
      m.count = 0;
      scene.add(m);
    }
    this.dragonMeshes.forEach((m) => (m.name = 'dragonflies'));
    this.frogMesh.name = 'frogs';
    // Gnats (specks), and flies (a dark body, two pale wings).
    this.gnatMesh = new InstancedMesh(new BoxGeometry(0.018, 0.018, 0.018), new MeshBasicMaterial({ color: 0x14140e }), 1400);
    this.fly2Mesh = new InstancedMesh(Models.housefly(), lambert, 24);
    for (const m of [this.gnatMesh, this.fly2Mesh]) {
      m.instanceMatrix.setUsage(DynamicDrawUsage);
      m.frustumCulled = false;
      m.count = 0;
      scene.add(m);
    }
    this.gnatMesh.name = 'gnats';
    this.fly2Mesh.name = 'flies';
    this.swarms = [];
    this.buzzers = [];
    this.bugWait = 0;
    this.bugginess = 0;
    this.dragons = [];
    this.frogs = [];
    this.croakWait = 0;
    this.hives = new Map(); // key -> { x, y, z, bees: [] }
    this.flies = [];
    this.wait = 0;
    this.time = 0;
    this.buzz = { level: 0, pan: 0 };
    this.cells = new Map(); // (where things are, cell by cell, worked out once: see #cell)
    this.frogState = new Map(); // (a frog that's dived in: until it's back)
    this.swarmFade = new Map();
  }

  // The first point of a cell (`size` across) that `test` (x, z) finds
  // something at, looking over it on an n × n grid (from a corner picked by
  // the seed): what it found, or null; undefined if the land's not there.
  #search(i, j, size, n, salt, test) {
    const o = Math.floor(this.#h(i, j, salt) * n * n);
    for (let k = 0; k < n * n; k++) {
      const c = (k + o) % (n * n), u = c % n, v = Math.floor(c / n);
      const r = test((i + (u + 0.5) / n) * size, (j + (v + 0.5) / n) * size);
      if (r !== null) return r;
    }
    return null;
  }

  // A number 0..1 fixed by the world's seed for (i, j) and `salt`.
  #h(i, j, salt) {
    return hash2(i | 0, j | 0, (this.seed ^ salt) | 0);
  }

  // Worked out once for a cell: `make` returns what's there, or null; or
  // undefined if it can't tell yet (the land's not there). (Only so many
  // new ones a frame: the rest the next.)
  #cell(key, make) {
    const c = this.cells.get(key);
    // (Nothing there is looked at again now and then: the water may not have been worked out yet.)
    if (c && (c.v || this.time - c.at < 3)) return c.v;
    if (this.budget-- <= 0) return null;
    const v = make();
    if (v !== undefined) this.cells.set(key, { v, at: this.time });
    return v ?? null;
  }

  /** Forgets the nests and insects (a new world). */
  clear() {
    this.hives.clear();
    this.flies = [];
    this.dragons = [];
    this.frogs = [];
    this.swarms = [];
    this.buzzers = [];
    this.cells.clear();
    this.frogState.clear();
    this.swarmFade.clear();
  }

  /**
   * The nests near you: under about one broad-leaved tree in 250 (a
   * big enough one), chosen by where the tree stands, so a nest is always
   * in the same tree. { x, y, z } (y: the nest's top, under the bough).
   */
  hivesNear(ctx) {
    const { camera, trees, chunkSize, seed } = ctx;
    const found = new Map();
    const cx = Math.floor(camera.position.x / chunkSize), cz = Math.floor(camera.position.z / chunkSize);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const list = trees.crowns.get(`${cx + dx},${cz + dz}`);
        if (!list) continue;
        for (let k = 0; k < list.length; k += 5) {
          const [x, z, bottom, top, r] = list.slice(k, k + 5);
          if (top - bottom < 3 || bottom < 2.2) continue;
          const ix = Math.round(x * 10), iz = Math.round(z * 10);
          if (hash2(ix, iz, seed ^ 0xbee5) > 0.004) continue;
          const a = hash2(ix, iz, seed ^ 0x51de) * TAU;
          found.set(`${ix},${iz}`, { x: x + Math.cos(a) * r * 0.3, y: bottom + 0.25, z: z + Math.sin(a) * r * 0.3, tx: x, tz: z });
        }
      }
    }
    return found;
  }

  /**
   * @param ctx { camera, trees, chunkSize, seed, ground(x, z), seaLevel,
   *             day, night, summer, spring, winter, rain, wind, windDir,
   *             meadow (0..1: grass and wetland round you), sheltered, pan(x, z),
   *             waterAt(x, z) (the water there: { level, frozen, hot, lake }, or null),
   *             generator, dusk, sound, splash(x, y, z) }
   */
  update(dt, ctx) {
    this.time += dt;
    this.seed = ctx.seed | 0;
    this.T = ctx.netTime ?? this.time; // (online, the room's clock)
    this.budget = 40;
    if (this.cells.size > 6000) this.cells.clear();
    const hidden = ctx.sheltered;
    for (const m of [this.hiveMesh, this.beeMesh, this.flyMesh, this.haloMesh, ...this.dragonMeshes, this.frogMesh, this.gnatMesh, this.fly2Mesh]) m.visible = !hidden;
    if (hidden) return;
    if (ctx.waterAt) {
      this.#dragonflies(dt, ctx);
      this.#frogs(dt, ctx);
    }
    this.#bugs(dt, ctx);
    const cam = ctx.camera.position;
    this.wait -= dt;
    if (this.wait <= 0) {
      this.wait = 2;
      const found = this.hivesNear(ctx);
      // (And your bee boxes, the ones with a swarm in them: their bees out about them too.)
      for (const b of ctx.beeBoxes ?? []) if (Math.hypot(b.x - cam.x, b.z - cam.z) < 70) found.set(`box${Math.round(b.x * 10)},${Math.round(b.z * 10)}`, { x: b.x, y: b.y + 0.75, z: b.z, tx: b.x, tz: b.z, box: true });
      for (const [key, h] of found) if (!this.hives.has(key)) this.hives.set(key, { ...h, base: ctx.ground(h.tx, h.tz), bees: [] });
    }
    // Bees: out by day in the warm and dry.
    const busy = ctx.day * (1 - ctx.rain) * (1 - ctx.winter) * (1 - 0.5 * Math.max(0, ctx.wind - 0.6));
    let n = 0, b = 0, level = 0, panSum = 0;
    for (const h of this.hives.values()) {
      if (h.box) (h.sx = h.sz = 0);
      else if (n < this.hiveMesh.instanceMatrix.count) {
        // Swaying with its tree's bough, in the wind and the gusts (as the
        // trees' shader moves them: see addWind).
        // (The shader bends by height in the tree's own units; a tree's about 1.8 times its model's size.)
        const up = Math.max(0, (h.y - h.base) / 1.8), bend = 1.8 * Math.pow(up, 1.5);
        const phase = windTime.value * 1.1 + h.tx * 0.045 + h.tz * 0.037;
        const gust = gustAt(h.tx, h.tz) * 0.004 * bend, d = windDirection.value;
        h.sx = (Math.sin(phase) + 0.35 * Math.sin(phase * 2.7)) * 0.012 * windStrength.value * bend + d.x * gust;
        h.sz = 0.6 * Math.cos(phase * 0.8) * 0.012 * windStrength.value * bend + d.y * gust;
        e.set(h.sz * 0.08, 0, -h.sx * 0.08);
        m4.compose(p.set(h.x + h.sx, h.y, h.z + h.sz), q.setFromEuler(e), s.setScalar(1));
        this.hiveMesh.setMatrixAt(n++, m4);
      }
      const d = Math.hypot(h.x - cam.x, h.y - cam.y, h.z - cam.z);
      const want = d < 45 ? Math.round(12 * busy) : 0;
      const hi = Math.round(h.x * 10), hj = Math.round(h.z * 10);
      while (h.bees.length < want) {
        const k = h.bees.length, r = (salt) => this.#h(hi + k * 101, hj, salt);
        h.bees.push({ k, hi, hj, x: h.x, y: h.y - 0.4, z: h.z, a: r(0xb1) * TAU, r: 0.4 + 1.2 * r(0xb2), w: (2 + 2 * r(0xb3)) * (r(0xb4) < 0.5 ? 1 : -1), off: r(0xb5) * 24 });
      }
      if (h.bees.length > want) h.bees.length = want;
      if (h.bees.length) {
        const v = h.bees.length / 12 / (1 + (d / 4) ** 2);
        level += v;
        panSum += v * ctx.pan(h.x, h.z);
      }
      for (const bee of h.bees) {
        this.#bee(bee, h, dt, ctx);
        if (b >= this.beeMesh.instanceMatrix.count) continue;
        e.set(0, bee.heading ?? 0, 0);
        m4.compose(p.set(bee.x, bee.y, bee.z), q.setFromEuler(e), s.setScalar(1.4));
        this.beeMesh.setMatrixAt(b++, m4);
      }
    }
    this.hiveMesh.count = n;
    this.beeMesh.count = b;
    this.hiveMesh.instanceMatrix.needsUpdate = this.beeMesh.instanceMatrix.needsUpdate = true;
    this.buzz.level = Math.min(1, level);
    this.buzz.pan = level ? panSum / level : 0;

    // Fireflies: warm, still nights, over the grass and the marshes. (Each
    // has its own spot, one to a cell of 11 m, out to 90 m: out or not as
    // the night is; drifting about it, rising and sinking, flashing.)
    const warm = ctx.summer * (1 - ctx.winter); // (summer only)
    const share = Math.min(1, ctx.night * warm * (1 - ctx.rain) * (1 - 0.6 * ctx.wind) * ctx.meadow);
    let f = 0;
    const T = this.T, F = 11, ci = Math.floor(cam.x / F), cj = Math.floor(cam.z / F);
    for (let j = cj - 9; j <= cj + 9 && share > 0.004; j++) {
      for (let i = ci - 9; i <= ci + 9 && f < this.flyMesh.instanceMatrix.count; i++) {
        if (this.#h(i, j, 0xf1f0) >= share) continue;
        const spot = this.#cell(`f${i},${j}`, () => {
          const x = (i + this.#h(i, j, 0xf1f1)) * F, z = (j + this.#h(i, j, 0xf1f2)) * F, g = ctx.ground(x, z);
          if (!Number.isFinite(g)) return undefined;
          if (!(g > ctx.seaLevel - 0.5)) return null;
          // (In dry country only down by the water: a creek, a pond, an oasis.)
          const bw = ctx.generator?.getBiomeWeights(x, z, {});
          if (bw && (bw.desert ?? 0) + (bw.savanna ?? 0) + (bw.badlands ?? 0) + (bw.saltFlat ?? 0) > 0.4) {
            const wet = (dx, dz) => ctx.waterAt?.(x + dx, z + dz);
            if (!(wet(0, 0) || wet(10, 0) || wet(-10, 0) || wet(0, 10) || wet(0, -10))) return null;
          }
          return { x, z, g, seed: this.#h(i, j, 0xf1f3) * 100, period: 1.8 + 2.7 * this.#h(i, j, 0xf1f4), offset: this.#h(i, j, 0xf1f5) * 5 };
        });
        if (!spot) continue;
        const d = Math.hypot(spot.x - cam.x, spot.z - cam.z);
        if (d < 12 || d > 90) continue; // (none right by you)
        const fx = spot.x + Math.sin(T * 0.11 + spot.seed) * 2.5 + Math.sin(T * 0.29 + spot.seed * 2);
        const fz = spot.z + Math.cos(T * 0.13 + spot.seed * 1.3) * 2.5 + Math.cos(T * 0.31 + spot.seed);
        const fy = spot.g + 1.2 + Math.sin(T * 0.4 + spot.seed) * 0.9;
        const phase = ((T + spot.offset) % spot.period) / spot.period;
        const on = phase < 0.16 ? Math.sin((phase / 0.16) * Math.PI) : 0;
        m4.compose(p.set(fx, fy, fz), q.identity(), s.setScalar(0.8 + 0.5 * on));
        this.flyMesh.setMatrixAt(f, m4);
        this.flyMesh.setColorAt(f, col.copy(glow).lerp(dim, 1 - on));
        m4.compose(p, q, s.setScalar(on > 0.05 ? 4 + 5 * on : 0));
        this.haloMesh.setMatrixAt(f, m4);
        f++;
      }
    }
    this.flyMesh.count = this.haloMesh.count = f;
    this.flyMesh.instanceMatrix.needsUpdate = this.haloMesh.instanceMatrix.needsUpdate = true;
    if (this.flyMesh.instanceColor) this.flyMesh.instanceColor.needsUpdate = true;
  }

  // A bee: milling round the nest; now and then off to the flowers nearby, a
  // while among them, and back. (Each its own round, every 24 seconds, by
  // the clock: where it is is worked out from the time.)
  #bee(bee, h, dt, ctx) {
    const T = this.T, P = 24;
    const n = Math.floor((T + bee.off) / P), since = T + bee.off - n * P;
    const hx = h.x + (h.sx ?? 0), hz = h.z + (h.sz ?? 0); // (the nest, as it sways)
    const r = (salt) => this.#h(bee.hi + bee.k * 101 + n * 7, bee.hj, salt);
    // (This round's flowers, 3 to 14 m off; it mills about the nest for 6 to 12 s first.)
    const a = r(0xb6) * TAU, d = 3 + 11 * r(0xb7), mill = 6 + 6 * r(0xb8);
    const fx = h.x + Math.cos(a) * d, fz = h.z + Math.sin(a) * d, g = ctx.ground(fx, fz);
    const fy = g + 0.2 + 0.4 * r(0xb9), trip = d / 3.2;
    let tx, ty, tz;
    if (!(g > ctx.seaLevel) || since < mill) {
      const ang = bee.a + bee.w * T;
      tx = hx + Math.cos(ang) * bee.r;
      ty = h.y - 0.35 + Math.sin(ang * 1.7) * 0.35;
      tz = hz + Math.sin(ang) * bee.r;
    } else {
      const x = fx + Math.sin(T * 3 + bee.a) * 0.3, y = fy + Math.sin(T * 5 + bee.a) * 0.1, z = fz + Math.cos(T * 3.3 + bee.a) * 0.3;
      const back = P - trip; // (when it sets off home)
      const u = Math.max(0, Math.min(1, since < mill + trip ? (since - mill) / trip : since > back ? (P - since) / trip : 1));
      tx = hx + (x - hx) * u;
      ty = h.y - 0.4 + (y - (h.y - 0.4)) * u;
      tz = hz + (z - hz) * u;
    }
    if (Math.hypot(tx - bee.x, tz - bee.z) > 0.02) bee.heading = Math.atan2(tx - bee.x, tz - bee.z);
    bee.x = tx + Math.sin(T * 17 + bee.a) * 0.01;
    bee.y = ty + Math.sin(T * 23 + bee.a) * 0.01;
    bee.z = tz;
  }

  // Fresh water, not the sea's, nor a hot spring's, nor frozen.
  #freshWater(x, z, ctx) {
    const w = ctx.waterAt(x, z);
    if (!w || w.frozen || w.hot) return null;
    if (w.lake && ctx.generator.getOceanness(x, z) > 0.5) return null;
    return w;
  }

  // Dragonflies, each keeping to its own stretch of the shallows (one to a
  // cell of 9 m, out to 45 m, out or not as the day is): hovering, then
  // darting to somewhere else over it.
  #dragonflies(dt, ctx) {
    const cam = ctx.camera.position, T = this.T;
    const warm = (ctx.summer + 0.4 * ctx.spring) * (1 - ctx.winter);
    const share = Math.min(1, ctx.day * warm * (1 - ctx.rain) * (1 - 0.7 * Math.max(0, ctx.wind - 0.4)));
    const counts = [0, 0, 0];
    const D = 9, ci = Math.floor(cam.x / D), cj = Math.floor(cam.z / D);
    for (let j = cj - 5; j <= cj + 5 && share > 0.01; j++) {
      for (let i = ci - 5; i <= ci + 5; i++) {
        if (this.#h(i, j, 0xd0f0) >= 0.4 * share) continue;
        const home = this.#cell(`d${i},${j}`, () =>
          this.#search(i, j, D, 5, 0xd0f1, (x, z) => {
            const g = ctx.ground(x, z);
            if (!Number.isFinite(g)) return undefined;
            const w = this.#freshWater(x, z, ctx);
            if (!w || !(w.level - g > 0.05 && w.level - g < 2.5)) return null;
            return { x, z, level: w.level, kind: Math.floor(this.#h(i, j, 0xd0f3) * 3), period: 0.6 + 2.2 * this.#h(i, j, 0xd0f4), off: this.#h(i, j, 0xd0f5) * 3 };
          }),
        );
        if (!home || Math.hypot(home.x - cam.x, home.z - cam.z) > 45) continue;
        // (Where it darted to on its n'th dart: a few metres about its spot.)
        const at = (n) => {
          const a = this.#h(i * 7 + n, j, 0xd0f6) * TAU, r = 1 + 4 * this.#h(i, j * 7 + n, 0xd0f7);
          return { x: home.x + Math.cos(a) * r, y: home.level + 0.35 + 1.15 * this.#h(i + n, j + n, 0xd0f8), z: home.z + Math.sin(a) * r };
        };
        const n = Math.floor((T + home.off) / home.period), since = T + home.off - n * home.period;
        const from = at(n - 1), to = at(n);
        const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z, k = Math.min(1, (7 * since) / (Math.hypot(dx, dy, dz) || 1));
        const mesh = this.dragonMeshes[home.kind];
        if (counts[home.kind] >= mesh.instanceMatrix.count) continue;
        // (A hover's little bob, and the wings' shimmer.)
        e.set(0, Math.atan2(dx, dz), Math.sin(T * 40 + home.x) * 0.08);
        m4.compose(p.set(from.x + dx * k, from.y + dy * k + Math.sin(T * 6 + home.z) * 0.03, from.z + dz * k), q.setFromEuler(e), s.setScalar(1.2));
        mesh.setMatrixAt(counts[home.kind]++, m4);
      }
    }
    this.dragonMeshes.forEach((m, k) => {
      m.count = counts[k];
      m.instanceMatrix.needsUpdate = true;
    });
  }

  // Gnats, mosquitoes and flies: thickest in the wet, warm, still places.
  #bugs(dt, ctx) {
    const cam = ctx.camera.position, g = ctx.generator;
    this.bugWait -= dt;
    if (this.bugWait <= 0 && g) {
      this.bugWait = 1;
      const w = g.getBiomeWeights(cam.x, cam.z, {});
      const wet = Math.min(1, (w.wetland ?? 0) + (w.mangrove ?? 0) + (w.jungle ?? 0) * 0.9);
      const water = ctx.waterAt?.(cam.x, cam.z) || ctx.waterAt?.(cam.x + 12, cam.z) || ctx.waterAt?.(cam.x - 12, cam.z) || ctx.waterAt?.(cam.x, cam.z + 12) || ctx.waterAt?.(cam.x, cam.z - 12);
      const warm = Math.max(0, (ctx.summer ?? 0) + 0.6 * (ctx.spring ?? 0) + 0.3 * (ctx.autumn ?? 0)) * (1 - (ctx.winter ?? 0));
      const high = Math.max(0, Math.min(1, (cam.y - (ctx.seaLevel ?? 0) - 60) / 60)); // (none up on the heights)
      this.bugginess = Math.min(1, wet + (water ? 0.3 : 0) + 0.08) * Math.min(1, warm) * (1 - (ctx.rain ?? 0)) * (1 - Math.min(1, Math.max(0, (ctx.wind ?? 0) - 0.3) * 1.6)) * (1 - high);
    }
    const B = this.bugginess, dusk = Math.max(ctx.dusk ?? 0, 0.6 * (1 - (ctx.day ?? 1)));
    // Clouds of gnats, hanging over the water and the wet ground near you.
    // (Each over its own spot, one to a cell of 9 m, out to 28 m: there or
    // not as the evening is, coming and going slowly.)
    const share = Math.min(1, (B * (0.6 + 0.8 * dusk)) / 3);
    let n = 0;
    const cap = this.gnatMesh.instanceMatrix.count, T = this.T, G = 9;
    const ci = Math.floor(cam.x / G), cj = Math.floor(cam.z / G);
    for (let j = cj - 4; j <= cj + 4; j++) {
      for (let i = ci - 4; i <= ci + 4; i++) {
        const key = `${i},${j}`, there = this.#h(i, j, 0x9a70) < share;
        const fade = Math.max(0, Math.min(1, (this.swarmFade.get(key) ?? 0) + (there ? dt / 2 : -dt * 0.3)));
        if (fade > 0) this.swarmFade.set(key, fade);
        else {
          this.swarmFade.delete(key);
          continue;
        }
        const w = this.#cell(`g${key}`, () => {
          const x = (i + this.#h(i, j, 0x9a71)) * G, z = (j + this.#h(i, j, 0x9a72)) * G, gr = ctx.ground(x, z);
          if (!Number.isFinite(gr)) return undefined;
          const wat = ctx.waterAt?.(x, z);
          const base = wat ? Math.max(gr, wat.level) : gr;
          return { x, z, y: base + 0.6 + 1.6 * this.#h(i, j, 0x9a73), n: 18 + Math.floor(27 * this.#h(i, j, 0x9a74)), r: 0.3 + 0.5 * this.#h(i, j, 0x9a75), seed: this.#h(i, j, 0x9a76) * 100 };
        });
        if (!w || Math.hypot(w.x - cam.x, w.z - cam.z) > 28) continue;
        // (The cloud drifts a little about its spot with the air, and bobs.)
        const wx = w.x + Math.sin(T * 0.05 + w.seed) * 1.5, wz = w.z + Math.cos(T * 0.04 + w.seed) * 1.5;
        const count = Math.round(w.n * fade);
        // (Walk into one, or close by it, and you hear them: a thin buzzing
        // whine about your ears, now and then.)
        const near = Math.hypot(wx - cam.x, w.y - cam.y, wz - cam.z);
        w.heard = (w.heard ?? 0) - dt;
        if (near < 4 && w.heard <= 0 && fade > 0.5) {
          w.heard = rnd(1.2, 3.5) * (near < 1.5 ? 0.6 : 1);
          ctx.sound?.call(dusk > 0.5 ? 'whine' : 'flybuzz', ctx.pan(wx, wz), 0.12 + 0.3 * (1 - near / 4));
        }
        for (let k = 0; k < count && n < cap; k++) {
          const h = w.seed + k * 7.31;
          const r = w.r * (0.4 + 0.6 * ((k * 0.618) % 1));
          p.set(
            wx + Math.sin(T * (3 + (k % 5)) + h) * r + Math.sin(T * 0.7 + h * 2) * r * 0.5,
            w.y + Math.sin(T * (4 + (k % 3)) + h * 1.7) * r * 0.6 + Math.sin(T * 0.5 + w.seed) * 0.15,
            wz + Math.cos(T * (3.5 + (k % 4)) + h * 1.3) * r + Math.cos(T * 0.6 + h) * r * 0.5,
          );
          m4.makeTranslation(p.x, p.y, p.z);
          this.gnatMesh.setMatrixAt(n++, m4);
        }
      }
    }
    this.gnatMesh.count = n;
    this.gnatMesh.instanceMatrix.needsUpdate = true;
    // Flies about your head (by day), mosquitoes (by night): darting in
    // and out, now off, now back, with a buzz or a whine as one goes by your ear.
    const flies = Math.round(5 * B * (ctx.player?.alive === false ? 0 : 1));
    while (this.buzzers.length > flies) this.buzzers.pop();
    while (this.buzzers.length < flies) this.buzzers.push({ x: cam.x + rnd(-6, 6), y: cam.y + rnd(-1, 1), z: cam.z + rnd(-6, 6), vx: 0, vy: 0, vz: 0, tx: 0, ty: 0, tz: 0, retarget: 0, heard: rnd(1, 6) });
    let m = 0;
    const night = (ctx.day ?? 1) < 0.3;
    for (const f of this.buzzers) {
      f.retarget -= dt;
      if (f.retarget <= 0) {
        // (A point near your head, or now and then off a way.)
        const far = Math.random() < 0.25;
        f.retarget = far ? rnd(1, 3) : rnd(0.2, 0.8);
        const a = rnd(0, TAU), d = far ? rnd(2, 5) : rnd(0.3, 1.6);
        f.tx = Math.sin(a) * d;
        f.tz = Math.cos(a) * d;
        f.ty = rnd(-0.8, 0.4);
      }
      const ax = (cam.x + f.tx - f.x) * 30 - f.vx * 6, ay = (cam.y + f.ty - f.y) * 30 - f.vy * 6, az = (cam.z + f.tz - f.z) * 30 - f.vz * 6;
      f.vx += ax * dt;
      f.vy += ay * dt;
      f.vz += az * dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.z += f.vz * dt;
      const d = Math.hypot(f.x - cam.x, f.y - cam.y, f.z - cam.z);
      f.heard -= dt;
      // (One going by your ear: louder the closer it passes.)
      if (d < 1.4 && f.heard <= 0) {
        f.heard = rnd(2, 6);
        ctx.sound?.call(night ? 'whine' : 'flybuzz', ctx.pan(f.x, f.z), 0.2 + 0.35 * (1 - d / 1.4));
      }
      if (night || m >= this.fly2Mesh.instanceMatrix.count) continue; // (a mosquito: too small to see)
      e.set(0, Math.atan2(f.vx, f.vz), 0);
      m4.compose(p.set(f.x, f.y, f.z), q.setFromEuler(e), s.set(1, 1, 1));
      this.fly2Mesh.setMatrixAt(m++, m4);
    }
    this.fly2Mesh.count = m;
    this.fly2Mesh.instanceMatrix.needsUpdate = true;
  }

  // Frogs at the water's edge: each on its own bit of bank (one to a cell
  // of 6 m, out to 32 m, there or not as the season and the hour are),
  // sitting, now and then hopping along it and back; a few out in the
  // shallows, floating. Anyone coming near: a leap, and in (with a plop),
  // swimming off and under; back a while after. Croaking at dusk and
  // through the night, each at its own times.
  #frogs(dt, ctx) {
    const cam = ctx.camera.position, T = this.T;
    const season = (ctx.summer + ctx.spring) * (1 - ctx.winter);
    const share = Math.min(1, season * (1 - 0.5 * ctx.day));
    const chorus = Math.max(ctx.dusk, ctx.night) * season * (1 - 0.6 * ctx.rain);
    const people = [cam, ...(ctx.people ?? [])];
    let n = 0;
    const R = 6, ci = Math.floor(cam.x / R), cj = Math.floor(cam.z / R);
    for (let j = cj - 6; j <= cj + 6; j++) {
      for (let i = ci - 6; i <= ci + 6; i++) {
        if (this.#h(i, j, 0xf709) >= share) continue;
        const home = this.#cell(`r${i},${j}`, () => this.#bank(i, j, R, ctx));
        if (!home || Math.hypot(home.x - cam.x, home.z - cam.z) > 38) continue;
        const key = `${i},${j}`;
        let near = Infinity;
        for (const q of people) near = Math.min(near, Math.hypot(home.x - q.x, home.z - q.z));
        // Someone came near: it dives in, swims off and under; and it's
        // back a minute and a half later, if no one's close.
        let st = this.frogState.get(key);
        if (!st && near < (home.swims ? 2.5 : 5)) this.frogState.set(key, (st = { since: T }));
        if (st && T - st.since > 90 && near > 20) this.frogState.delete(key), (st = null);
        let x, y, z, heading = home.heading, pitch = 0;
        // (Where the ground is now: the land under it is drawn finer or
        // coarser as you come and go, and a frog must sit on it as it is.)
        const groundAt = (gx, gz, fallback) => {
          const g = ctx.ground(gx, gz);
          return Number.isFinite(g) ? g : fallback;
        };
        if (st) {
          const u = T - st.since;
          if (home.swims || u > 0.45) {
            // In the water: off from the bank in a few kicks, then floating
            // there, just its eyes and back above the surface, bobbing;
            // someone close again, and it ducks under a while.
            const ax = home.wx - home.x, az = home.wz - home.z, l = Math.hypot(ax, az) || 1;
            const kicks = Math.max(0, u - 0.45) / 0.7;
            let out = Math.min(2.6, (Math.floor(kicks) + smoothstep(0, 0.45, kicks % 1)) * 0.35);
            // (Only as far as the water goes.)
            while (out > 0 && !this.#freshWater(home.wx + (ax / l) * out, home.wz + (az / l) * out, ctx)) out -= 0.3;
            out = Math.max(0, out);
            x = home.wx + (ax / l) * out;
            z = home.wz + (az / l) * out;
            const settled = out >= 2.2 || kicks > 10;
            heading = settled ? Math.atan2(ax, az) + Math.PI * smoothstep(0, 6, kicks - 10) * 0.8 : Math.atan2(ax, az);
            y = home.level - 0.035 + Math.sin(T * 1.7 + home.off) * 0.008;
            pitch = -0.25;
            if (!home.swims && u > 0.45 && u - dt <= 0.45) {
              ctx.splash?.(x, home.level, z);
              if (Math.hypot(x - cam.x, z - cam.z) < 20) ctx.sound?.call('splash', ctx.pan(x, z), 0.12);
            }
            let nearNow = Infinity;
            for (const q of people) nearNow = Math.min(nearNow, Math.hypot(x - q.x, z - q.z));
            if (u > 2.5 && nearNow < 2.2 && !(st.dive > T - 14)) st.dive = T;
            if (st.dive > T - 14) {
              const k = T - st.dive;
              y = home.level - 0.035 - 0.4 * smoothstep(0, 0.4, k) * (1 - smoothstep(12, 14, k));
              if (y < home.level - 0.3) continue; // (under, out of sight)
            }
          } else {
            // (The leap in, from where it sat.)
            const k = u / 0.45, y0 = groundAt(home.x, home.z, home.y);
            x = home.x + (home.wx - home.x) * 1.1 * k;
            z = home.z + (home.wz - home.z) * 1.1 * k;
            y = y0 + (home.level - y0) * k + Math.sin(k * Math.PI) * 0.35;
            pitch = -0.5 + k;
          }
        } else if (home.swims) {
          // Floating out in the shallows, just its eyes and back up, drifting a little.
          x = home.wx + Math.sin(T * 0.07 + home.off) * 0.4;
          z = home.wz + Math.cos(T * 0.05 + home.off) * 0.4;
          y = home.level - 0.035 + Math.sin(T * 1.7 + home.off) * 0.008;
          heading = home.heading + Math.sin(T * 0.03 + home.off) * 1.5;
          pitch = -0.25;
        } else {
          // Sitting; every so often a hop along the bank (catching a fly), and later back.
          const m = Math.floor((T + home.off) / home.period), since = T + home.off - m * home.period;
          const at = (k) => (k % 2 && home.hop ? home.hop : home);
          const from = at(m + 1), to = at(m), k = Math.min(1, since / 0.3);
          x = from.x + (to.x - from.x) * k;
          z = from.z + (to.z - from.z) * k;
          // (On the ground as it is now, all the way; up in an arc as it hops.)
          y = Math.max(groundAt(x, z, from.y + (to.y - from.y) * k), home.level - 0.02) + (from === to ? 0 : Math.sin(k * Math.PI) * 0.18);
          if (from !== to && k < 1) (heading = Math.atan2(to.x - from.x, to.z - from.z)), (pitch = -0.5 + k);
        }
        // Croaking, at dusk and through the night, each at its own times.
        const c = Math.floor((T + home.off) / home.croak), puff = T + home.off - c * home.croak;
        const croaks = chorus > 0.1 && !st && this.#h(i + c, j, 0xf70b) < chorus * 0.8;
        if (croaks && puff < dt) {
          const d = Math.hypot(x - cam.x, z - cam.z);
          const spring = ctx.spring > 0.5 && this.#h(i, j + c, 0xf70c) < 0.5;
          ctx.sound?.call(spring ? 'peep' : 'croak', ctx.pan(x, z), Math.min(0.6, 5 / (d + 4)) * chorus);
        }
        if (n >= this.frogMesh.instanceMatrix.count) continue;
        e.set(pitch, heading, 0);
        const swell = croaks && puff < 0.6 ? 1 + 0.15 * Math.sin((puff / 0.6) * Math.PI) : 1; // (puffing up to croak)
        m4.compose(p.set(x, y, z), q.setFromEuler(e), s.set(1.3, 1.3 * swell, 1.3));
        this.frogMesh.setMatrixAt(n++, m4);
      }
    }
    this.frogMesh.count = n;
    this.frogMesh.instanceMatrix.needsUpdate = true;
  }

  // A frog's bit of bank in cell (i, j): somewhere right at the water's
  // edge, facing the water, its hop along the bank (if there's bank), and
  // whether it's out in the shallows instead; or null (no bank there), or
  // undefined (the land's not there yet).
  #bank(i, j, R, ctx) {
    const a = this.#h(i, j, 0xf703) * TAU;
    return this.#search(i, j, R, 8, 0xf701, (x, z) => {
      const g = ctx.ground(x, z);
      if (!Number.isFinite(g)) return undefined;
      for (let t = 0; t < 4; t++) {
        const b = (t / 4) * TAU + a, nx = x + Math.sin(b) * 1.2, nz = z + Math.cos(b) * 1.2;
        const w = this.#freshWater(nx, nz, ctx);
        if (!w || !(w.level - ctx.ground(nx, nz) > 0.08) || g < w.level - 0.02 || g > w.level + 0.45) continue;
        // (Its hop along the bank, if there's bank there.)
        const side = b + (this.#h(i, j, 0xf704) < 0.5 ? 1.2 : -1.2), d = 0.35 + 0.45 * this.#h(i, j, 0xf705);
        const hx = x + Math.sin(side) * d, hz = z + Math.cos(side) * d, hg = ctx.ground(hx, hz);
        const hop = Number.isFinite(hg) && hg > w.level - 0.02 && hg < w.level + 0.45 ? { x: hx, z: hz, y: hg } : null;
        return {
          x, z, y: g, heading: b, level: w.level, wx: nx, wz: nz, hop, swims: this.#h(i, j, 0xf706) < 0.25,
          period: 6 + 6 * this.#h(i, j, 0xf707), off: this.#h(i, j, 0xf708) * 12, croak: 4 + 8 * this.#h(i, j, 0xf70a),
        };
      }
      return null;
    });
  }
}
