import { Color, IcosahedronGeometry, DodecahedronGeometry, InstancedMesh, Matrix4, MeshLambertMaterial, Quaternion, Vector3, Euler } from 'three';

const CHUNKS = 220; // (blocks and slabs of snow broken off and tumbling down)
const POWDER = 70; // (the cloud of powder snow boiling up off the front of it)
const m4 = new Matrix4(), q = new Quaternion(), e = new Euler(), p = new Vector3(), s = new Vector3();
const rnd = (a, b) => a + Math.random() * (b - a);

/**
 * Avalanches: after heavy snow on the steep high slopes, now and then a
 * slab of it breaks away and comes down: blocks and slabs of snow (faceted,
 * like everything else) sliding and tumbling down the fall line, gathering
 * speed on the steep and spreading, slowing and piling up where the slope
 * eases; a cloud of powder boiling up off its front; a deep rumble. What it
 * catches it buries (see main: you, hurt and slowed). The debris lies a
 * while, then settles away.
 */
export class Avalanches {
  // (`rock`: a rockfall instead, shaken loose by an earthquake: broken rock tumbling down, a cloud of dust off it.)
  constructor(scene, rock = false) {
    this.rock = rock;
    this.material = new MeshLambertMaterial({ flatShading: true });
    this.chunks = new InstancedMesh(new DodecahedronGeometry(1, 0), this.material, CHUNKS);
    this.chunks.frustumCulled = false;
    this.chunks.count = 0;
    this.chunks.castShadow = true;
    this.powderMaterial = new MeshLambertMaterial({ flatShading: true, transparent: true, opacity: 0.55, depthWrite: false });
    this.powder = new InstancedMesh(new IcosahedronGeometry(1, 0), this.powderMaterial, POWDER);
    this.powder.frustumCulled = false;
    this.powder.count = 0;
    const c = new Color();
    for (let k = 0; k < CHUNKS; k++) {
      if (rock) {
        const v = 0.36 + Math.random() * 0.2;
        this.chunks.setColorAt(k, c.setRGB(v * 1.05, v, v * 0.92));
      } else this.chunks.setColorAt(k, c.setRGB(0.9 + Math.random() * 0.08, 0.92 + Math.random() * 0.06, 0.96 + Math.random() * 0.04));
    }
    for (let k = 0; k < POWDER; k++) this.powder.setColorAt(k, rock ? c.setRGB(0.62, 0.56, 0.48) : c.setRGB(0.95, 0.96, 0.99));
    scene.add(this.chunks, this.powder);
    this.active = null;
  }

  /**
   * One breaking away at (x, z) (high on a steep snowy slope), `width`
   * metres across. ground(x, z) is the land's height.
   */
  start(x, z, ground, width = 50) {
    // (Across the slope: square to the fall line there.)
    const fall = this.#downhill(x, z, ground), ax = -fall.z, az = fall.x;
    const bits = [];
    for (let k = 0; k < CHUNKS; k++) {
      const u = (Math.random() - 0.5) * width, back = Math.random() * 14;
      const bx = x + ax * u - fall.x * back, bz = z + az * u - fall.z * back;
      const size = this.rock ? 0.25 + Math.pow(Math.random(), 2.6) * 1.6 : 0.4 + Math.pow(Math.random(), 2.2) * 2.2;
      bits.push({ x: bx, z: bz, y: ground(bx, bz) + size * 0.5, vx: 0, vz: 0, vy: 0, size, delay: back * 0.09 + Math.random() * 0.6, spin: new Vector3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)), turn: Math.random() * 6, rest: 0, sy: 0.5 + Math.random() * 0.4 });
    }
    this.active = { bits, puffs: [], time: 0, x, z, speed: 0, settled: 0 };
    this.chunks.count = CHUNKS;
    return this.active;
  }

  // Which way is down from (x, z), and how steep: { x, z (unit), slope }.
  #downhill(x, z, ground) {
    const h = 1.5, gx = (ground(x + h, z) - ground(x - h, z)) / (2 * h), gz = (ground(x, z + h) - ground(x, z - h)) / (2 * h);
    const l = Math.hypot(gx, gz) || 1e-6;
    return { x: -gx / l, z: -gz / l, slope: l };
  }

  /** Where it is and how fast it's coming: { x, z, speed, bits } (for what it catches), or null. */
  get now() {
    return this.active;
  }

  update(dt, ground) {
    const a = this.active;
    if (!a) return;
    a.time += dt;
    let moving = 0, fx = 0, fz = 0, top = 0;
    for (const b of a.bits) {
      if (a.time < b.delay) continue;
      if (b.rest > 0.6) continue;
      const d = this.#downhill(b.x, b.z, ground), sin = d.slope / Math.hypot(1, d.slope);
      // Down the fall line: gravity along the slope against the snow's
      // friction (it only goes where it's steep enough), a little spreading.
      const acc = 9.8 * Math.max(-0.4, sin - 0.32);
      b.vx += (d.x * acc + rnd(-0.6, 0.6)) * dt;
      b.vz += (d.z * acc + rnd(-0.6, 0.6)) * dt;
      // (Turned to follow the slope: its speed kept, its way bent downhill.)
      const sp = Math.hypot(b.vx, b.vz);
      if (sp > 0.01) {
        const bend = Math.min(1, dt * 2.5);
        b.vx += (d.x * sp - b.vx) * bend * 0.5;
        b.vz += (d.z * sp - b.vz) * bend * 0.5;
      }
      const drag = 1 - Math.min(0.5, dt * (0.08 + 0.002 * sp * sp / b.size));
      b.vx *= drag;
      b.vz *= drag;
      b.x += b.vx * dt;
      b.z += b.vz * dt;
      const g = ground(b.x, b.z), speed = Math.hypot(b.vx, b.vz);
      // (Bounding over the bumps, the big ones tumbling.)
      b.vy -= 9.8 * dt;
      b.y += b.vy * dt;
      if (b.y < g + b.size * 0.45) {
        b.y = g + b.size * 0.45;
        b.vy = speed > 6 && Math.random() < dt * 3 ? rnd(1, 3) : 0;
      }
      b.turn += dt * speed / (b.size * 1.5);
      if (speed < 0.4 && d.slope < 0.55) b.rest += dt;
      else (b.rest = 0), moving++;
      fx += b.x * speed;
      fz += b.z * speed;
      top = Math.max(top, speed);
    }
    const sum = a.bits.reduce((t, b) => t + Math.hypot(b.vx, b.vz), 0) || 1;
    a.front = { x: fx / sum, z: fz / sum };
    a.speed = top;
    // The powder cloud: billowing up off the fastest of it, drifting, swelling, thinning.
    if (top > 5 && a.puffs.length < POWDER && Math.random() < dt * 25) {
      const b = a.bits[Math.floor(Math.random() * a.bits.length)];
      if (Math.hypot(b.vx, b.vz) > 4) a.puffs.push({ x: b.x, y: b.y, z: b.z, vx: b.vx * 0.6, vz: b.vz * 0.6, vy: rnd(2, 5), age: 0, life: rnd(4, 8), size: rnd(2, 4) });
    }
    for (const f of a.puffs) {
      f.age += dt;
      f.x += f.vx * dt;
      f.z += f.vz * dt;
      f.y += f.vy * dt;
      f.vx *= 1 - dt * 0.6;
      f.vz *= 1 - dt * 0.6;
      f.vy *= 1 - dt * 0.4;
    }
    a.puffs = a.puffs.filter((f) => f.age < f.life);
    // Drawn: the blocks, then (when all's still, after a while) sinking away.
    if (moving === 0 && a.time > 3) a.settled += dt;
    const sink = Math.max(0, (a.settled - 40) / 20);
    let n = 0;
    for (const b of a.bits) {
      if (a.time < b.delay) {
        this.chunks.setMatrixAt(n++, m4.makeScale(0, 0, 0));
        continue;
      }
      q.setFromAxisAngle(p.copy(b.spin).normalize(), b.turn);
      this.chunks.setMatrixAt(n++, m4.compose(p.set(b.x, b.y - sink * b.size, b.z), q, s.set(b.size, b.size * b.sy, b.size)));
    }
    this.chunks.count = n;
    this.chunks.instanceMatrix.needsUpdate = true;
    let k = 0;
    for (const f of a.puffs) {
      const g = f.age / f.life, size = f.size * (1 + 2.5 * g) * (1 - g * g);
      e.set(f.age * 0.3, f.age * 0.2, 0);
      this.powder.setMatrixAt(k++, m4.compose(p.set(f.x, f.y, f.z), q.setFromEuler(e), s.set(size, size * 0.8, size)));
    }
    this.powder.count = k;
    this.powder.instanceMatrix.needsUpdate = true;
    if (sink >= 1) {
      this.active = null;
      this.chunks.count = 0;
      this.powder.count = 0;
    }
  }
}

const SLAB_SITES = 18, PER_SITE = 12;
/**
 * The snow building up where an avalanche may come down: on the steep snowy
 * slopes round you, after heavy snow, fat pillows of wind-packed snow lying
 * across the slope, and along the crest above each an overhanging cornice,
 * growing the longer it snows (and shrinking away in a thaw). The worst
 * loaded are where the avalanches break away (see ripest): and for a few
 * seconds first a dark crack opens across the top of the slab.
 */
export class SnowLoad {
  constructor(scene) {
    const g = new IcosahedronGeometry(1, 1);
    this.mesh = new InstancedMesh(g, new MeshLambertMaterial({ flatShading: true, color: 0xf4f7fb }), SLAB_SITES * PER_SITE);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.crack = new InstancedMesh(new IcosahedronGeometry(1, 0), new MeshLambertMaterial({ color: 0x4a5866 }), SLAB_SITES);
    this.crack.frustumCulled = false;
    this.crack.count = 0;
    scene.add(this.mesh, this.crack);
    this.sites = [];
    this.wait = 0;
  }

  /**
   * @param ctx { eye, load (0..1: deep fresh snow), forward (yaw), slopeAt(x, z) -> { g, slope, snow, down }, mountains(x, z) }
   */
  update(dt, ctx) {
    const e = ctx.eye;
    this.wait -= dt;
    if (this.wait <= 0) {
      this.wait = 3;
      this.sites = this.sites.filter((s) => Math.hypot(s.x - e.x, s.z - e.z) < 650 && (s.build > 0.02 || ctx.load > 0.1));
      // (New ones found, on the steep snowy slopes in view: only once snow's been falling.)
      if (ctx.load > 0.1 && ctx.mountains(e.x, e.z) > 0.3) {
        for (let k = 0; k < 24 && this.sites.length < SLAB_SITES; k++) {
          const a = ctx.forward + (Math.random() - 0.5) * 2.6, d = 80 + Math.random() * 380, x = e.x + Math.sin(a) * d, z = e.z + Math.cos(a) * d;
          if (this.sites.some((s) => Math.hypot(s.x - x, s.z - z) < 45)) continue;
          const s = ctx.slopeAt(x, z);
          if (!s.snow || s.slope < 0.65 || s.slope > 1.7 || !Number.isFinite(s.g)) continue;
          this.sites.push({ x, z, down: s.down, slope: s.slope, build: 0.05, width: 18 + Math.random() * 22, seed: Math.random() * 100, crack: 0 });
        }
      }
    }
    // Building up as it snows, settling and melting away when it doesn't.
    for (const s of this.sites) {
      s.build = Math.max(0, Math.min(1, s.build + (ctx.load > 0.1 ? dt * 0.004 * (0.4 + ctx.load) : -dt * 0.0015)));
      if (s.crack > 0) s.crack += dt;
    }
    this.#draw(ctx);
  }

  /** The most heavily loaded slab in reach of (x, z), high above it (for an avalanche to break away from), or null. */
  ripest(x, z, y) {
    let best = null;
    for (const s of this.sites) {
      if (s.build < 0.35 || s.crack > 0 || Math.hypot(s.x - x, s.z - z) > 450 || (s.g ?? 0) < y + 20) continue;
      if (!best || s.build > best.build) best = s;
    }
    return best;
  }

  /** It's going: a crack opening across its top for a few seconds, then `then()` (the avalanche breaking away). */
  release(s, then) {
    s.crack = 0.001;
    s.then = then;
  }

  #draw(ctx) {
    const mesh = this.mesh;
    let n = 0, c = 0;
    for (const s of this.sites) {
      if (s.crack > 4) {
        // (It's gone: down the mountain.)
        s.then?.(s);
        s.then = null;
        s.gone = true;
        continue;
      }
      if (s.build < 0.03) continue;
      const fx = Math.sin(s.down), fz = Math.cos(s.down), ax = -fz, az = fx;
      s.g = ctx.slopeAt(s.x, s.z).g;
      const tilt = Math.atan(s.slope);
      for (let k = 0; k < PER_SITE && n < mesh.instanceMatrix.count; k++) {
        const cornice = k >= PER_SITE - 4;
        const u = cornice ? ((k - (PER_SITE - 4)) / 3 - 0.5) * s.width : ((k % 8) / 7 - 0.5) * s.width * 0.9;
        const back = cornice ? -14 - s.width * 0.1 : ((Math.sin(s.seed + k * 1.7) + 1) * 0.5) * 8 - 4;
        const x = s.x + ax * u - fx * back, z = s.z + az * u - fz * back, g = ctx.slopeAt(x, z).g;
        if (!Number.isFinite(g)) continue;
        const B = s.build, w = (cornice ? s.width / 3.2 : s.width / 6) * (0.8 + 0.3 * Math.sin(s.seed + k));
        const thick = cornice ? 0.5 + 1.6 * B : 0.25 + 1.3 * B;
        p.set(x + (cornice ? fx * 1.2 * B : 0), g + thick * 0.35, z + (cornice ? fz * 1.2 * B : 0));
        e.set(cornice ? -0.25 : tilt * 0.9, s.down, 0, 'YXZ');
        q.setFromEuler(e);
        s3.set(w, thick, cornice ? 2 + 2.5 * B : w * 0.8);
        mesh.setMatrixAt(n++, m4.compose(p, q, s3));
      }
      // The crack: a dark line opening across the slab's top.
      if (s.crack > 0 && c < this.crack.instanceMatrix.count) {
        const g = ctx.slopeAt(s.x - fx * 5, s.z - fz * 5).g;
        p.set(s.x - fx * 5, g + 0.4 + 1.1 * s.build, s.z - fz * 5);
        e.set(tilt * 0.9, s.down, 0, 'YXZ');
        q.setFromEuler(e);
        s3.set(s.width * 0.5 * Math.min(1, s.crack / 1.5), 0.12, 0.25 + 0.3 * Math.min(1, s.crack / 3));
        this.crack.setMatrixAt(c++, m4.compose(p, q, s3));
      }
    }
    this.sites = this.sites.filter((s) => !s.gone);
    mesh.count = n;
    this.crack.count = c;
    mesh.instanceMatrix.needsUpdate = true;
    this.crack.instanceMatrix.needsUpdate = true;
  }
}
const s3 = new Vector3();
