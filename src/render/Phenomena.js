import { Color, CylinderGeometry, DoubleSide, Mesh, ShaderMaterial, Vector3 } from 'three';
import { Puffs } from './Puffs.js';
import { cloudShadowUniforms } from './cloudShadow.js';

const rnd = (a, b) => a + Math.random() * (b - a);
function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

const FLAMES = [new Color(1, 0.55, 0.12), new Color(1, 0.78, 0.25), new Color(0.95, 0.3, 0.06)];
const SMOKE = new Color(0.26, 0.25, 0.24);
const REGROW = 1200; // seconds for burnt ground to green over again

/**
 * Wildfires: now and then lightning strikes something that will burn and
 * a fire starts, spreading out over the best part of a minute, flames licking up
 * and a column of smoke leaning with the wind, crackling, until it burns
 * itself out (sooner in the rain). It leaves the ground black, which
 * greens over again in a while (see cloudShadow's uBurns).
 */
export class Wildfires {
  constructor(scene) {
    this.scene = scene;
    this.fires = [];
    this.burns = []; // { x, z, r, amount, age }
  }

  /** A fire at (x, y, z) (where lightning struck, and it caught). */
  ignite(x, y, z, ground) {
    if (this.fires.length >= 3) return;
    const R = rnd(10, 16);
    const flames = new Puffs(this.scene, 64, () => {
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * R;
      const ox = Math.cos(a) * d, oz = Math.sin(a) * d;
      return { offset: [ox, ground(x + ox, z + oz) - y + 0.2, oz], velocity: [0, rnd(2, 3.5), 0], period: rnd(0.8, 1.4), phase: Math.random(), from: rnd(1.1, 2), to: 0.2, colour: FLAMES[Math.floor(Math.random() * 3)], glow: 1 };
    }, { opacity: 0.9 });
    const smoke = new Puffs(this.scene, 30, () => {
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * R * 0.7;
      const ox = Math.cos(a) * d, oz = Math.sin(a) * d;
      return { offset: [ox, ground(x + ox, z + oz) - y + 1.5, oz], velocity: [0, rnd(3, 5), 0], period: rnd(8, 13), phase: Math.random(), from: rnd(1.5, 3), to: rnd(9, 15), colour: SMOKE.clone().multiplyScalar(rnd(0.8, 1.4)), glow: 0 };
    }, { opacity: 0.5 });
    for (const p of [flames, smoke]) p.uniforms.uCentre.value.set(x, y, z);
    const burn = { x, z, r: 0, amount: 0, age: 0, R };
    this.burns.push(burn);
    if (this.burns.length > 8) this.burns.shift();
    this.fires.push({ x, y, z, R, age: 0, life: rnd(80, 150), flames, smoke, burn, crackle: 0 });
  }

  /** @param ctx { time, wind: { x, z } (m/s), rain (0..1), light (Color), night (0..1), camera, sound, pan(x, z) } */
  update(dt, ctx) {
    for (const f of this.fires) {
      // (Rain puts it out the sooner.)
      f.age += dt * (1 + 3 * ctx.rain);
      const grow = Math.min(1, f.age / 40);
      const dying = 1 - smoothstep(f.life - 25, f.life, f.age);
      const reveal = 4 + (f.R - 4) * grow;
      for (const p of [f.flames, f.smoke]) {
        const u = p.uniforms;
        u.uTime.value = ctx.time;
        u.uReveal.value = p === f.smoke ? 1e6 : reveal;
        u.uAmount.value = Math.min(1, f.age / 3) * dying;
        u.uLight.value.copy(ctx.light);
        u.uGlow.value = 1 + 1.5 * ctx.night;
      }
      f.smoke.uniforms.uWind.value.set(ctx.wind.x * 0.8, 0, ctx.wind.z * 0.8);
      f.flames.uniforms.uWind.value.set(ctx.wind.x * 0.15, 0, ctx.wind.z * 0.15);
      f.burn.r = reveal * 1.15;
      f.burn.amount = Math.max(f.burn.amount, Math.min(1, f.age / 15));
      // Crackling, near it.
      const d = Math.hypot(f.x - ctx.camera.position.x, f.z - ctx.camera.position.z);
      f.crackle -= dt;
      if (d < 70 && f.crackle <= 0 && dying > 0.2) {
        f.crackle = rnd(0.6, 1.4);
        ctx.sound?.call('crackle', ctx.pan(f.x, f.z), (1 - d / 70) * dying);
      }
      if (f.age >= f.life) {
        f.flames.dispose();
        f.smoke.dispose();
        f.done = true;
      }
    }
    this.fires = this.fires.filter((f) => !f.done);
    // The scars green over.
    for (const b of this.burns) {
      if (this.fires.some((f) => f.burn === b)) continue;
      b.amount = Math.max(0, b.amount - dt / REGROW);
    }
    this.burns = this.burns.filter((b) => b.amount > 0 || this.fires.some((f) => f.burn === b));
    cloudShadowUniforms.uBurns.value.forEach((v, k) => {
      const b = this.burns[k];
      if (b) v.set(b.x, b.z, b.r, b.amount);
      else v.set(0, 0, 0, 0);
    });
  }

  clear() {
    for (const f of this.fires) (f.flames.dispose(), f.smoke.dispose());
    this.fires = [];
    this.burns = [];
  }
}

/**
 * Volcanoes that are awake (those with lava in their craters): a plume of
 * grey smoke rising from the crater and leaning away on the wind, seen
 * from far off; at night glowing ash flung up out of it; and now and then
 * a deep rumble when you're near, the ground trembling.
 */
export class Volcanoes {
  constructor(scene) {
    this.scene = scene;
    this.active = new Map(); // key -> { plume, ash, c, rim }
    this.wait = 0;
    this.shake = 0;
    this.rumbleWait = rnd(10, 30);
  }

  /** @param ctx { time, camera, generator, wind: { x, z }, light (Color), night (0..1), sound, pan(x, z) } */
  update(dt, ctx) {
    const cam = ctx.camera.position;
    this.wait -= dt;
    if (this.wait <= 0 && ctx.generator) {
      this.wait = 3;
      const near = ctx.generator.volcanoes(cam.x - 3000, cam.z - 3000, cam.x + 3000, cam.z + 3000)
        .filter((c) => c.lava)
        .sort((a, b) => Math.hypot(a.x - cam.x, a.z - cam.z) - Math.hypot(b.x - cam.x, b.z - cam.z))
        .slice(0, 3);
      const keep = new Set();
      for (const c of near) {
        const key = `${Math.round(c.x)},${Math.round(c.z)}`;
        keep.add(key);
        if (this.active.has(key)) continue;
        const rim = ctx.generator.getBaseHeight(c.x + c.rc * 1.05, c.z);
        const plume = new Puffs(this.scene, 60, () => {
          const a = Math.random() * Math.PI * 2, d = Math.random() * c.rc * 0.5;
          const grey = rnd(0.42, 0.62);
          return { offset: [Math.cos(a) * d, -rnd(0, 10), Math.sin(a) * d], velocity: [0, rnd(6, 10), 0], period: rnd(22, 30), phase: Math.random(), from: rnd(10, 18), to: rnd(45, 70), colour: new Color(grey, grey * 0.98, grey * 0.96), glow: 0 };
        }, { opacity: 0.55 });
        const ash = new Puffs(this.scene, 50, () => {
          const a = Math.random() * Math.PI * 2, out = rnd(0, 7);
          return { offset: [rnd(-1, 1) * c.rc * 0.2, -5, rnd(-1, 1) * c.rc * 0.2], velocity: [Math.cos(a) * out, rnd(18, 30), Math.sin(a) * out], period: rnd(3, 5), phase: Math.random(), from: rnd(1, 2), to: 0.3, colour: FLAMES[Math.floor(Math.random() * 3)], glow: 1 };
        }, { opacity: 0.95 });
        for (const p of [plume, ash]) p.uniforms.uCentre.value.set(c.x, rim, c.z);
        this.active.set(key, { plume, ash, c });
      }
      for (const [key, v] of this.active) {
        if (keep.has(key)) continue;
        v.plume.dispose();
        v.ash.dispose();
        this.active.delete(key);
      }
    }
    let nearest = Infinity;
    for (const { plume, ash, c } of this.active.values()) {
      plume.uniforms.uTime.value = ash.uniforms.uTime.value = ctx.time;
      plume.uniforms.uWind.value.set(ctx.wind.x * 1.4, 0, ctx.wind.z * 1.4);
      plume.uniforms.uLight.value.copy(ctx.light);
      ash.uniforms.uAmount.value = smoothstep(0.2, 0.7, ctx.night);
      ash.uniforms.uGlow.value = 1.5;
      nearest = Math.min(nearest, Math.hypot(c.x - cam.x, c.z - cam.z));
    }
    // A rumble now and then when you're near one; the ground trembles.
    this.shake = Math.max(0, this.shake - dt / 2.5);
    this.rumbleWait -= dt;
    if (nearest < 1600 && this.rumbleWait <= 0) {
      this.rumbleWait = rnd(25, 70);
      const near = 1 - nearest / 1600;
      ctx.sound?.call('rumble', 0, 0.3 + 0.7 * near);
      this.shake = near;
    }
  }

  clear() {
    for (const v of this.active.values()) (v.plume.dispose(), v.ash.dispose());
    this.active.clear();
  }
}

const wallVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;
const wallFragment = /* glsl */ `
  uniform vec3 colour;
  uniform float opacity;
  uniform float time;
  varying vec2 vUv;
  varying vec3 vWorld;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  void main() {
    // A towering wall of dust, billowing along its top, thinning at its ends.
    float x = vUv.x * 40.0;
    float billow = noise(vec2(x * 0.6, time * 0.15)) * 0.6 + noise(vec2(x * 1.7, time * 0.3 + 4.0)) * 0.4;
    float top = 0.55 + 0.4 * billow;
    float body = 1.0 - smoothstep(top - 0.2, top, vUv.y);
    float ends = smoothstep(0.0, 0.18, vUv.x) * (1.0 - smoothstep(0.82, 1.0, vUv.x));
    float streaks = 0.75 + 0.25 * noise(vec2(x * 3.0 - time * 1.5, vUv.y * 6.0));
    float shade = 0.7 + 0.3 * vUv.y;
    gl_FragColor = vec4(colour * shade * streaks, opacity * body * ends);
    #include <colorspace_fragment>
  }`;

/**
 * Sandstorms, in the deserts: now and then a towering brown wall of dust
 * rolls in from upwind, blots out the sun when it arrives and fills the
 * air with blowing sand for a minute or two, then moves on. `amount` (how
 * deep in it you are, 0..1) is for the fog and the light (see main).
 */
export class Sandstorm {
  constructor(scene, Rain) {
    this.state = 'idle';
    this.wait = rnd(30, 90);
    this.amount = 0;
    this.distance = 0;
    this.material = new ShaderMaterial({
      uniforms: { colour: { value: new Color(0xb89a6a) }, opacity: { value: 0 }, time: { value: 0 } },
      vertexShader: wallVertex,
      fragmentShader: wallFragment,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      fog: false,
    });
    this.wall = new Mesh(new CylinderGeometry(1, 1, 1, 64, 1, true, -1.0, 2.0).translate(0, 0.5, 0), this.material);
    this.wall.frustumCulled = false;
    this.wall.visible = false;
    this.wall.renderOrder = 2;
    scene.add(this.wall);
    this.sand = new Rain(scene); // (blowing sand: the rain's streaks, driven sideways)
    this.from = new Vector3();
  }

  /** Start one now (for testing). */
  start() {
    this.state = 'coming';
    this.distance = 1500;
  }

  /**
   * @param ctx { time, camera, desert (0..1, here), rain, wind: { x, z }, light (Color), ground }
   */
  update(dt, ctx) {
    const cam = ctx.camera.position;
    const w = Math.hypot(ctx.wind.x, ctx.wind.z) || 1;
    const ux = ctx.wind.x / w, uz = ctx.wind.z / w; // (downwind)
    if (this.state === 'idle') {
      this.wait -= dt;
      if (this.wait <= 0) {
        this.wait = rnd(60, 150);
        if (ctx.desert > 0.6 && ctx.rain < 0.05 && Math.random() < 0.25) this.start();
      }
    } else if (this.state === 'coming') {
      this.distance -= 32 * dt;
      if (this.distance <= 0 || ctx.desert < 0.3) (this.state = 'in'), (this.until = rnd(60, 120));
    } else if (this.state === 'in') {
      this.until -= dt;
      this.amount = Math.min(1, this.amount + dt / 8);
      if (this.until <= 0 || ctx.desert < 0.2) (this.state = 'going'), (this.distance = 0);
    } else if (this.state === 'going') {
      this.amount = Math.max(0, this.amount - dt / 20);
      this.distance -= 32 * dt; // (off downwind, away from you)
      if (this.amount <= 0 && this.distance < -1500) this.state = 'idle';
    }
    // The wall: an arc of dust upwind as it comes, downwind as it goes.
    const showing = this.state === 'coming' || (this.state === 'going' && this.amount < 0.6);
    this.wall.visible = showing;
    if (showing) {
      const d = Math.max(60, Math.abs(this.distance));
      const toward = this.distance > 0 ? -1 : 1; // (upwind, or downwind)
      this.wall.position.set(cam.x, ctx.ground(cam.x, cam.z) - 30, cam.z);
      this.wall.scale.set(d, 230, d);
      // (Its arc centred on the way it lies from you.)
      this.wall.rotation.y = Math.atan2(ux * toward, uz * toward);
      const u = this.material.uniforms;
      u.time.value = ctx.time;
      u.opacity.value = 0.92 * smoothstep(60, 250, Math.abs(this.distance)) * (this.state === 'going' ? 1 - this.amount / 0.6 : 1);
      u.colour.value.set(0xb89a6a).multiply(ctx.light);
    }
    // Blowing sand.
    this.sand.update(ctx.time, cam, this.amount, ctx.wind, 1, ctx.light);
    if (this.amount > 0.01) {
      this.sand.uniforms.fall.value.set(ux * 24, -1.5, uz * 24);
      this.sand.uniforms.colour.value.set(0xc8a878).multiply(ctx.light);
    }
  }
}
