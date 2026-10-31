import { BoxGeometry, BufferAttribute, Color, IcosahedronGeometry, InstancedMesh, Matrix4, MeshLambertMaterial, Quaternion, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const TAU = Math.PI * 2;
const MAX = 8; // (spiders about you at once, at most)
// The Broodmother: the great spider of the vast caverns (see #brood).
export const BROOD = { name: 'The Broodmother', size: 3.1, health: 1100, bite: 30 };
const BROOD_TINT = new Color(0.95, 0.55, 0.5), PLAIN = new Color(1, 1, 1), BURNT = new Color(0.25, 0.12, 0.08);
const bX = new Vector3(), bY = new Vector3(), bZ = new Vector3(), basis = new Matrix4(), off = new Vector3();
const LEGS = 8;
const PIVOT = 0.5; // (its middle, up from its feet: what it turns over about, dying)

// One piece of the body, coloured.
function part(geometry, colour, [x, y, z] = [0, 0, 0], [sx, sy, sz] = [1, 1, 1]) {
  const g = (geometry.index ? geometry.toNonIndexed() : geometry).scale(sx, sy, sz).translate(x, y, z);
  g.deleteAttribute('uv');
  const c = new Color(colour), n = g.attributes.position.count, col = new Float32Array(n * 3);
  for (let k = 0; k < n; k += 3) {
    const shade = 0.85 + Math.random() * 0.3;
    for (let v = 0; v < 3; v++) col.set([c.r * shade, c.g * shade, c.b * shade], (k + v) * 3);
  }
  g.setAttribute('color', new BufferAttribute(col, 3));
  return g;
}

// Where it can be hit (its own frame, facing +z, at size 1): x, y, z, radius.
const SHAPE = [
  [0, 0.58, -0.55, 0.52], // (the abdomen)
  [0, 0.5, 0.05, 0.34], // (the thorax)
  [0, 0.48, 0.32, 0.2], // (the head and fangs)
  ...[1, -1].flatMap((side) => [[0.45, 0.22], [0.55, 0.0], [0.55, -0.22], [0.45, -0.42], [0.85, 0.5], [0.95, 0.12], [0.95, -0.3], [0.85, -0.7]].map(([x, z], i) => [side * x, i < 4 ? 0.8 : 0.45, z, i < 4 ? 0.26 : 0.22])), // (the legs: knees, then feet)
];

// The body: a great bristling abdomen behind, the head-and-thorax before it,
// the fangs, and a cluster of eyes catching the light. (Facing +z; its
// middle over the ground at 0.)
function bodyGeometry() {
  const dark = 0x2a221c, brown = 0x4a3a2c, band = 0x7a6248;
  const parts = [
    part(new IcosahedronGeometry(0.42, 1), dark, [0, 0.55, -0.55], [1, 0.82, 1.25]),
    part(new IcosahedronGeometry(0.3, 0), band, [0, 0.72, -0.62], [0.7, 0.4, 1]),
    part(new IcosahedronGeometry(0.28, 1), brown, [0, 0.48, 0.05], [1, 0.62, 1.1]),
    part(new BoxGeometry(0.06, 0.18, 0.06), 0x1a1412, [0.08, 0.36, 0.36]),
    part(new BoxGeometry(0.06, 0.18, 0.06), 0x1a1412, [-0.08, 0.36, 0.36]),
  ];
  for (const [x, y, s] of [[0.06, 0.62, 1], [-0.06, 0.62, 1], [0.12, 0.58, 0.7], [-0.12, 0.58, 0.7], [0.03, 0.66, 0.6], [-0.03, 0.66, 0.6]]) {
    parts.push(part(new IcosahedronGeometry(0.035 * s, 0), 0xc02018, [x, y, 0.3]));
  }
  const g = mergeGeometries(parts);
  g.computeVertexNormals();
  return g;
}

/**
 * Big cave spiders: in the dark of the caves, out of sight round you as you
 * go, a leg-span as wide as your arms. They come skittering over the floor
 * when they're on to you, rear and lunge, bite (some bites poisoned), back
 * off and come again. A light thrust at one makes it shy off a moment.
 * Struck hard enough, or shot, it dies, curled up; it leaves its silk.
 */
export class CaveSpiders {
  constructor(scene) {
    this.scene = scene;
    this.spiders = [];
    const material = new MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: 0x0a0605 });
    this.bodies = new InstancedMesh(bodyGeometry(), material, MAX);
    const leg = new BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    this.legs = new InstancedMesh(leg, new MeshLambertMaterial({ color: 0x2e241c, flatShading: true }), MAX * LEGS * 2);
    for (const m of [this.bodies, this.legs]) {
      m.count = 0;
      m.frustumCulled = false;
      m.name = 'cave spiders';
      scene.add(m);
    }
    this.wait = 3;
    this.onKill = null; // (spider) => it's dead: what it leaves
    this.bodies.setColorAt(0, PLAIN);
    this.legs.setColorAt(0, PLAIN);
  }

  // Where a spider would stand at (x, z), from about height `y`: the cave floor, or null.
  #floor(x, y, z, caves, terrain, drop = 3) {
    const g = caves.groundAt(x, y + 1.5, z, terrain(x, z));
    if (!g.inCave || !Number.isFinite(g.height) || Math.abs(g.height - y) > drop) return null;
    return g.height;
  }

  // How deep into rock a point is (> 0 in the rock, < 0 in the air): the caves and the ground over them.
  #rock(x, y, z, caves) {
    return Math.min(caves.generator.getHeight(x, z) - y, caves.caveDensity(x, y, z));
  }

  // The way out of the rock at a point (a unit vector into the air), or null where there's no telling.
  #normal(x, y, z, caves) {
    const e = 0.35, r = (a, b, c) => this.#rock(a, b, c, caves);
    const gx = r(x + e, y, z) - r(x - e, y, z), gy = r(x, y + e, z) - r(x, y - e, z), gz = r(x, y, z + e) - r(x, y, z - e);
    const l = Math.hypot(gx, gy, gz);
    return l > 1e-5 ? [-gx / l, -gy / l, -gz / l] : null;
  }

  // A point brought onto the rock's face (floor, wall or roof) nearest it: [x, y, z, normal] or null if there's none near.
  // (`along`: the way out of the rock it was on, to come down onto it by first: over a rounded
  // edge, the field's own way out would pull it back to the edge.)
  #onto(x, y, z, caves, reach = 1.2, along = null) {
    const x0 = x, y0 = y, z0 = z;
    for (let it = 0; it < 5; it++) {
      const v = this.#rock(x, y, z, caves), n = it === 0 && along ? along : this.#normal(x, y, z, caves);
      if (!n) return null;
      if (Math.abs(v) < 0.04) break;
      // (Along the way out, by how deep it is: the field's only roughly a distance, so a few goes.)
      const step = Math.max(-0.8, Math.min(0.8, v));
      (x += n[0] * step), (y += n[1] * step), (z += n[2] * step);
    }
    if (Math.abs(this.#rock(x, y, z, caves)) > 0.25 || Math.hypot(x - x0, y - y0, z - z0) > reach) return null;
    const n = this.#normal(x, y, z, caves);
    return n ? [x, y, z, n] : null;
  }

  /**
   * @param ctx { eye (Vector3), under (whether you're down in the caves), caves (CaveSystem),
   *   terrain(x, z), hurt(damage), poison(), fear [{ x, z, r }] (lights), sound, pan(x, z), alive }
   */
  update(dt, ctx) {
    const eye = ctx.eye, feet = eye.y - 1.6;
    // Coming and going: only down in the caves, and never too many.
    this.wait -= dt;
    if (this.wait <= 0) {
      this.wait = 2;
      for (const s of this.spiders) if (!ctx.under || Math.hypot(s.x - eye.x, s.y - eye.y, s.z - eye.z) > (s.boss ? 170 : 90)) s.gone = true;
      if (ctx.under && ctx.alive !== false) this.#brood(ctx, feet);
      if (ctx.under && this.spiders.filter((s) => s.alive && !s.boss).length < 3 && Math.random() < 0.45) {
        // (Out of the dark a way off, somewhere it can stand.)
        for (let tries = 0; tries < 30; tries++) {
          const a = rnd(0, TAU), d = rnd(22, 45), x = eye.x + Math.sin(a) * d, z = eye.z + Math.cos(a) * d;
          // (A floor with air over it: looked for down from a few heights.)
          let y = null;
          for (const from of [feet + 6, feet + 2, feet - 3, feet - 7]) {
            const g = ctx.caves.groundAt(x, from, z, ctx.terrain(x, z));
            if (g.inCave && Number.isFinite(g.height) && g.height < from - 0.5 && Math.abs(g.height - feet) < 12) {
              y = g.height;
              break;
            }
          }
          if (y === null) continue;
          const size = rnd(0.85, 1.25);
          this.spiders.push({ x, y, z, heading: rnd(0, TAU), size, alive: true, health: 55 * size, state: 'lurk', timer: rnd(2, 6), cool: 0, gait: 0, speed: 0, rear: 0, dead: 0, shy: 0 });
          break;
        }
      }
      this.spiders = this.spiders.filter((s) => !s.gone);
    }
    for (const s of this.spiders) this.#think(s, dt, ctx, feet);
    this.#apart();
    this.#draw(ctx);
  }

  /**
   * The Broodmother: in the vastest of the great chambers only (the ones
   * hundreds of metres across), well inside one, she comes out of the dark
   * at its far side. Once killed, not again there for some days.
   */
  #brood(ctx, feet) {
    const eye = ctx.eye;
    if (this.spiders.some((s) => s.boss && s.alive)) return;
    const ch = ctx.chamberAt?.(eye.x, eye.z);
    if (!ch || ch.e > 0.85 || ch.c.rx * ch.c.rz < 110 * 110) return;
    const key = `brood@${Math.round(ch.c.x)},${Math.round(ch.c.z)}`;
    if (ctx.broodGone?.(key)) return;
    for (let tries = 0; tries < 40; tries++) {
      const a = rnd(0, TAU), d = rnd(28, 50), x = eye.x + Math.sin(a) * d, z = eye.z + Math.cos(a) * d;
      let y = null;
      for (const from of [feet + 8, feet + 3, feet - 3, feet - 8]) {
        const g = ctx.caves.groundAt(x, from, z, ctx.terrain(x, z));
        if (g.inCave && Number.isFinite(g.height) && g.height < from - 0.5 && Math.abs(g.height - feet) < 14 && g.ceiling - g.height > 7) {
          y = g.height;
          break;
        }
      }
      if (y === null) continue;
      this.spiders.push({ x, y, z, heading: rnd(0, TAU), size: BROOD.size, alive: true, health: BROOD.health, maxHealth: BROOD.health, boss: BROOD, key, spider: true, state: 'lurk', timer: 1, cool: 0, gait: 0, speed: 0, rear: 0, dead: 0, shy: 0, call: 8 });
      ctx.sound?.call('hiss', ctx.pan(x, z), 1);
      return;
    }
  }

  /** Testing: the Broodmother here. */
  spawnBrood(x, y, z) {
    this.spiders.push({ x, y, z, heading: 0, size: BROOD.size, alive: true, health: BROOD.health, maxHealth: BROOD.health, boss: BROOD, key: `brood@test`, spider: true, state: 'lurk', timer: 1, cool: 0, gait: 0, speed: 0, rear: 0, dead: 0, shy: 0, call: 8 });
  }

  #think(s, dt, ctx, feet) {
    const eye = ctx.eye;
    if (!s.alive) {
      s.dead += dt;
      if (s.dead > (s.burnt ? 4 : 90)) s.gone = true;
      // (Killed on a wall or the roof: it drops.)
      if (!s.burnt && (s.falling || (s.n && s.n[1] < 0.6))) {
        if (!s.falling) (s.falling = true), (s.vy = 0), (s.n = [0, 1, 0]), this.#tangent(s);
        s.vy -= 22 * dt;
        const ny = s.y + s.vy * dt;
        if (this.#rock(s.x, ny, s.z, ctx.caves) > 0 || s.vy < -60) (s.falling = false), (s.dead = Math.min(s.dead, 0.2));
        else s.y = ny;
      }
      if (s.burnt) s.y -= dt * 0.15 * s.size; // (sinking into the lava)
      return;
    }
    const dx = eye.x - s.x, dz = eye.z - s.z, d = Math.hypot(dx, dz), level = Math.abs(feet - s.y) < (s.n && s.n[1] < 0.6 ? 9 : 2.5);
    const toYou = Math.atan2(dx, dz);
    s.cool = Math.max(0, s.cool - dt);
    s.shy = Math.max(0, s.shy - dt);
    // A light thrust at it: it shies off a moment.
    const lit = (ctx.fear ?? []).some((f) => Math.hypot(f.x - s.x, f.z - s.z) < 3.5);
    if (lit && s.shy <= 0 && d < 4 && Math.random() < dt * 1.5) (s.shy = rnd(2, 4)), ctx.sound?.call('hiss', ctx.pan(s.x, s.z), 0.6);
    let want = s.heading, speed = 0;
    if (ctx.alive === false) s.state = 'lurk';
    else if (s.state === 'lurk' && d < (s.boss ? 45 : 20) && level) (s.state = 'hunt'), ctx.sound?.call('hiss', ctx.pan(s.x, s.z), s.boss ? 1 : 0.4);
    s.hunting = s.state !== 'lurk';
    // (The Broodmother, fighting: now and then she calls her brood to her.)
    if (s.boss && s.hunting && (s.call -= dt) <= 0) {
      s.call = rnd(12, 18);
      for (let k = 0; k < 2 && this.spiders.length < MAX; k++) {
        const a = rnd(0, TAU), x = s.x + Math.sin(a) * 4, z = s.z + Math.cos(a) * 4, y = this.#floor(x, s.y, z, ctx.caves, ctx.terrain, 4);
        if (y !== null) this.spiders.push({ x, y, z, heading: a, size: rnd(0.7, 0.95), alive: true, health: 40, state: 'hunt', timer: 2, cool: 1, gait: 0, speed: 0, rear: 0, dead: 0, shy: 0 });
      }
      ctx.sound?.call('hiss', ctx.pan(s.x, s.z), 1);
    }
    if (s.state === 'lurk') {
      s.timer -= dt;
      if (s.timer <= 0) (s.timer = rnd(2, 6)), (s.target = s.heading + rnd(-2, 2)), (s.moveFor = rnd(0.5, 2));
      if ((s.moveFor = (s.moveFor ?? 0) - dt) > 0) (want = s.target ?? s.heading), (speed = 1.2);
    } else if (s.state === 'hunt') {
      if (d > (s.boss ? 70 : 35) || !level) s.state = 'lurk';
      else if (s.shy > 0) (want = toYou + Math.PI), (speed = 3);
      else if (Math.hypot(d, feet - s.y) > 3 + s.size * 1.5 || (s.n && s.n[1] < 0.6)) (want = toYou + Math.sin(performance.now() / 700 + s.size * 9) * 0.5), (speed = s.boss ? 5 : 4.2);
      else if (s.cool <= 0) {
        // Rear up, then lunge.
        s.rear += dt;
        want = toYou;
        if (s.rear > 0.45) {
          s.rear = 0;
          s.state = 'lunge';
          s.lunge = { t: 0, dir: toYou };
          ctx.sound?.call('hiss', ctx.pan(s.x, s.z), 0.8);
        }
      } else (want = toYou + Math.PI * 0.6), (speed = 2); // (backing round, between lunges)
    }
    if (s.state === 'lunge') {
      s.lunge.t += dt;
      want = s.lunge.dir;
      speed = 9;
      if (Math.hypot(d, feet + 0.6 - s.y) < 1.3 + s.size * 0.4) {
        // The bite.
        ctx.hurt?.(s.boss ? s.boss.bite : Math.round(12 * s.size));
        if (Math.random() < (s.boss ? 0.6 : 0.3)) ctx.poison?.();
        s.state = 'hunt';
        s.cool = rnd(1.4, 2.4);
      } else if (s.lunge.t > 0.5) (s.state = 'hunt'), (s.cool = rnd(1, 1.8));
    }
    this.#move(s, dt, ctx, want, speed);
  }

  /**
   * Moving over the rock: a spider goes where it likes over floor, walls and
   * roof alike, its feet to the rock (`n`, the way out of the rock under it;
   * `f`, the way it faces, along the rock). It swims over water, keeps off
   * lava (and dies in it), drops off the roof onto you, and falls where
   * there's nothing to hold to.
   */
  #move(s, dt, ctx, want, speed) {
    const caves = ctx.caves, k = s.size, eye = ctx.eye;
    s.n ??= [0, 1, 0];
    s.f ??= [Math.sin(s.heading), 0, Math.cos(s.heading)];
    // What it's on or in (water, lava): looked at now and then.
    if ((s.look = (s.look ?? 0) - dt) <= 0) {
      s.look = 0.25;
      s.water = caves.waterAt(s.x, s.y, s.z);
      // (And just ahead: lava there, it turns aside.)
      const ax = s.x + s.f[0] * 2 * k, az = s.z + s.f[2] * 2 * k, ahead = caves.waterAt(ax, s.y, az);
      if (ahead?.lava && s.y < ahead.level + 1.2) s.avoid = 0.8;
    }
    const w = s.water;
    if (w?.lava && s.y < w.level + 0.15 && !s.falling) {
      // Into the lava: it burns, and is gone.
      s.alive = false;
      s.dead = 0;
      s.burnt = true;
      s.y = w.level;
      s.n = [0, 1, 0];
      if (s.boss) this.onKill?.(s); // (her trophy, still, from the edge of the lava: nothing of a lesser one's left)
      return;
    }
    if ((s.avoid = Math.max(0, (s.avoid ?? 0) - dt)) > 0) (want = Math.atan2(-s.f[0], -s.f[2]) + 0.6), (speed = Math.max(speed, 3));
    // Falling: off the roof onto you, or where it's lost its hold.
    if (s.falling) {
      s.vy = (s.vy ?? 0) - 22 * dt;
      const ny = s.y + s.vy * dt;
      if (w && !w.lava && ny < w.level - 0.3 * k) {
        s.falling = false;
        s.y = w.level - 0.3 * k;
        s.vy = 0;
        s.n = [0, 1, 0];
        return;
      }
      if (this.#rock(s.x, ny, s.z, caves) > 0) {
        const on = this.#onto(s.x, ny + 0.3, s.z, caves, 2);
        s.falling = false;
        s.vy = 0;
        if (on) [s.x, s.y, s.z, s.n] = on;
        else s.n = [0, 1, 0];
        this.#tangent(s);
        return;
      }
      s.y = ny;
      if (s.vy < -60) s.gone = true;
      return;
    }
    // The way it wants to go: toward `want` over the ground, or (hunting) straight at you, along the rock it's on.
    const n = s.n;
    let dx = Math.sin(want), dy = 0, dz = Math.cos(want);
    if (s.hunting && !s.avoid && s.shy <= 0) {
      const tx = eye.x - s.x, ty = eye.y - 1.2 - s.y, tz = eye.z - s.z, l = Math.hypot(tx, ty, tz) || 1;
      const wob = want - Math.atan2(tx, tz);
      (dx = tx / l), (dy = ty / l), (dz = tz / l);
      // (Its weave from side to side, still.)
      if (Math.abs(wob) > 0.01) {
        const c = Math.cos(wob), sn = Math.sin(wob);
        [dx, dz] = [dx * c + dz * sn, -dx * sn + dz * c];
      }
      // (On the roof right over you: it lets go.)
      if (n[1] < -0.3 && Math.hypot(tx, tz) < 2.2 && ty < 0) {
        s.falling = true;
        s.vy = 0;
        s.n = [0, 1, 0];
        this.#tangent(s);
        return;
      }
    }
    const dn = dx * n[0] + dy * n[1] + dz * n[2];
    (dx -= n[0] * dn), (dy -= n[1] * dn), (dz -= n[2] * dn);
    const dl = Math.hypot(dx, dy, dz);
    const f = s.f;
    if (dl > 0.05) {
      // Turning toward it, at most so fast.
      const t = Math.min(1, dt * 5);
      (f[0] += (dx / dl - f[0]) * t), (f[1] += (dy / dl - f[1]) * t), (f[2] += (dz / dl - f[2]) * t);
      this.#tangent(s);
    }
    s.speed += (speed - s.speed) * Math.min(1, dt * 8);
    s.heading = Math.atan2(f[0], f[2]);
    if (s.speed > 0.05) {
      const v = s.speed * dt;
      if (s.swim) {
        // Swimming: over the water, low in it, legs going, out where it's shallow.
        const sw = s.swim, nx = s.x + f[0] * v * 0.7, nz = s.z + f[2] * v * 0.7;
        if (this.#rock(nx, sw + 0.2, nz, caves) > 0) {
          // (A bank or a wall: out of the water onto it, as onto any rock.)
          const on = this.#onto(nx, sw + 0.3, nz, caves, 1.5);
          if (on && (!s.boss || on[3][1] > 0.55)) ([s.x, s.y, s.z, s.n] = on), (s.swim = null), this.#tangent(s);
          else s.heading += 0.8, (s.f = [Math.sin(s.heading), 0, Math.cos(s.heading)]);
        } else {
          (s.x = nx), (s.z = nz);
          const bed = this.#onto(nx, sw - 0.3 * k, nz, caves, 1.6);
          if (bed && bed[1] > sw - 0.3 * k && bed[3][1] > 0.4) ([s.x, s.y, s.z, s.n] = bed), (s.swim = null);
        }
        if (w && !w.lava && Math.abs(w.level - sw) < 1) s.swim = s.swim === null ? null : w.level;
      } else {
        let moved = false;
        for (const off of [0, 0.7, -0.7, 1.4, -1.4]) {
          // (Round what's in the way: a little to one side, then the other.)
          let gx = f[0], gy = f[1], gz = f[2];
          if (off) {
            const c = Math.cos(off), sn = Math.sin(off);
            // (Turned about the way out of the rock.)
            const cx = n[1] * gz - n[2] * gy, cy = n[2] * gx - n[0] * gz, cz = n[0] * gy - n[1] * gx;
            (gx = gx * c + cx * sn), (gy = gy * c + cy * sn), (gz = gz * c + cz * sn);
          }
          const on = this.#onto(s.x + gx * v + n[0] * 0.15, s.y + gy * v + n[1] * 0.15, s.z + gz * v + n[2] * 0.15, caves, v + 1, n);
          if (!on) continue;
          // (The Broodmother's too great to go up the walls; and none of them over the lip of lava.)
          if (s.boss && on[3][1] < 0.55) continue;
          [s.x, s.y, s.z] = on;
          // (Its feet come round to the new rock smoothly.)
          const t = Math.min(1, dt * 10);
          s.n = [n[0] + (on[3][0] - n[0]) * t, n[1] + (on[3][1] - n[1]) * t, n[2] + (on[3][2] - n[2]) * t];
          const nl = Math.hypot(...s.n) || 1;
          s.n = s.n.map((c) => c / nl);
          if (off) (f[0] = gx), (f[1] = gy), (f[2] = gz);
          this.#tangent(s);
          moved = true;
          break;
        }
        if (!moved && !this.#onto(s.x, s.y, s.z, caves, 0.6)) (s.falling = true), (s.vy = 0), (s.n = [0, 1, 0]), this.#tangent(s);
        // Into deep water: it swims.
        if (w && !w.lava && s.y < w.level - 0.35 * k) (s.swim = w.level), (s.y = w.level - 0.3 * k), (s.n = [0, 1, 0]), this.#tangent(s);
      }
      s.gait += s.speed * dt * 3.2 / s.size;
    }
    if (s.swim) s.y += (s.swim - 0.3 * k - s.y) * Math.min(1, dt * 6);
  }

  // Its facing made to lie along the rock (square to `n`).
  #tangent(s) {
    const n = s.n, f = s.f;
    const d = f[0] * n[0] + f[1] * n[1] + f[2] * n[2];
    (f[0] -= n[0] * d), (f[1] -= n[1] * d), (f[2] -= n[2] * d);
    let l = Math.hypot(f[0], f[1], f[2]);
    if (l < 1e-4) {
      // (Straight along the way out: any way along the rock will do.)
      const a = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
      (f[0] = a[1] * n[2] - a[2] * n[1]), (f[1] = a[2] * n[0] - a[0] * n[2]), (f[2] = a[0] * n[1] - a[1] * n[0]);
      l = Math.hypot(f[0], f[1], f[2]);
    }
    (f[0] /= l), (f[1] /= l), (f[2] /= l);
  }

  // The spiders kept apart: none walks through another.
  #apart() {
    const list = this.spiders;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        const min = 0.85 * (a.size + b.size), dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, d = Math.hypot(dx, dy, dz);
        if (d >= min || d < 1e-4) continue;
        const push = (min - d) / d / 2, wa = a.alive ? 1 : 0, wb = b.alive ? 1 : 0;
        if (!wa && !wb) continue;
        const sa = wb ? (wa ? 1 : 0) : 2, sb = wa ? (wb ? 1 : 0) : 2;
        if (wa) (a.x -= dx * push * sb), (a.z -= dz * push * sb);
        if (wb) (b.x += dx * push * sa), (b.z += dz * push * sa);
      }
    }
  }

  /**
   * A blow or a shot: `along` a ray from `origin`, within `max`: { distance,
   * point, animal (the spider), spider: true } or null. Its shape, as it's
   * drawn: the great abdomen behind, the thorax and head before it, and the
   * legs out to either side (a shot through a leg still hits it).
   */
  aim(origin, dir, max = 150) {
    let best = null;
    for (const s of this.spiders) {
      if (!s.alive) continue;
      const k = s.size;
      if (Math.hypot(s.x - origin.x, s.z - origin.z) > max + 2 * k) continue;
      if (!s.q) continue;
      for (const [lx, ly, lz, r] of SHAPE) {
        // (Each part where it's drawn: turned with it, on the floor, a wall or the roof.)
        off.set(lx * k, (ly - PIVOT) * k, lz * k).applyQuaternion(s.q).add(s.pivot);
        const cx = off.x - origin.x, cy = off.y - origin.y, cz = off.z - origin.z;
        const t = cx * dir.x + cy * dir.y + cz * dir.z, rr = r * k;
        const d2 = cx * cx + cy * cy + cz * cz - t * t;
        if (d2 > rr * rr || t < -rr) continue;
        const hit = Math.max(0, t - Math.sqrt(rr * rr - d2));
        if (hit <= max && (!best || hit < best.distance)) best = { distance: hit, point: origin.clone().addScaledVector(dir, hit), animal: s, spider: true, head: false };
      }
    }
    return best;
  }

  /** It's struck (`sharp`: how keen the blade or point): returns 'dead' or 'hurt'. */
  wound(s, sharp = 1) {
    s.health -= 20 * sharp;
    s.state = 'hunt';
    s.cool = Math.max(s.cool, 0.6);
    if (s.health > 0) return 'hurt';
    s.alive = false;
    s.dead = 0;
    this.onKill?.(s);
    return 'dead';
  }

  clear() {
    this.spiders = [];
  }

  #draw(ctx) {
    const m = new Matrix4(), q = new Quaternion(), q2 = new Quaternion(), p = new Vector3(), sc = new Vector3(), a = new Vector3(), b = new Vector3(), dir = new Vector3(), UP = new Vector3(0, 1, 0);
    let n = 0, l = 0;
    for (const s of this.spiders) {
      if (n >= MAX) break;
      const k = s.size, rear = s.state === 'lunge' ? 0.25 : Math.min(1, s.rear * 2.2) * 0.3;
      // Dead: it goes over like the other creatures do, all of a piece (its
      // legs stay on it): toppling sideways onto its back, a little hop as
      // it goes and a bounce as it lands, the legs curling in as it dies.
      const dead = !s.alive;
      const t = dead ? Math.min(1, s.dead / 0.7) : 0, over = t * t * (3 - 2 * t);
      const curl = dead ? Math.min(1, s.dead / 1.2) : 0;
      const side = s.side ??= Math.random() < 0.5 ? 1 : -1;
      // (Its feet to the rock it's on, floor, wall or roof, facing along it.)
      const nn = s.n ?? [0, 1, 0], ff = s.f ?? [Math.sin(s.heading), 0, Math.cos(s.heading)];
      bY.set(nn[0], nn[1], nn[2]);
      bZ.set(ff[0], ff[1], ff[2]);
      bX.crossVectors(bY, bZ);
      q.setFromRotationMatrix(basis.makeBasis(bX, bY, bZ));
      if (dead) q.multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), side * Math.PI * (over + 0.06 * Math.sin(Math.min(1, s.dead / 1.1) * Math.PI * 3) * (1 - curl * 0.5))));
      else if (rear) q.multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -rear));
      const bob = dead ? (0.35 * Math.sin(Math.PI * t) - 0.05 * over) * k : Math.abs(Math.sin(s.gait * 2)) * 0.04 * k;
      // (Everything turned about its middle, PIVOT up from its feet.)
      const lift = PIVOT * k + bob;
      const pivot = p.set(s.x + nn[0] * lift, s.y + nn[1] * lift, s.z + nn[2] * lift).clone();
      s.q = (s.q ?? new Quaternion()).copy(q);
      s.pivot = pivot;
      const world = (lx, ly, lz, out) => out.set(lx * k, (ly - PIVOT) * k, lz * k).applyQuaternion(q).add(pivot);
      m.compose(world(0, 0, 0, new Vector3()), q, sc.setScalar(k));
      this.bodies.setColorAt(n, s.burnt ? BURNT : s.boss ? BROOD_TINT : PLAIN);
      this.bodies.setMatrixAt(n++, m);
      // The legs: four a side, each a thigh up and out to the knee and a
      // shank down to the foot, stepping by turns as it goes; dead, drawn in.
      const mix = (live, gone) => live + (gone - live) * curl;
      for (let i = 0; i < LEGS; i++) {
        const sd = i < 4 ? 1 : -1, j = i % 4;
        const along = 0.22 - j * 0.14, spread = [0.6, 0.15, -0.25, -0.65][j];
        const phase = s.gait + ((j % 2) ^ (sd > 0 ? 0 : 1)) * Math.PI;
        const lift = dead ? 0 : Math.max(0, Math.sin(phase)) * 0.25, swing = dead ? 0 : Math.cos(phase) * 0.22;
        const hipX = sd * 0.18, hipZ = along;
        const footX = sd * mix(1.0, 0.3), footZ = mix(along + spread + swing * (s.speed > 0.1 ? 1 : 0), along + spread * 0.35);
        const kneeX = sd * mix(0.62, 0.42), kneeZ = (hipZ + footZ) / 2;
        const kneeY = mix(0.95 + lift * 0.5, 0.15), footY = mix(lift, 0.35);
        world(hipX, 0.5, hipZ, a);
        world(kneeX, kneeY, kneeZ, b);
        for (const [from, to, thick] of [[a, b, 0.07], [b, world(footX, footY, footZ, new Vector3()), 0.05]]) {
          if (l >= this.legs.instanceMatrix.count) break;
          dir.subVectors(to, from);
          const len = dir.length();
          q2.setFromUnitVectors(UP, dir.normalize());
          m.compose(from, q2, sc.set(thick * k, len, thick * k));
          this.legs.setColorAt(l, s.burnt ? BURNT : s.boss ? BROOD_TINT : PLAIN);
          this.legs.setMatrixAt(l++, m);
        }
      }
    }
    this.bodies.count = n;
    this.legs.count = l;
    this.bodies.instanceMatrix.needsUpdate = this.legs.instanceMatrix.needsUpdate = true;
    if (this.bodies.instanceColor) this.bodies.instanceColor.needsUpdate = true;
    if (this.legs.instanceColor) this.legs.instanceColor.needsUpdate = true;
  }
}
