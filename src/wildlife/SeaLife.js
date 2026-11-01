import { Color, ConeGeometry, Group, IcosahedronGeometry, Mesh, MeshLambertMaterial, Vector3 } from 'three';
import { Parts } from '../survival/models.js';
import { Puffs } from '../render/Puffs.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const TAU = Math.PI * 2;
const angleTo = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

// The Deep Coil: the great serpent of the ocean trenches.
export const SERPENT = { name: 'The Deep Coil', health: 2600, bite: 38 };

/**
 * A dolphin, about 2.4 m nose to flukes (facing +z, its middle at 0): a
 * long rounded body, slate-grey over, pale under, the beak, the curved
 * dorsal fin, the flippers and the flukes.
 */
function dolphinGeometry() {
  const b = new Parts(501);
  b.add(new IcosahedronGeometry(0.5, 1), 0x5a6a78, [0, 0.02, 0.1], [0, 0, 0], [0.55, 0.55, 2.1]);
  b.add(new IcosahedronGeometry(0.42, 1), 0xc8ccd0, [0, -0.1, 0.15], [0, 0, 0], [0.5, 0.35, 1.7]); // (the pale belly)
  b.add(new IcosahedronGeometry(0.3, 1), 0x5e6e7c, [0, 0.05, 0.95], [0, 0, 0], [0.6, 0.6, 0.9]); // (the melon of the head)
  b.add(new ConeGeometry(0.1, 0.42, 6), 0x6a7884, [0, -0.02, 1.33], [Math.PI / 2, 0, 0]); // (the beak)
  b.add(new ConeGeometry(0.16, 0.42, 4), 0x4a5866, [0, 0.38, -0.05], [-0.5, 0, 0], [0.35, 1, 1]); // (the dorsal fin)
  for (const s of [-1, 1]) b.add(new ConeGeometry(0.1, 0.4, 4), 0x56646f, [s * 0.28, -0.15, 0.45], [0.3, 0, s * 1.25], [1, 1, 0.35]); // (the flippers)
  b.add(new IcosahedronGeometry(0.2, 0), 0x56646f, [0, 0, -0.95], [0, 0, 0], [0.6, 0.4, 1.4]); // (the tail stock)
  for (const s of [-1, 1]) b.add(new ConeGeometry(0.16, 0.5, 4), 0x4e5c68, [s * 0.22, 0, -1.2], [Math.PI / 2, 0, s * 1.1], [1, 1, 0.25]); // (the flukes)
  return b.build();
}

/**
 * A humpback whale, 15 m or so (built 1 long, scaled): the long dark body,
 * pale grooves along its throat, its great pale flippers a third as long
 * as itself, the knobbly head, the small fin, the broad flukes.
 */
function whaleGeometry() {
  const b = new Parts(503);
  b.add(new IcosahedronGeometry(0.5, 1), 0x2e3238, [0, 0, 0.02], [0, 0, 0], [0.26, 0.22, 1.0]);
  b.add(new IcosahedronGeometry(0.45, 1), 0x9a9c9e, [0, -0.05, 0.12], [0, 0, 0], [0.24, 0.12, 0.8]); // (the throat grooves, pale)
  b.add(new IcosahedronGeometry(0.2, 1), 0x34383e, [0, 0.03, 0.38], [0, 0, 0], [0.55, 0.45, 0.8]); // (the head)
  for (const s of [-1, 1]) b.add(new IcosahedronGeometry(0.25, 0), 0xd8d8d4, [s * 0.22, -0.06, 0.2], [0, s * 0.6, s * 0.3], [0.12, 0.03, 1.25]); // (the long white flippers)
  b.add(new ConeGeometry(0.05, 0.08, 4), 0x2a2e34, [0, 0.13, -0.18], [-0.6, 0, 0]); // (the little fin)
  b.add(new IcosahedronGeometry(0.15, 0), 0x2e3238, [0, 0, -0.5], [0, 0, 0], [0.5, 0.45, 1.6]); // (the tail stock)
  for (const s of [-1, 1]) b.add(new ConeGeometry(0.13, 0.32, 4), 0x2a2e34, [s * 0.13, 0, -0.66], [Math.PI / 2, 0, s * 1.15], [1, 1, 0.18]); // (the flukes)
  return b.build();
}

/** The serpent's head, about 2.6 m long: a long armoured skull, a jaw full of teeth, pale eyes. */
function serpentHead() {
  const b = new Parts(507);
  b.add(new IcosahedronGeometry(0.6, 1), 0x1e2a26, [0, 0.1, 0.2], [0, 0, 0], [1.0, 0.65, 2.0]);
  b.add(new IcosahedronGeometry(0.5, 1), 0x3a4a40, [0, -0.3, 0.5], [0.15, 0, 0], [0.9, 0.35, 1.9]); // (the jaw)
  for (let k = 0; k < 8; k++) for (const s of [-1, 1]) b.add(new ConeGeometry(0.05, 0.28, 4), 0xe8e0c8, [s * (0.28 - k * 0.02), -0.2, 1.3 - k * 0.14], [Math.PI, 0, 0]); // (teeth)
  for (const s of [-1, 1]) b.add(new IcosahedronGeometry(0.11, 0), 0xc8d890, [s * 0.42, 0.32, 0.75]); // (the eyes, pale)
  for (let k = 0; k < 4; k++) b.add(new ConeGeometry(0.08, 0.5, 4), 0x2a3832, [0, 0.55, 0.3 - k * 0.35], [-0.6, 0, 0]); // (the crest)
  return b.build();
}
/** One of its body's rings: dark over, pale under, a spine on its back. */
function serpentRing() {
  const b = new Parts(509);
  b.add(new IcosahedronGeometry(0.6, 1), 0x1e2a26, [0, 0.05, 0], [0, 0, 0], [1, 0.95, 1.5]);
  b.add(new IcosahedronGeometry(0.5, 1), 0x8a9478, [0, -0.25, 0], [0, 0, 0], [0.9, 0.5, 1.3]);
  b.add(new ConeGeometry(0.07, 0.5, 4), 0x2e3c34, [0, 0.62, 0], [-0.5, 0, 0]);
  return b.build();
}

/**
 * The great creatures of the open sea, round you when you're out on it:
 *  - dolphins, pods of them, rolling up through the surface to breathe and
 *    leaping clear now and then; out to your boat when you sail or paddle,
 *    riding the wave off its bow;
 *  - whales, far out over the deep water: a long dark back rolling up, the
 *    blow from it, the flukes lifted as it sounds; and now and then the
 *    whole of one hurling itself out of the sea and crashing back;
 *  - and in the ocean trenches, the Deep Coil.
 * All of them hard to kill, as they'd be: thick blubber over them, great
 * strength; a dolphin hurt dives and is gone, a whale shrugs off the
 * blows and sounds; dead, a dolphin or a whale floats, belly up, rising
 * and falling with the swell, drifting, till it's waterlogged and sinks;
 * the serpent sinks into the dark.
 */
export class SeaLife {
  constructor(scene, materialHook = (m) => m) {
    this.scene = scene;
    this.material = materialHook(new MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    this.geo = { dolphin: dolphinGeometry(), whale: whaleGeometry(), head: serpentHead(), ring: serpentRing() };
    this.list = [];
    this.wait = 2;
    this.onKill = null; // (creature) => what it leaves
  }

  clear() {
    for (const c of this.list) this.#drop(c);
    this.list = [];
  }

  #drop(c) {
    this.scene.remove(c.group);
    c.spout?.dispose();
  }

  #make(kind, x, y, z, extra = {}) {
    const group = new Group();
    group.name = kind;
    if (kind === 'serpent') {
      const head = new Mesh(this.geo.head, this.material);
      head.castShadow = true;
      group.add(head);
      extra.rings = [];
      for (let k = 0; k < 26; k++) {
        const r = new Mesh(this.geo.ring, this.material);
        const s = 1.15 - 0.85 * (k / 26) ** 1.4;
        r.scale.setScalar(s);
        this.scene.add(r);
        extra.rings.push(r);
      }
    } else {
      const m = new Mesh(kind === 'whale' ? this.geo.whale : this.geo.dolphin, this.material);
      m.castShadow = true;
      group.add(m);
    }
    this.scene.add(group);
    const c = { kind, x, y, z, heading: rnd(0, TAU), pitch: 0, roll: 0, speed: 0, alive: true, dead: 0, group, phase: rnd(0, TAU), spider: true, sea: true, ...extra };
    if (kind === 'serpent') c.trail = Array.from({ length: 140 }, () => [x, y, z]);
    this.list.push(c);
    return c;
  }

  /**
   * @param ctx { eye (Vector3), waterAt(x, z) -> { level, lake } | null, ground(x, z), ocean(x, z) (0..1),
   *   boat: { x, z, rot, speed } | null, swimming, time, sound, pan(x, z), splash(x, y, z, size), hurt(n), bleed(),
   *   alive, night (0..1), broodGone(key) (a great beast killed lately), light (Color) }
   */
  update(dt, ctx) {
    const eye = ctx.eye;
    this.wait -= dt;
    if (this.wait <= 0) {
      this.wait = 3;
      this.#comeAndGo(ctx);
    }
    for (const c of this.list) {
      if (c.kind === 'dolphin') this.#dolphin(c, dt, ctx);
      else if (c.kind === 'whale') this.#whale(c, dt, ctx);
      else this.#serpent(c, dt, ctx);
      if (!c.alive) this.#floatDead(c, dt, ctx);
      this.#draw(c, ctx);
    }
    const gone = this.list.filter((c) => c.gone);
    if (gone.length) {
      for (const c of gone) this.#drop(c);
      this.list = this.list.filter((c) => !c.gone);
    }
    void eye;
  }

  // The open sea at (x, z): { level, depth } where it's the sea, deep enough; else null.
  #sea(x, z, ctx, min = 6) {
    const w = ctx.waterAt(x, z);
    if (!w || w.frozen) return null;
    const g = ctx.ground(x, z);
    if (!Number.isFinite(g) || w.level - g < min || ctx.ocean(x, z) < 0.5) return null;
    return { level: w.level, depth: w.level - g };
  }

  // New ones out of the sea round you, and those far behind gone.
  #comeAndGo(ctx) {
    const e = ctx.eye;
    for (const c of this.list) {
      const d = Math.hypot(c.x - e.x, c.z - e.z);
      if (d > (c.kind === 'whale' ? 700 : c.kind === 'serpent' ? 400 : 300) || (!c.alive && c.dead > 600)) c.gone = true;
    }
    const here = this.#sea(e.x, e.z, ctx, 3);
    if (!here) return;
    const count = (k) => this.list.filter((c) => c.kind === k && c.alive).length;
    // A pod of dolphins, now and then, anywhere out on the sea.
    if (count('dolphin') === 0 && Math.random() < 0.25) {
      const a = rnd(0, TAU), d = rnd(50, 110), x = e.x + Math.sin(a) * d, z = e.z + Math.cos(a) * d, s = this.#sea(x, z, ctx, 6);
      if (s) {
        const n = 3 + Math.floor(Math.random() * 5), heading = rnd(0, TAU);
        const pod = { x, z, heading };
        for (let k = 0; k < n; k++) this.#make('dolphin', x + rnd(-6, 6), s.level - 1.5, z + rnd(-6, 6), { pod, health: 420 * rnd(0.85, 1.15), size: rnd(0.85, 1.15), heading, slot: [rnd(-6, 6), rnd(-5, 5)] });
      }
    }
    // A whale far out over the deep.
    if (count('whale') < 2 && Math.random() < 0.18) {
      const a = rnd(0, TAU), d = rnd(150, 320), x = e.x + Math.sin(a) * d, z = e.z + Math.cos(a) * d, s = this.#sea(x, z, ctx, 30);
      if (s) this.#make('whale', x, s.level - 8, z, { health: 4200, size: rnd(12, 17), state: 'cruise', timer: rnd(10, 40), blow: 0 });
    }
    // The Deep Coil: over a trench (the sea floor far down, a hundred metres
    // and more), out there on the water or in it; once killed, not again
    // there for some days.
    if (count('serpent') === 0 && here.depth > 90 && (ctx.swimming || ctx.boat) && !ctx.broodGone?.('serpent@deep')) {
      const a = rnd(0, TAU), x = e.x + Math.sin(a) * 60, z = e.z + Math.cos(a) * 60, s = this.#sea(x, z, ctx, 60);
      if (s && Math.random() < 0.35) {
        const c = this.#make('serpent', x, s.level - 30, z, { health: SERPENT.health, maxHealth: SERPENT.health, boss: SERPENT, key: 'serpent@deep', state: 'circle', timer: rnd(8, 14), cool: 0, size: 1 });
        ctx.sound?.call('rumble', ctx.pan(x, z), 0.8);
        void c;
      }
    }
  }

  // Steering: the heading turned toward `want` at most `rate` a second; on along it at `speed`.
  #steer(c, want, rate, dt) {
    c.heading += Math.max(-rate * dt, Math.min(rate * dt, angleTo(c.heading, want)));
  }

  #dolphin(c, dt, ctx) {
    if (!c.alive) return;
    const pod = c.pod, s = this.#sea(c.x, c.z, ctx, 2.5);
    const level = s?.level ?? c.y + 1.5;
    // Where the pod is making for: alongside your boat, ahead of its bow, if
    // you're making way; else wandering on over the sea.
    const boat = ctx.boat;
    let tx, tz, speed;
    c.fear = Math.max(0, (c.fear ?? 0) - dt);
    if (c.fear > 0) {
      // (Hurt, or one of the pod hurt: all of them away, fast and deep.)
      tx = c.x + Math.sin(c.fleeTo) * 50;
      tz = c.z + Math.cos(c.fleeTo) * 50;
      speed = 11;
    } else if (boat && boat.speed > 1.2 && Math.hypot(boat.x - c.x, boat.z - c.z) < 120) {
      const fx = Math.sin(boat.rot), fz = Math.cos(boat.rot);
      tx = boat.x + fx * (5 + c.slot[1] * 0.4) + fz * c.slot[0] * 0.6;
      tz = boat.z + fz * (5 + c.slot[1] * 0.4) - fx * c.slot[0] * 0.6;
      speed = Math.min(12, boat.speed + 1.5 + Math.hypot(tx - c.x, tz - c.z) * 0.15);
    } else {
      pod.heading += Math.sin(ctx.time * 0.05 + pod.x) * 0.1 * dt;
      // (Off the shallows: turned back out to sea.)
      const ax = pod.x + Math.sin(pod.heading) * 30, az = pod.z + Math.cos(pod.heading) * 30;
      if (!this.#sea(ax, az, ctx, 5)) pod.heading += Math.PI * 0.7;
      pod.x += Math.sin(pod.heading) * 3.5 * dt;
      pod.z += Math.cos(pod.heading) * 3.5 * dt;
      tx = pod.x + c.slot[0];
      tz = pod.z + c.slot[1];
      speed = 3.5 + Math.hypot(tx - c.x, tz - c.z) * 0.2;
    }
    this.#steer(c, Math.atan2(tx - c.x, tz - c.z), 2.2, dt);
    c.speed += (Math.min(13, speed) - c.speed) * Math.min(1, dt * 1.5);
    const nx = c.x + Math.sin(c.heading) * c.speed * dt, nz = c.z + Math.cos(c.heading) * c.speed * dt;
    if (this.#sea(nx, nz, ctx, 2.5)) (c.x = nx), (c.z = nz);
    else c.heading += Math.PI * dt;
    // Rolling up through the surface to breathe, and down again; quicker and
    // bolder the faster it goes; now and then a leap clear of the water.
    c.phase += dt * (0.7 + c.speed * 0.12);
    if (c.leap === undefined && Math.sin(c.phase) > 0.99 && Math.random() < (c.fear ? 0 : 0.25)) c.leap = 0;
    const roll = Math.sin(c.phase), deep = c.fear > 0 ? 4 : 1.1;
    let y = level - deep + roll * (c.fear > 0 ? 0.5 : 1.0);
    if (c.leap !== undefined) {
      c.leap += dt;
      const T = 1.1;
      y = level - 0.6 + 4.5 * (c.leap / T) * (1 - c.leap / T) * 2.2;
      c.pitch = 0.9 * (1 - (2 * c.leap) / T);
      if (c.leap > T) (c.leap = undefined), ctx.splash?.(c.x, level, c.z, 1.4);
    } else c.pitch = Math.cos(c.phase) * 0.35;
    // (Breaking the surface, or going back under: a splash.)
    const wasUp = c.y > level - 0.2, up = y > level - 0.2;
    if (wasUp !== up && c.speed > 2 && Math.hypot(c.x - ctx.eye.x, c.z - ctx.eye.z) < 90) ctx.splash?.(c.x, level, c.z, 0.5);
    c.y = y;
  }

  #whale(c, dt, ctx) {
    if (!c.alive) return;
    const s = this.#sea(c.x, c.z, ctx, 12), level = s?.level ?? c.y + 8, L = c.size;
    c.timer -= dt;
    c.fear = Math.max(0, (c.fear ?? 0) - dt);
    // (Away from the shallows, always; out to the deep water.)
    const ax = c.x + Math.sin(c.heading) * L * 3, az = c.z + Math.cos(c.heading) * L * 3;
    if (!this.#sea(ax, az, ctx, 18)) c.heading += 0.6 * dt;
    else c.heading += Math.sin(ctx.time * 0.03 + c.phase) * 0.04 * dt;
    const speed = c.fear > 0 ? 5 : c.state === 'breach' ? 0.5 : 2;
    c.x += Math.sin(c.heading) * speed * dt;
    c.z += Math.cos(c.heading) * speed * dt;
    let ty = c.y, pitch = 0;
    if (c.state === 'cruise') {
      // Down in the deep, a while.
      ty = level - (c.fear > 0 ? 30 : 14);
      if (c.timer <= 0 && !c.fear) (c.state = 'surface'), (c.timer = rnd(18, 30)), (c.blow = 1);
    } else if (c.state === 'surface') {
      // Up at the surface: its back rolling slowly up and over, the blow from it now and then.
      ty = level - L * 0.08 + Math.sin(ctx.time * 0.6 + c.phase) * 0.25;
      pitch = Math.sin(ctx.time * 0.6 + c.phase) * 0.05;
      if ((c.blow -= dt) <= 0) {
        c.blow = rnd(5, 9);
        this.#spout(c, level, ctx);
      }
      if (c.timer <= 0) {
        // Sounding (the flukes lifted as it goes), or now and then a breach.
        if (Math.random() < 0.35 && !c.fear) (c.state = 'breach'), (c.timer = 0), (c.breachFrom = level - L * 0.9), (c.y = level - L * 0.9);
        else (c.state = 'sound'), (c.timer = 5);
      }
    } else if (c.state === 'sound') {
      ty = level - 4;
      pitch = -0.7 * Math.min(1, (5 - c.timer) / 2);
      if (c.timer <= 0) (c.state = 'cruise'), (c.timer = rnd(40, 90));
    } else if (c.state === 'breach') {
      // Hurled up out of the sea nearly the whole of its length, turning on
      // its side at the top, and crashing back in a great burst of water.
      c.timer += dt;
      const T = 4.2, t = c.timer / T;
      c.y = c.breachFrom + L * 1.6 * Math.sin(Math.PI * Math.min(1, t));
      c.pitch = 1.25 * (1 - t) - 0.2;
      c.roll = Math.min(1.4, t * 2) * Math.sign(Math.sin(c.phase) || 1);
      if (t > 0.92 && !c.crashed) {
        c.crashed = true;
        for (let k = 0; k < 3; k++) ctx.splash?.(c.x + rnd(-L * 0.3, L * 0.3), level, c.z + rnd(-L * 0.3, L * 0.3), 4 + L * 0.2);
        const d = Math.hypot(c.x - ctx.eye.x, c.z - ctx.eye.z);
        if (d < 900) ctx.sound?.call('bigsplash', ctx.pan(c.x, c.z), Math.min(1, 160 / (d + 40)));
      }
      if (t >= 1) (c.state = 'cruise'), (c.timer = rnd(30, 70)), (c.crashed = false), (c.roll = 0);
      return;
    }
    c.y += (ty - c.y) * Math.min(1, dt * 0.5);
    c.pitch += (pitch - c.pitch) * Math.min(1, dt);
  }

  // A whale's blow: a tall bushy column of mist from its blowhole, drifting off on the wind.
  #spout(c, level, ctx) {
    c.spout?.dispose();
    c.spout = new Puffs(this.scene, 24, () => {
      const a = rnd(0, TAU), w = rnd(0.86, 0.97);
      return { offset: [Math.cos(a) * 0.3, rnd(0, 1), Math.sin(a) * 0.3], velocity: [rnd(-0.6, 0.6), rnd(4, 7), rnd(-0.6, 0.6)], period: rnd(2.2, 3.2), phase: 0, from: rnd(0.5, 0.9), to: rnd(2.2, 3.4), colour: new Color(w, w, w), glow: 0 };
    }, { opacity: 0.55 });
    c.spout.uniforms.uCentre.value.set(c.x + Math.sin(c.heading) * c.size * 0.3, level + 0.5, c.z + Math.cos(c.heading) * c.size * 0.3);
    c.spoutAt = ctx.time;
    const d = Math.hypot(c.x - ctx.eye.x, c.z - ctx.eye.z);
    if (d < 400) ctx.sound?.call('whoosh', ctx.pan(c.x, c.z), Math.min(0.7, 60 / (d + 20)));
  }

  /**
   * The Deep Coil: it circles under you, a long shadow down in the dark
   * water; rises and strikes, its jaws wide; sinks back and circles again.
   * Out of the water (in a boat), it rears up beside you to strike.
   */
  #serpent(c, dt, ctx) {
    if (!c.alive) {
      // (Sinking away into the dark of the trench.)
      c.y -= dt * 1.2;
      this.#coil(c);
      return;
    }
    const e = ctx.eye, s = this.#sea(c.x, c.z, ctx, 20), level = s?.level ?? c.y + 20;
    const feet = e.y - 1.6, dx = e.x - c.x, dz = e.z - c.z, d = Math.hypot(dx, dz), toYou = Math.atan2(dx, dz);
    c.timer -= dt;
    c.cool = Math.max(0, c.cool - dt);
    let tx = c.x, ty = c.y, tz = c.z, speed = 6;
    if (ctx.alive === false || (!ctx.swimming && !ctx.boat)) c.state = 'circle';
    if (c.state === 'circle') {
      // Round you, well down, slowly closing.
      const a = (c.orbit = (c.orbit ?? Math.atan2(-dx, -dz)) + dt * 0.25);
      tx = e.x + Math.sin(a) * 22;
      tz = e.z + Math.cos(a) * 22;
      ty = Math.min(level - 10, feet - 10);
      speed = 7;
      if (c.timer <= 0 && ctx.alive !== false && (ctx.swimming || ctx.boat)) (c.state = 'strike'), (c.timer = 5);
    } else if (c.state === 'strike') {
      // Up at you, fast, the jaws open.
      tx = e.x;
      tz = e.z;
      ty = ctx.boat ? level + 1.5 : feet;
      speed = 14;
      if (Math.hypot(d, feet - c.y) < 3.2 && c.cool <= 0) {
        ctx.hurt?.(SERPENT.bite);
        ctx.bleed?.();
        c.cool = 3;
        c.state = 'retreat';
        c.timer = rnd(3, 5);
        ctx.sound?.call('roar', ctx.pan(c.x, c.z), 1);
        ctx.splash?.(c.x, level, c.z, 3);
      } else if (c.timer <= 0) (c.state = 'retreat'), (c.timer = 3);
    } else {
      // Back down and away, then round again.
      tx = c.x - Math.sin(toYou) * 20;
      tz = c.z - Math.cos(toYou) * 20;
      ty = level - 18;
      speed = 9;
      if (c.timer <= 0) (c.state = 'circle'), (c.timer = rnd(7, 12));
    }
    this.#steer(c, Math.atan2(tx - c.x, tz - c.z), 1.6, dt);
    c.speed += (speed - c.speed) * Math.min(1, dt * 2);
    c.x += Math.sin(c.heading) * c.speed * dt;
    c.z += Math.cos(c.heading) * c.speed * dt;
    const bed = ctx.ground(c.x, c.z);
    ty = Math.max(Number.isFinite(bed) ? bed + 2 : -Infinity, ty);
    const vy = Math.max(-6, Math.min(6, (ty - c.y) * 1.2));
    c.y += vy * dt;
    c.pitch = Math.atan2(vy, Math.max(1, c.speed));
    // (Breaking the surface: a heave of water.)
    const up = c.y > level - 0.5;
    if (up !== !!c.up) (c.up = up), ctx.splash?.(c.x, level, c.z, 2);
    this.#coil(c);
  }

  // Its body following the way its head has gone: the trail of where it's been.
  #coil(c) {
    const last = c.trail[0];
    if (Math.hypot(c.x - last[0], c.y - last[1], c.z - last[2]) > 0.35) {
      c.trail.pop();
      c.trail.unshift([c.x, c.y, c.z]);
    } else last[1] = c.y;
  }

  // Dead in the water: a dolphin or whale afloat on its side, belly up, rising
  // and falling with the swell, drifting downwind; waterlogged in time, sinking.
  #floatDead(c, dt, ctx) {
    c.dead += dt;
    if (c.kind === 'serpent') return;
    const w = ctx.waterAt(c.x, c.z), level = w?.level ?? c.y;
    const sink = Math.max(0, (c.dead - 240) / 200), bed = ctx.ground(c.x, c.z);
    const L = c.kind === 'whale' ? c.size : 2.4 * c.size;
    const float = level - L * 0.04 + Math.sin(ctx.time * 0.9 + c.phase) * 0.12;
    const target = Number.isFinite(bed) ? float + (bed + L * 0.05 - float) * Math.min(1, sink) : float;
    c.y += (target - c.y) * Math.min(1, dt * 0.8);
    c.roll += (Math.PI * 0.85 * (c.side ??= Math.random() < 0.5 ? 1 : -1) - c.roll) * Math.min(1, dt * 0.6);
    c.pitch += (Math.sin(ctx.time * 0.7 + c.phase) * 0.05 - c.pitch) * Math.min(1, dt);
    if (sink < 0.5 && ctx.wind) {
      const nx = c.x + ctx.wind.x * 0.25 * dt, nz = c.z + ctx.wind.y * 0.25 * dt;
      if (ctx.waterAt(nx, nz)) (c.x = nx), (c.z = nz);
    }
  }

  #draw(c) {
    const g = c.group;
    if (c.kind === 'serpent') {
      // The head where it is, facing along its way; each ring along the trail behind.
      g.position.set(c.x, c.y, c.z);
      g.rotation.set(0, c.heading, 0, 'YXZ');
      g.rotateX(-c.pitch);
      if (!c.alive) g.rotation.z = Math.min(2.6, c.dead * 0.8);
      const every = 4;
      c.rings.forEach((r, k) => {
        const p = c.trail[Math.min(c.trail.length - 1, (k + 1) * every)], q = c.trail[Math.min(c.trail.length - 1, (k + 1) * every - 2)];
        r.position.set(p[0], p[1] + Math.sin(k * 0.6 + c.phase) * 0.15, p[2]);
        r.lookAt(q[0], q[1], q[2]);
      });
      return;
    }
    const L = c.kind === 'whale' ? c.size : c.size;
    g.position.set(c.x, c.y, c.z);
    g.scale.setScalar(L);
    g.rotation.set(0, 0, 0);
    g.rotation.order = 'YXZ';
    g.rotation.y = c.heading;
    g.rotation.x = -c.pitch;
    g.rotation.z = c.roll;
  }

  /** A blow or a shot along a ray: { distance, point, animal, spider: true, sea: true } or null. */
  aim(origin, dir, max = 150) {
    let best = null;
    const test = (c, x, y, z, r) => {
      const ox = x - origin.x, oy = y - origin.y, oz = z - origin.z;
      const t = ox * dir.x + oy * dir.y + oz * dir.z;
      const d2 = ox * ox + oy * oy + oz * oz - t * t;
      if (t < -r || d2 > r * r) return;
      const hit = Math.max(0, t - Math.sqrt(r * r - d2));
      if (hit <= max && (!best || hit < best.distance)) best = { distance: hit, point: origin.clone().addScaledVector(dir, hit), animal: c, spider: true, sea: true, head: false };
    };
    for (const c of this.list) {
      if (!c.alive || Math.hypot(c.x - origin.x, c.z - origin.z) > max + 30) continue;
      if (c.kind === 'serpent') {
        test(c, c.x, c.y, c.z, 1.3);
        for (let k = 0; k < c.rings.length; k += 2) {
          const r = c.rings[k];
          test(c, r.position.x, r.position.y, r.position.z, 0.75 * r.scale.x);
        }
        continue;
      }
      const L = c.kind === 'whale' ? c.size : 2.4 * c.size, fx = Math.sin(c.heading), fz = Math.cos(c.heading);
      for (const f of [-0.35, 0, 0.35]) test(c, c.x + fx * f * L, c.y, c.z + fz * f * L, (c.kind === 'whale' ? 0.13 : 0.24) * L);
    }
    return best;
  }

  /**
   * Struck (`sharp`: how keen): returns 'dead' or 'hurt'. Hard to kill: a
   * dolphin takes many blows, a whale a great many; hurt, they flee.
   */
  wound(c, sharp = 1) {
    c.health -= 20 * sharp;
    if (c.kind === 'dolphin') {
      // (The whole pod away.)
      for (const o of this.list) if (o.pod === c.pod) (o.fear = 25), (o.fleeTo = Math.atan2(o.x - (c.x - Math.sin(c.heading) * 5), o.z - (c.z - Math.cos(c.heading) * 5)) + rnd(-0.4, 0.4));
    } else if (c.kind === 'whale') {
      c.fear = 60;
      if (c.state === 'surface') (c.state = 'sound'), (c.timer = 5);
    } else if (c.state === 'circle') (c.state = 'strike'), (c.timer = 4);
    if (c.health > 0) return 'hurt';
    c.alive = false;
    c.dead = 0;
    c.leap = undefined;
    this.onKill?.(c);
    return 'dead';
  }

  /** Testing: one of them here. */
  spawn(kind, x, y, z) {
    if (kind === 'serpent') return this.#make('serpent', x, y, z, { health: SERPENT.health, maxHealth: SERPENT.health, boss: SERPENT, key: 'serpent@test', state: 'circle', timer: 8, cool: 0, size: 1 });
    if (kind === 'whale') return this.#make('whale', x, y, z, { health: 4200, size: 15, state: 'surface', timer: 20, blow: 0 });
    const pod = { x, z, heading: 0 };
    return this.#make('dolphin', x, y, z, { pod, health: 420, size: 1, heading: 0, slot: [0, 0] });
  }
}
