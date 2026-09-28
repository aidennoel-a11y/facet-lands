import { BufferAttribute, BufferGeometry, Color, DoubleSide, DynamicDrawUsage, Euler, InstancedMesh, Matrix4, MeshLambertMaterial, Quaternion, Vector3 } from 'three';

const MAX = 70;
const TAU = Math.PI * 2;
const rnd = (a, b) => a + Math.random() * (b - a);
const angleTo = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

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
    this.fish = [];
    this.shoals = [];
    this.falls = [];
    this.wait = 0;
    this.leapWait = 5;
    this.time = 0;
  }

  clear() {
    this.fish = [];
    this.shoals = [];
  }

  /**
   * @param ctx  { camera, generator, ground(x, z), waterAt(x, z), traces, sound, pan(x, z),
   *              day, winter, autumn, summer, sheltered }
   */
  update(dt, ctx) {
    this.time += dt;
    const cam = ctx.camera.position;
    this.mesh.visible = !ctx.sheltered;
    this.wait -= dt;
    if (this.wait <= 0) {
      this.wait = 1;
      this.#populate(ctx);
    }
    // Leaps: now and then one clears the water (more at dawn and dusk).
    this.leapWait -= dt * (1 + 1.5 * ((ctx.dawn ?? 0) + (ctx.dusk ?? 0)));
    if (this.leapWait <= 0) {
      this.leapWait = rnd(5, 14);
      const f = this.fish.filter((f) => !f.leap && Math.hypot(f.x - cam.x, f.z - cam.z) < 45);
      if (f.length) this.#leap(f[Math.floor(Math.random() * f.length)], 0.8 + Math.random() * 0.8, ctx);
    }
    // Salmon at the falls, in summer and autumn.
    const run = Math.max(ctx.summer ?? 0, ctx.autumn ?? 0);
    for (const fall of this.falls) {
      fall.wait -= dt;
      if (fall.wait > 0 || run < 0.3 || Math.hypot(fall.x - cam.x, fall.z - cam.z) > 90) continue;
      fall.wait = rnd(2, 5) / run;
      const a = { x: fall.x + rnd(-1, 1) * fall.w, y: fall.low - 0.3, z: fall.z + rnd(-1, 1) * fall.w, heading: fall.up, size: rnd(0.55, 0.8), tint: SALMON, kind: 'salmon', level: fall.low, gone: false };
      this.fish.push(a);
      // Up the fall (most don't make it: they drop back).
      const made = Math.random() < 0.35;
      this.#leap(a, Math.min(4, fall.drop + (made ? 0.6 : -0.3)), ctx, made ? { x: a.x + Math.sin(fall.up) * 2.5, z: a.z + Math.cos(fall.up) * 2.5, level: fall.high } : null);
      a.oneLeap = true;
    }

    for (const f of this.fish) {
      if (f.leap) {
        const L = f.leap;
        L.t += dt / L.dur;
        const k = Math.min(1, L.t);
        f.x = L.x0 + (L.x1 - L.x0) * k;
        f.z = L.z0 + (L.z1 - L.z0) * k;
        f.y = L.y0 + (L.y1 - L.y0) * k + Math.sin(Math.PI * k) * L.h;
        f.pitch = -Math.cos(Math.PI * k) * 0.9;
        if (k >= 1) {
          ctx.traces?.splash(f.x, L.y1 + 0.3, f.z, 10, 2, 1.1);
          if (Math.hypot(f.x - cam.x, f.z - cam.z) < 40) ctx.sound?.call('splash', ctx.pan(f.x, f.z), 0.35);
          f.leap = null;
          f.pitch = 0;
          f.y = L.y1;
          f.level = L.y1 + 0.3;
          if (f.oneLeap) f.gone = true;
        }
        continue;
      }
      if (f.shoal) {
        // Keeping with the shoal, turning with it.
        const sh = f.shoal;
        const tx = sh.x + Math.sin(sh.heading + f.slot * 2.4) * f.off, tz = sh.z + Math.cos(sh.heading + f.slot * 2.4) * f.off;
        const want = Math.atan2(tx - f.x, tz - f.z);
        f.heading += angleTo(f.heading, Math.hypot(tx - f.x, tz - f.z) > 0.4 ? want : sh.heading) * Math.min(1, dt * 3);
        const v = sh.speed * (0.8 + 0.4 * Math.min(1, Math.hypot(tx - f.x, tz - f.z)));
        f.x += Math.sin(f.heading) * v * dt;
        f.z += Math.cos(f.heading) * v * dt;
      } else {
        // Holding in the current, facing upstream; darting on a little now and then.
        f.dart = (f.dart ?? rnd(3, 10)) - dt;
        if (f.dart < 0) {
          const v = 2.5;
          const nx = f.x + Math.sin(f.heading) * v * dt, nz = f.z + Math.cos(f.heading) * v * dt;
          if (ctx.waterAt(nx, nz)) (f.x = nx), (f.z = nz);
          if (f.dart < -0.5) f.dart = rnd(3, 10);
        }
      }
      f.wiggle = (f.wiggle ?? Math.random() * 6) + dt * (f.shoal ? 7 : 4);
    }
    for (const sh of this.shoals) {
      // The shoal wanders, turning back from the shallows.
      sh.turn = (sh.turn ?? 0) + (Math.random() - 0.5) * dt * 0.8;
      sh.turn *= 1 - dt * 0.3;
      sh.heading += sh.turn * dt;
      const nx = sh.x + Math.sin(sh.heading) * sh.speed * dt, nz = sh.z + Math.cos(sh.heading) * sh.speed * dt;
      const w = ctx.waterAt(nx + Math.sin(sh.heading) * 3, nz + Math.cos(sh.heading) * 3);
      const deep = w ? w.level - ctx.ground(nx, nz) : 0;
      if (!w || deep < 1.2) sh.heading += Math.PI * dt * 1.5;
      else (sh.x = nx), (sh.z = nz);
    }
    this.fish = this.fish.filter((f) => !f.gone);

    // Into the instanced mesh.
    let n = 0;
    for (const f of this.fish) {
      if (n >= MAX) break;
      const wig = f.leap ? Math.sin(this.time * 18) * 0.25 : Math.sin(f.wiggle ?? 0) * (f.shoal ? 0.18 : 0.1);
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

  // A leap out of the water, `h` metres high, landing where `to` says (or back where it was).
  #leap(f, h, ctx, to = null) {
    const d = to ? 0 : rnd(0.8, 1.8);
    const y0 = f.level ?? f.y;
    f.leap = {
      t: 0, dur: 0.45 + Math.sqrt(Math.max(0.2, h)) * 0.35, h,
      x0: f.x, z0: f.z, y0: f.y,
      x1: to ? to.x : f.x + Math.sin(f.heading) * d, z1: to ? to.z : f.z + Math.cos(f.heading) * d,
      y1: to ? to.level - 0.3 : y0 - 0.3,
    };
    ctx.traces?.splash(f.x, y0, f.z, 6, 1.6, 0.8);
  }

  #populate(ctx) {
    const cam = ctx.camera.position;
    // (Only near you, and not from high up.)
    this.fish = this.fish.filter((f) => f.leap || Math.hypot(f.x - cam.x, f.z - cam.z) < 90);
    this.shoals = this.shoals.filter((sh) => Math.hypot(sh.x - cam.x, sh.z - cam.z) < 110);
    for (const sh of this.shoals) sh.fish = sh.fish.filter((f) => this.fish.includes(f));
    if (cam.y - ctx.ground(cam.x, cam.z) > 120) return;
    // River fish, holding in the stream.
    const riverFish = this.fish.filter((f) => f.kind === 'river').length;
    for (let tries = 0; tries < 6 && riverFish + tries < 10; tries++) {
      const a = Math.random() * TAU, r = rnd(10, 60);
      const x = cam.x + Math.sin(a) * r, z = cam.z + Math.cos(a) * r;
      const w = ctx.waterAt(x, z);
      if (!w || !(w.speed > 0)) continue;
      const bed = ctx.ground(x, z);
      if (!(w.level - bed > 0.45)) continue;
      const up = Math.atan2(-(w.fx ?? 0), -(w.fz ?? 0));
      this.fish.push({ kind: 'river', x, z, y: Math.max(bed + 0.15, w.level - 0.35), level: w.level, heading: up, size: rnd(0.3, 0.5), tint: RIVER_TINTS[Math.floor(Math.random() * RIVER_TINTS.length)] });
    }
    // A shoal or two in the lakes and the shallow sea.
    if (this.shoals.length < 2 && !(ctx.winter > 0.6)) {
      for (let tries = 0; tries < 6; tries++) {
        const a = Math.random() * TAU, r = rnd(20, 70);
        const x = cam.x + Math.sin(a) * r, z = cam.z + Math.cos(a) * r;
        const w = ctx.waterAt(x, z);
        if (!w || w.speed > 0) continue;
        const depth = w.level - ctx.ground(x, z);
        if (depth < 1.5 || depth > 12) continue;
        const sea = !!w.lake;
        const sh = { x, z, heading: Math.random() * TAU, speed: rnd(0.6, 1.2), fish: [] };
        const n = Math.round(rnd(8, 15)), t = (sea ? SEA_TINTS : RIVER_TINTS)[Math.floor(Math.random() * 3)];
        const y = w.level - Math.min(depth * 0.4, 1.4) - 0.3;
        for (let k = 0; k < n; k++) {
          const f = { kind: 'shoal', shoal: sh, slot: k, off: rnd(0.4, 2.2), x: x + rnd(-2, 2), z: z + rnd(-2, 2), y: y + rnd(-0.3, 0.3), level: w.level, heading: sh.heading, size: rnd(0.22, 0.34), tint: t };
          sh.fish.push(f);
          this.fish.push(f);
        }
        this.shoals.push(sh);
        break;
      }
    }
    // The falls near you, for the salmon.
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
        const key = `${a.x},${a.z}`;
        const fall = this.fallsSeen?.get(key) ?? { key, x: b.x + ((b.x - a.x) / run) * 1.5, z: b.z + ((b.z - a.z) / run) * 1.5, low: b.level, high: a.level, drop, up: Math.atan2(a.x - b.x, a.z - b.z), w: Math.max(0.5, b.width * 0.3), wait: rnd(1, 4) };
        this.falls.push(fall);
      }
    }
    this.fallsSeen = new Map(this.falls.map((f) => [f.key, f]));
  }
}
