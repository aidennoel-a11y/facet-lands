import { AdditiveBlending, BoxGeometry, Color, DynamicDrawUsage, Euler, InstancedMesh, Matrix4, MeshBasicMaterial, MeshLambertMaterial, Quaternion, Vector3 } from 'three';
import { hash2 } from '../noise/random.js';
import { gustAt, windDirection, windStrength, windTime } from '../render/wind.js';
import * as Models from './models.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const TAU = Math.PI * 2;
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
  }

  /** Forgets the nests and insects (a new world). */
  clear() {
    this.hives.clear();
    this.flies = [];
    this.dragons = [];
    this.frogs = [];
    this.swarms = [];
    this.buzzers = [];
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
      for (const key of this.hives.keys()) if (!found.has(key)) this.hives.delete(key);
      for (const [key, h] of found) if (!this.hives.has(key)) this.hives.set(key, { ...h, base: ctx.ground(h.tx, h.tz), bees: [] });
    }
    // Bees: out by day in the warm and dry.
    const busy = ctx.day * (1 - ctx.rain) * (1 - ctx.winter) * (1 - 0.5 * Math.max(0, ctx.wind - 0.6));
    let n = 0, b = 0, level = 0, panSum = 0;
    for (const h of this.hives.values()) {
      if (n < this.hiveMesh.instanceMatrix.count) {
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
      while (h.bees.length < want) h.bees.push({ x: h.x, y: h.y - 0.4, z: h.z, mode: 'mill', t: rnd(0, 5), a: rnd(0, TAU), r: rnd(0.4, 1.6), w: rnd(2, 4) * (Math.random() < 0.5 ? 1 : -1) });
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

    // Fireflies: warm, still nights, over the grass and the marshes.
    const warm = ctx.summer * (1 - ctx.winter); // (summer only)
    const want = Math.round(220 * ctx.night * warm * (1 - ctx.rain) * (1 - 0.6 * ctx.wind) * ctx.meadow);
    this.flies = this.flies.filter((f) => Math.hypot(f.x - cam.x, f.z - cam.z) < 110);
    for (let k = 0; this.flies.length < want && k < 8; k++) {
      // (Spread evenly over the ground round you, out to 90 m, none right by you.)
      const a = rnd(0, TAU), d = Math.sqrt(rnd(12 * 12, 90 * 90));
      const x = cam.x + Math.sin(a) * d, z = cam.z + Math.cos(a) * d, g = ctx.ground(x, z);
      if (!(g > ctx.seaLevel - 0.5)) continue;
      // (In dry country only down by the water: a creek, a pond, an oasis.)
      const bw = ctx.generator?.getBiomeWeights(x, z, {});
      if (bw && (bw.desert ?? 0) + (bw.savanna ?? 0) + (bw.badlands ?? 0) + (bw.saltFlat ?? 0) > 0.4) {
        const wet = (dx, dz) => ctx.waterAt?.(x + dx, z + dz);
        if (!(wet(0, 0) || wet(10, 0) || wet(-10, 0) || wet(0, 10) || wet(0, -10))) continue;
      }
      this.flies.push({ x, z, y: g + rnd(0.3, 2.2), hover: g, vx: 0, vz: 0, period: rnd(1.8, 4.5), offset: rnd(0, 5), seed: rnd(0, 100) });
    }
    if (this.flies.length > want) this.flies.length = Math.max(want, this.flies.length - Math.ceil(dt * 20));
    let f = 0;
    for (const fly of this.flies) {
      // Drifting slowly, rising and sinking, now and then flashing.
      fly.vx += rnd(-1, 1) * dt * 0.8 - fly.vx * dt * 0.5;
      fly.vz += rnd(-1, 1) * dt * 0.8 - fly.vz * dt * 0.5;
      fly.x += fly.vx * dt;
      fly.z += fly.vz * dt;
      fly.y = fly.hover + 1.2 + Math.sin(this.time * 0.4 + fly.seed) * 0.9;
      const phase = ((this.time + fly.offset) % fly.period) / fly.period;
      const on = phase < 0.16 ? Math.sin((phase / 0.16) * Math.PI) : 0;
      m4.compose(p.set(fly.x, fly.y, fly.z), q.identity(), s.setScalar(0.8 + 0.5 * on));
      this.flyMesh.setMatrixAt(f, m4);
      this.flyMesh.setColorAt(f, col.copy(glow).lerp(dim, 1 - on));
      m4.compose(p, q, s.setScalar(on > 0.05 ? 4 + 5 * on : 0));
      this.haloMesh.setMatrixAt(f, m4);
      f++;
      if (f >= this.flyMesh.instanceMatrix.count) break;
    }
    this.flyMesh.count = this.haloMesh.count = f;
    this.flyMesh.instanceMatrix.needsUpdate = this.haloMesh.instanceMatrix.needsUpdate = true;
    if (this.flyMesh.instanceColor) this.flyMesh.instanceColor.needsUpdate = true;
  }

  // A bee: milling round the nest; now and then off to the flowers nearby, a
  // while among them, and back.
  #bee(bee, h, dt, ctx) {
    bee.t -= dt;
    let tx, ty, tz;
    const hx = h.x + (h.sx ?? 0), hz = h.z + (h.sz ?? 0); // (the nest, as it sways)
    if (bee.mode === 'mill') {
      bee.a += bee.w * dt;
      tx = hx + Math.cos(bee.a) * bee.r;
      ty = h.y - 0.35 + Math.sin(bee.a * 1.7) * 0.35;
      tz = hz + Math.sin(bee.a) * bee.r;
      if (bee.t <= 0) {
        const a = rnd(0, TAU), d = rnd(3, 14);
        const x = h.x + Math.cos(a) * d, z = h.z + Math.sin(a) * d, g = ctx.ground(x, z);
        if (g > ctx.seaLevel) (bee.mode = 'out'), (bee.to = { x, y: g + rnd(0.2, 0.6), z }), (bee.t = rnd(3, 7));
        else bee.t = rnd(2, 6);
      }
    } else {
      const home = bee.mode === 'back';
      tx = home ? hx : bee.to.x + Math.sin(this.time * 3 + bee.a) * 0.3;
      ty = home ? h.y - 0.4 : bee.to.y + Math.sin(this.time * 5 + bee.a) * 0.1;
      tz = home ? hz : bee.to.z + Math.cos(this.time * 3.3 + bee.a) * 0.3;
      if (!home && bee.t <= 0) bee.mode = 'back';
      if (home && Math.hypot(bee.x - hx, bee.z - hz) < 0.6) (bee.mode = 'mill'), (bee.t = rnd(4, 15));
    }
    const dx = tx - bee.x, dy = ty - bee.y, dz = tz - bee.z, d = Math.hypot(dx, dy, dz) || 1;
    const speed = Math.min(d / dt, bee.mode === 'mill' ? 4 : 3.2);
    bee.x += (dx / d) * speed * dt + Math.sin(this.time * 17 + bee.a) * 0.01;
    bee.y += (dy / d) * speed * dt + Math.sin(this.time * 23 + bee.a) * 0.01;
    bee.z += (dz / d) * speed * dt;
    if (d > 0.05) bee.heading = Math.atan2(dx, dz);
  }

  // Fresh water, not the sea's, nor a hot spring's, nor frozen.
  #freshWater(x, z, ctx) {
    const w = ctx.waterAt(x, z);
    if (!w || w.frozen || w.hot) return null;
    if (w.lake && ctx.generator.getOceanness(x, z) > 0.5) return null;
    return w;
  }

  #dragonflies(dt, ctx) {
    const cam = ctx.camera.position;
    const warm = (ctx.summer + 0.4 * ctx.spring) * (1 - ctx.winter);
    const want = Math.round(14 * ctx.day * warm * (1 - ctx.rain) * (1 - 0.7 * Math.max(0, ctx.wind - 0.4)));
    this.dragons = this.dragons.filter((d) => Math.hypot(d.x - cam.x, d.z - cam.z) < 70);
    // (Looked for a few at a time, over the shallows round about you.)
    for (let k = 0; this.dragons.length < want && k < 3; k++) {
      const a = rnd(0, TAU), d = rnd(6, 45);
      const x = cam.x + Math.sin(a) * d, z = cam.z + Math.cos(a) * d;
      const w = this.#freshWater(x, z, ctx), g = ctx.ground(x, z);
      if (!w || !(w.level - g > 0.05 && w.level - g < 2.5)) continue;
      const y = w.level + rnd(0.5, 1.3);
      this.dragons.push({ x, y, z, hx: x, hz: z, level: w.level, tx: x, ty: y, tz: z, heading: rnd(0, TAU), wait: rnd(0.3, 2), kind: Math.floor(Math.random() * 3) });
    }
    if (this.dragons.length > want) this.dragons.length = Math.max(want, this.dragons.length - 1);
    const counts = [0, 0, 0];
    for (const d of this.dragons) {
      d.wait -= dt;
      if (d.wait <= 0) {
        // A dart to somewhere else over its stretch of water.
        d.wait = rnd(0.6, 2.8);
        const a = rnd(0, TAU), r = rnd(1, 5);
        d.tx = d.hx + Math.cos(a) * r;
        d.tz = d.hz + Math.sin(a) * r;
        d.ty = d.level + rnd(0.35, 1.5);
      }
      const dx = d.tx - d.x, dy = d.ty - d.y, dz = d.tz - d.z, dist = Math.hypot(dx, dy, dz);
      if (dist > 0.02) {
        const step = Math.min(dist, 7 * dt);
        d.x += (dx / dist) * step;
        d.y += (dy / dist) * step;
        d.z += (dz / dist) * step;
        if (Math.hypot(dx, dz) > 0.05) d.heading += (((Math.atan2(dx, dz) - d.heading + Math.PI * 3) % TAU) - Math.PI) * Math.min(1, dt * 12);
      }
      const mesh = this.dragonMeshes[d.kind];
      if (counts[d.kind] >= mesh.instanceMatrix.count) continue;
      // (A hover's little bob, and the wings' shimmer.)
      e.set(0, d.heading, Math.sin(this.time * 40 + d.hx) * 0.08);
      m4.compose(p.set(d.x, d.y + Math.sin(this.time * 6 + d.hz) * 0.03, d.z), q.setFromEuler(e), s.setScalar(1.2));
      mesh.setMatrixAt(counts[d.kind]++, m4);
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
    const want = Math.round(10 * B * (0.6 + 0.8 * dusk));
    this.swarms = this.swarms.filter((w) => Math.hypot(w.x - cam.x, w.z - cam.z) < 40 && !(w.fade < 0));
    if (this.swarms.length > want) this.swarms[0].fade = Math.min(this.swarms[0].fade ?? 1, 1);
    for (let k = 0; this.swarms.length < want && k < 3; k++) {
      const a = rnd(0, TAU), d = rnd(5, 28), x = cam.x + Math.sin(a) * d, z = cam.z + Math.cos(a) * d;
      const gr = ctx.ground(x, z);
      if (!Number.isFinite(gr)) continue;
      const wat = ctx.waterAt?.(x, z);
      const base = wat ? Math.max(gr, wat.level) : gr;
      this.swarms.push({ x, z, y: base + rnd(0.6, 2.2), n: Math.round(rnd(18, 45)), r: rnd(0.3, 0.8), seed: rnd(0, 100), fade: 1, age: 0 });
    }
    const wind = windDirection.value, ws = windStrength.value;
    let n = 0;
    const cap = this.gnatMesh.instanceMatrix.count;
    for (const w of this.swarms) {
      w.age += dt;
      if (this.swarms.length > want) w.fade -= dt * 0.3;
      // (The cloud drifts a little with the air, and bobs.)
      w.x += wind.x * ws * 0.15 * dt;
      w.z += wind.y * ws * 0.15 * dt;
      const shown = Math.min(1, w.age / 2) * Math.max(0, Math.min(1, w.fade));
      const count = Math.round(w.n * shown);
      for (let i = 0; i < count && n < cap; i++) {
        const h = w.seed + i * 7.31, t = this.time;
        const r = w.r * (0.4 + 0.6 * ((i * 0.618) % 1));
        p.set(
          w.x + Math.sin(t * (3 + (i % 5)) + h) * r + Math.sin(t * 0.7 + h * 2) * r * 0.5,
          w.y + Math.sin(t * (4 + (i % 3)) + h * 1.7) * r * 0.6 + Math.sin(t * 0.5 + w.seed) * 0.15,
          w.z + Math.cos(t * (3.5 + (i % 4)) + h * 1.3) * r + Math.cos(t * 0.6 + h) * r * 0.5,
        );
        m4.makeTranslation(p.x, p.y, p.z);
        this.gnatMesh.setMatrixAt(n++, m4);
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
      if (d < 0.8 && f.heard <= 0) {
        f.heard = rnd(4, 12);
        ctx.sound?.call(night ? 'whine' : 'flybuzz', ctx.pan(f.x, f.z), 0.35);
      }
      if (night || m >= this.fly2Mesh.instanceMatrix.count) continue; // (a mosquito: too small to see)
      e.set(0, Math.atan2(f.vx, f.vz), 0);
      m4.compose(p.set(f.x, f.y, f.z), q.setFromEuler(e), s.set(1, 1, 1));
      this.fly2Mesh.setMatrixAt(m++, m4);
    }
    this.fly2Mesh.count = m;
    this.fly2Mesh.instanceMatrix.needsUpdate = true;
  }

  #frogs(dt, ctx) {
    const cam = ctx.camera.position;
    const season = (ctx.summer + ctx.spring) * (1 - ctx.winter);
    const want = Math.round(18 * season * (1 - 0.5 * ctx.day));
    this.frogs = this.frogs.filter((f) => !f.gone && Math.hypot(f.x - cam.x, f.z - cam.z) < 45);
    // Somewhere on the bank, right at the water's edge, facing the water
    // (or, now and then, already out in the shallows, floating).
    for (let k = 0; this.frogs.length < want && k < 4; k++) {
      const a = rnd(0, TAU), d = rnd(7, 32);
      const x = cam.x + Math.sin(a) * d, z = cam.z + Math.cos(a) * d, g = ctx.ground(x, z);
      if (!Number.isFinite(g)) continue;
      for (let t = 0; t < 4; t++) {
        const b = (t / 4) * TAU + a, nx = x + Math.sin(b) * 1.2, nz = z + Math.cos(b) * 1.2;
        const w = this.#freshWater(nx, nz, ctx);
        if (!w || !(w.level - ctx.ground(nx, nz) > 0.08) || g < w.level - 0.02 || g > w.level + 0.45) continue;
        if (Math.random() < 0.25) this.frogs.push({ x: nx, y: w.level, z: nz, heading: rnd(0, TAU), level: w.level, state: 'swim', swim: 0, wait: rnd(3, 10) });
        else this.frogs.push({ x, y: g, z, heading: b, level: w.level, state: 'sit', wait: rnd(2, 12) });
        break;
      }
    }
    // Croaking: at dusk and through the night, now one, now another.
    const chorus = Math.max(ctx.dusk, ctx.night) * season * (1 - 0.6 * ctx.rain);
    this.croakWait -= dt;
    if (this.croakWait <= 0 && this.frogs.length) {
      this.croakWait = rnd(0.4, 2.5) / Math.max(0.2, chorus);
      if (chorus > 0.1) {
        const f = this.frogs[Math.floor(Math.random() * this.frogs.length)];
        const d = Math.hypot(f.x - cam.x, f.z - cam.z);
        const spring = ctx.spring > 0.5 && Math.random() < 0.5;
        ctx.sound?.call(spring ? 'peep' : 'croak', ctx.pan(f.x, f.z), Math.min(0.6, 5 / (d + 4)) * chorus);
        f.puff = 0.6;
      }
    }
    // A hop from where it is to (tx, tz), landing at height ty.
    const hop = (f, tx, tz, ty, len, then) => Object.assign(f, { state: 'hop', t: 0, len, from: { x: f.x, z: f.z, y: f.y }, to: { x: tx, z: tz, y: ty }, then });
    let n = 0;
    for (const f of this.frogs) {
      const near = Math.hypot(f.x - cam.x, f.z - cam.z);
      let y = f.y, pitch = 0;
      f.wait -= dt;
      if (f.state === 'sit') {
        if (near < 5) {
          // You come near: a leap, and in (with a plop).
          hop(f, f.x + Math.sin(f.heading) * 1.3, f.z + Math.cos(f.heading) * 1.3, f.level, 0.45, 'dive');
        } else if (f.wait <= 0) {
          // Now and then a hop or two along the bank (catching a fly), or a turn.
          f.wait = rnd(3, 12);
          const h = f.heading + rnd(-1.4, 1.4), d = rnd(0.35, 0.8);
          const tx = f.x + Math.sin(h) * d, tz = f.z + Math.cos(h) * d, g = ctx.ground(tx, tz);
          if (Number.isFinite(g) && g > f.level - 0.02 && g < f.level + 0.45) hop(f, tx, tz, g, 0.3, 'sit');
          f.heading = h;
        }
      } else if (f.state === 'swim') {
        // In the water: floating, just its eyes and back up; swimming off
        // with slow kicks, away from you; too close, and it's under.
        if (near < 2.5) f.state = 'sink';
        else {
          const away = near < 9 ? Math.atan2(f.x - cam.x, f.z - cam.z) : f.heading;
          f.heading += Math.atan2(Math.sin(away - f.heading), Math.cos(away - f.heading)) * Math.min(1, dt * 2);
          f.swim = Math.max(0, (f.swim ?? 0) - dt);
          if (f.wait <= 0) (f.wait = rnd(2, 7)), (f.swim = near < 9 ? 3 : rnd(0, 1) < 0.5 ? rnd(0.8, 2) : 0);
          const kick = f.swim > 0 ? 0.35 * (0.5 + 0.5 * Math.sin(this.time * 9)) : 0;
          const nx = f.x + Math.sin(f.heading) * kick * dt, nz = f.z + Math.cos(f.heading) * kick * dt;
          if (this.#freshWater(nx, nz, ctx)) (f.x = nx), (f.z = nz);
          else f.heading += Math.PI * 0.7;
        }
        y = f.level - 0.04;
      } else if (f.state === 'sink') {
        f.y = (f.y ?? f.level) - dt * 0.4;
        y = f.y;
        if (f.y < f.level - 0.5) f.gone = true;
      }
      if (f.state === 'hop') {
        f.t += dt / f.len;
        const u = Math.min(1, f.t);
        f.x = f.from.x + (f.to.x - f.from.x) * u;
        f.z = f.from.z + (f.to.z - f.from.z) * u;
        y = f.from.y + (f.to.y - f.from.y) * u + Math.sin(u * Math.PI) * (f.then === 'dive' ? 0.35 : 0.18);
        pitch = -0.5 + u;
        if (u >= 1) {
          f.y = f.to.y;
          if (f.then === 'dive') {
            ctx.splash?.(f.x, f.level, f.z);
            if (near < 20) ctx.sound?.call('splash', ctx.pan(f.x, f.z), 0.12);
            Object.assign(f, { state: 'swim', swim: 3, wait: rnd(2, 5), y: f.level });
          } else f.state = 'sit';
        }
      }
      f.puff = Math.max(0, (f.puff ?? 0) - dt);
      if (f.gone || n >= this.frogMesh.instanceMatrix.count) continue;
      e.set(pitch, f.heading, 0);
      const swell = 1 + 0.15 * Math.sin(Math.min(1, f.puff / 0.6) * Math.PI); // (puffing up to croak)
      m4.compose(p.set(f.x, y, f.z), q.setFromEuler(e), s.set(1.3, 1.3 * swell, 1.3));
      this.frogMesh.setMatrixAt(n++, m4);
    }
    this.frogs = this.frogs.filter((f) => !f.gone);
    this.frogMesh.count = n;
    this.frogMesh.instanceMatrix.needsUpdate = true;
  }
}
