import { AdditiveBlending, Color, DynamicDrawUsage, Euler, InstancedMesh, Matrix4, MeshBasicMaterial, MeshLambertMaterial, Quaternion, Vector3 } from 'three';
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
 *  - fireflies over the grass and the wetlands on warm summer nights,
 *    drifting low and blinking yellow-green.
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
   *             meadow (0..1: grass and wetland round you), sheltered, pan(x, z) }
   */
  update(dt, ctx) {
    this.time += dt;
    const hidden = ctx.sheltered;
    for (const m of [this.hiveMesh, this.beeMesh, this.flyMesh, this.haloMesh]) m.visible = !hidden;
    if (hidden) return;
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
    const warm = Math.max(ctx.summer, ctx.spring * 0.35) * (1 - ctx.winter);
    const want = Math.round(220 * ctx.night * warm * (1 - ctx.rain) * (1 - 0.6 * ctx.wind) * ctx.meadow);
    this.flies = this.flies.filter((f) => Math.hypot(f.x - cam.x, f.z - cam.z) < 110);
    for (let k = 0; this.flies.length < want && k < 8; k++) {
      // (Spread evenly over the ground round you, out to 90 m, none right by you.)
      const a = rnd(0, TAU), d = Math.sqrt(rnd(12 * 12, 90 * 90));
      const x = cam.x + Math.sin(a) * d, z = cam.z + Math.cos(a) * d, g = ctx.ground(x, z);
      if (!(g > ctx.seaLevel - 0.5)) continue;
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
}
