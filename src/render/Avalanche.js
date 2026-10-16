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
  constructor(scene) {
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
    for (let k = 0; k < CHUNKS; k++) this.chunks.setColorAt(k, c.setRGB(0.9 + Math.random() * 0.08, 0.92 + Math.random() * 0.06, 0.96 + Math.random() * 0.04));
    for (let k = 0; k < POWDER; k++) this.powder.setColorAt(k, c.setRGB(0.95, 0.96, 0.99));
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
      const size = 0.4 + Math.pow(Math.random(), 2.2) * 2.2;
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
