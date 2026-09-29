import { Color, CylinderGeometry, DoubleSide, IcosahedronGeometry, InstancedBufferAttribute, InstancedMesh, Matrix4, Mesh, ShaderMaterial, UniformsLib, UniformsUtils, Vector3 } from 'three';
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
  uniform vec3 haze;
  uniform float hazeAmount;
  uniform float opacity;
  uniform float time;
  uniform float seed;
  varying vec2 vUv;
  varying vec3 vWorld;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 7.1; a *= 0.5; }
    return v;
  }
  void main() {
    // A haboob: a towering bank of dust, its top heaped in great rounded
    // heads rolling up and over, dense and dark at its foot, the heads lit
    // pale; hazed with distance like any far thing.
    float x = vUv.x * 55.0 + seed * 31.0;
    float heads = fbm(vec2(x * 0.16, time * 0.025 + seed));
    float top = 0.35 + 0.55 * heads;
    vec2 q = vec2(x * 0.3, vUv.y * 11.0 - time * 0.12);
    float puffs = fbm(q + 1.7 * fbm(q * 0.6 + vec2(time * 0.02, seed)));
    // (Round-edged, puffy, not a hard line.)
    float edge = top - vUv.y + (puffs - 0.5) * 0.22;
    float body = smoothstep(-0.01, 0.1, edge);
    float ends = smoothstep(0.0, 0.22, vUv.x) * (1.0 - smoothstep(0.78, 1.0, vUv.x));
    // Light: on the upper faces of the heads, shadowed in their folds and at the foot.
    float lit = smoothstep(0.0, 0.18, 0.18 - edge) ;
    float shade = (0.5 + 0.45 * puffs) * (0.7 + 0.3 * smoothstep(0.0, 0.8, vUv.y)) + 0.35 * lit;
    vec3 c = mix(colour * shade, haze, hazeAmount);
    gl_FragColor = vec4(c, opacity * body * ends * (0.8 + 0.2 * puffs));
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
    // (Two banks, one a little behind the other, for depth.)
    const geometry = new CylinderGeometry(1, 1, 1, 96, 1, true, -1.1, 2.2).translate(0, 0.5, 0);
    this.walls = [0, 1].map((k) => {
      const material = new ShaderMaterial({
        uniforms: { colour: { value: new Color(0xb89a6a) }, haze: { value: new Color() }, hazeAmount: { value: 0 }, opacity: { value: 0 }, time: { value: 0 }, seed: { value: k * 3.7 + 1 } },
        vertexShader: wallVertex,
        fragmentShader: wallFragment,
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        fog: false,
      });
      const wall = new Mesh(geometry, material);
      wall.frustumCulled = false;
      wall.visible = false;
      wall.renderOrder = 2 - k;
      scene.add(wall);
      return wall;
    });
    this.wall = this.walls[0];
    this.material = this.walls[0].material;
    this.sand = new Rain(scene); // (blowing sand: the rain's streaks, driven sideways)
    this.from = new Vector3();
  }

  /** Start one now: `forced` (for testing) blows in wherever you are, and closer. */
  start(forced = false) {
    this.state = 'coming';
    this.distance = forced ? 700 : 1500;
    this.forced = forced;
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
      if (this.distance <= 0 || (ctx.desert < 0.3 && !this.forced)) (this.state = 'in'), (this.until = rnd(60, 120));
    } else if (this.state === 'in') {
      this.until -= dt;
      this.amount = Math.min(1, this.amount + dt / 8);
      if (this.until <= 0 || (ctx.desert < 0.2 && !this.forced)) (this.state = 'going'), (this.forced = false), (this.distance = 0);
    } else if (this.state === 'going') {
      this.amount = Math.max(0, this.amount - dt / 20);
      this.distance -= 32 * dt; // (off downwind, away from you)
      if (this.amount <= 0 && this.distance < -1500) this.state = 'idle';
    }
    // The wall: an arc of dust upwind as it comes, downwind as it goes.
    const showing = this.state === 'coming' || (this.state === 'going' && this.amount < 0.6);
    this.walls.forEach((wall, k) => {
      wall.visible = showing;
      if (!showing) return;
      const d = Math.max(60, Math.abs(this.distance)) * (1 + k * 0.07);
      const toward = this.distance > 0 ? -1 : 1; // (upwind, or downwind)
      // (Its foot well down, so the land in front hides it; tall, darkening the sky.)
      wall.position.set(cam.x, ctx.ground(cam.x, cam.z) - 80, cam.z);
      wall.scale.set(d, 360 + k * 50, d);
      // (Its arc centred on the way it lies from you.)
      wall.rotation.y = Math.atan2(ux * toward, uz * toward) + k * 0.05;
      const u = wall.material.uniforms;
      u.time.value = ctx.time;
      u.opacity.value = (k ? 0.6 : 0.95) * smoothstep(60, 250, Math.abs(this.distance)) * (this.state === 'going' ? 1 - this.amount / 0.6 : 1);
      u.colour.value.set(k ? 0xa88a5c : 0xb89a6a).multiply(ctx.light);
      if (ctx.fog) u.haze.value.copy(ctx.fog);
      u.hazeAmount.value = ctx.fog ? 0.45 * smoothstep(250, 1600, d) : 0;
    });
    // Blowing sand.
    this.sand.update(ctx.time, cam, this.amount, ctx.wind, 1, ctx.light);
    if (this.amount > 0.01) {
      this.sand.uniforms.fall.value.set(ux * 24, -1.5, uz * 24);
      this.sand.uniforms.colour.value.set(0xc8a878).multiply(ctx.light);
    }
  }
}

/**
 * Dust devils, out on the savanna and in the desert on hot, dry
 * afternoons: a spinning funnel of dust, wider at the top, wandering over
 * the ground on the breeze for half a minute or so, then dying away.
 * `spawn()` sets one going near you (for testing).
 */
export class DustDevils {
  constructor(scene) {
    this.scene = scene;
    this.devils = [];
    this.wait = rnd(15, 40);
    const N = 160;
    const seeds = new Float32Array(N * 4);
    for (let k = 0; k < N; k++) seeds.set([Math.random(), Math.random() * Math.PI * 2, 0.4 + 0.6 * Math.random(), 0.5 + Math.random()], k * 4);
    const geometry = new IcosahedronGeometry(1, 0);
    geometry.setAttribute('aSeed', new InstancedBufferAttribute(seeds, 4));
    this.geometry = geometry;
    this.count = N;
  }

  #make() {
    const uniforms = UniformsUtils.merge([UniformsLib.fog, {
      uTime: { value: 0 }, uCentre: { value: new Vector3() }, uHeight: { value: 30 }, uRadius: { value: 4 }, uAmount: { value: 0 },
      uLight: { value: new Color(1, 1, 1) }, uColour: { value: new Color(0xc4a676) },
    }]);
    const material = new ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      fog: true,
      vertexShader: /* glsl */ `
        attribute vec4 aSeed; // height (0..1) it starts at, angle, how far out, size
        uniform float uTime;
        uniform vec3 uCentre;
        uniform float uHeight;
        uniform float uRadius;
        uniform float uAmount;
        varying float vAlpha;
        varying float vShade;
        #include <fog_pars_vertex>
        void main() {
          // Each speck rises slowly up the funnel, whirling round it: a turn
          // every few seconds low down where it's tight, lazier up where it
          // spreads out, the whirl surging and easing with the gusts. The
          // column sways, its top wandering behind its foot.
          float h = fract(aSeed.x + uTime * 0.05);
          float gust = 1.0 + 0.25 * sin(uTime * 0.6 + aSeed.x * 2.0) + 0.1 * sin(uTime * 1.7);
          float a = aSeed.y + uTime * (1.5 - 0.9 * h) * gust + aSeed.x * 40.0;
          float r = uRadius * (0.25 + 0.9 * h) * aSeed.z * (1.0 + 0.12 * sin(uTime * 0.9 + aSeed.y * 3.0));
          float lean = h * h * 0.25 * uHeight;
          vec2 sway = vec2(cos(uTime * 0.23), sin(uTime * 0.31)) * lean * 0.5;
          vec3 c = uCentre + vec3(cos(a) * r + lean * 0.3 + sway.x, h * uHeight, sin(a) * r + sway.y);
          float size = aSeed.w * (0.5 + 1.6 * h) * step(0.001, uAmount);
          vec4 mvPosition = viewMatrix * vec4(c + position * size, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          vAlpha = sin(3.14159 * h) * uAmount * (1.0 - 0.4 * h);
          vShade = 0.7 + 0.3 * max(normal.y, 0.0);
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColour;
        uniform vec3 uLight;
        varying float vAlpha;
        varying float vShade;
        #include <fog_pars_fragment>
        void main() {
          gl_FragColor = vec4(uColour * uLight * vShade, vAlpha * 0.55);
          #include <fog_fragment>
        }`,
    });
    const mesh = new InstancedMesh(this.geometry, material, this.count);
    for (let k = 0; k < this.count; k++) mesh.setMatrixAt(k, new Matrix4());
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    this.scene.add(mesh);
    return mesh;
  }

  /** One near (x, z) now (`near`: closer, for testing). */
  spawn(x, z, near = false) {
    if (this.devils.length >= 3) this.devils[0].life = Math.min(this.devils[0].life, this.devils[0].age + 6); // (the oldest dies away)
    const a = Math.random() * Math.PI * 2, d = near ? rnd(30, 50) : rnd(60, 160);
    this.devils.push({ x: x + Math.cos(a) * d, z: z + Math.sin(a) * d, age: 0, life: rnd(30, 55), height: rnd(25, 45), radius: rnd(3, 6), turn: Math.random() * Math.PI * 2, mesh: this.#make() });
  }

  /** @param ctx { time, camera, dry (0..1: how much savanna and desert here), hour, rain, winter, wind: { x, z }, light, ground(x, z) } */
  update(dt, ctx) {
    this.wait -= dt;
    if (this.wait <= 0) {
      this.wait = rnd(20, 60);
      const afternoon = ctx.hour > 12 && ctx.hour < 17.5;
      if (afternoon && ctx.dry > 0.5 && ctx.rain < 0.05 && ctx.winter < 0.4 && Math.random() < 0.5) this.spawn(ctx.camera.position.x, ctx.camera.position.z);
    }
    for (const d of this.devils) {
      d.age += dt;
      // Wandering over the ground on the breeze.
      d.turn += (Math.random() - 0.5) * dt * 1.5;
      d.x += (ctx.wind.x * 0.6 + Math.cos(d.turn) * 2.5) * dt;
      d.z += (ctx.wind.z * 0.6 + Math.sin(d.turn) * 2.5) * dt;
      const u = d.mesh.material.uniforms;
      const y = ctx.ground(d.x, d.z);
      u.uCentre.value.set(d.x, Number.isFinite(y) ? y - 0.5 : ctx.camera.position.y - 2, d.z);
      u.uTime.value = ctx.time;
      u.uHeight.value = d.height;
      u.uRadius.value = d.radius;
      u.uAmount.value = Math.min(1, d.age / 4) * (1 - smoothstep(d.life - 6, d.life, d.age));
      u.uLight.value.copy(ctx.light);
      if (d.age >= d.life) {
        this.scene.remove(d.mesh);
        d.mesh.material.dispose();
        d.mesh.dispose();
        d.done = true;
      }
    }
    this.devils = this.devils.filter((d) => !d.done);
  }
}
