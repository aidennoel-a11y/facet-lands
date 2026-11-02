import { BufferAttribute, BufferGeometry, Color, DoubleSide, Mesh, MeshPhongMaterial } from 'three';

/**
 * Flash floods in the dry country. A storm over the desert, the badlands or
 * the dry savanna: the ground can't take the rain, and down the nearest dry
 * wash (the low line the water would run along) a wall of brown water comes,
 * a roar first, then the front churning white, filling the wash bank to bank
 * and spreading over the low ground either side, rolling with waves as the
 * sea does; then, over a minute or two, it drains away.
 *
 * Its water is real water: you're swept along in it, and it can drown you.
 */
const W = 13; // across the wash, vertices
const STEP = 4; // metres between cross-sections along it
const SPAN = 26; // metres across

export class FlashFloods {
  constructor(scene) {
    this.scene = scene;
    this.flood = null;
    this.cool = 60;
    this.material = new MeshPhongMaterial({ vertexColors: true, transparent: true, opacity: 0.92, side: DoubleSide, shininess: 30, specular: 0x403020 });
    this.uniforms = { uTime: { value: 0 } };
    this.material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.uniforms.uTime;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nattribute vec3 aFlow;\nvarying float vFoam;\nvarying vec2 vFloodAt;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          // (Rolling waves down the wash, choppy where it's deep and fast; the front heaped and churning.)
          float s = aFlow.x, d = aFlow.y, front = aFlow.z;
          float wave = sin(s * 0.55 - uTime * 4.2) * 0.22 + sin(s * 1.3 - uTime * 6.0 + position.x * 0.7) * 0.1 + sin(position.z * 0.9 + uTime * 3.1) * 0.06;
          transformed.y += wave * min(1.0, d) + front * 0.6;
          vFoam = clamp(front * 1.6 + smoothstep(0.35, 0.0, d) * 0.5, 0.0, 1.0);
          vFloodAt = vec2(s, position.x + position.z);`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying float vFoam;\nvarying vec2 vFloodAt;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          float churn = 0.5 + 0.5 * sin(vFloodAt.x * 2.1 - uTime * 7.0 + sin(vFloodAt.y * 1.7) * 2.0);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.8, 0.68), vFoam * (0.5 + 0.5 * churn));`);
    };
    this.material.customProgramCacheKey = () => 'flash flood';
  }

  /**
   * ctx: { eye, arid (0..1 how dry the country here is), storm (0..1), rain (0..1),
   *   height(x, z), sound, flash(text), sheltered }
   */
  update(dt, ctx) {
    this.uniforms.uTime.value += dt;
    this.cool -= dt;
    if (!this.flood && this.cool <= 0 && !ctx.sheltered && ctx.arid > 0.55 && ctx.rain > 0.55 && ctx.storm > 0.4) {
      this.cool = 240 + Math.random() * 240;
      if (Math.random() < 0.6) this.#start(ctx);
    }
    const f = this.flood;
    if (!f) return;
    f.t += dt;
    // The roar first, then the water.
    if (!f.warned && f.t > 0) {
      f.warned = true;
      ctx.sound?.call('rumble', 0, 0.8);
      ctx.flash?.('A roar from up the wash: a flash flood is coming! Get to high ground');
    }
    const arrive = Math.max(0, f.t - 8) * 7; // (the front, coming down the wash at 7 m/s)
    const fall = Math.max(0, f.t - 75) / 60; // (draining away after a minute and more)
    if (fall >= 1) return this.#end();
    if ((f.roar = (f.roar ?? 0) - dt) <= 0 && arrive > 0) {
      f.roar = 0.7 + Math.random() * 0.8;
      const k = Math.min(f.path.length - 1, Math.floor(arrive / STEP)), p = f.path[k], d = Math.hypot(p.x - ctx.eye.x, p.z - ctx.eye.z);
      if (d < 120) ctx.sound?.call(fall > 0 ? 'splash' : 'bigsplash', 0, Math.min(0.9, 30 / (d + 15)));
    }
    // Each cross-section's water: as high as the front has brought it, filling the low ground.
    const pos = f.geometry.attributes.position, flow = f.geometry.attributes.aFlow, col = f.geometry.attributes.color;
    for (let k = 0; k < f.path.length; k++) {
      const s = k * STEP, ahead = arrive - s;
      const fill = ahead <= 0 ? 0 : Math.min(1, ahead / 18) * (1 - fall);
      const depth = f.depth * fill;
      const level = f.path[k].low + depth;
      f.levels[k] = depth > 0.05 ? level : -Infinity;
      const isFront = ahead > 0 && ahead < 14 ? 1 - ahead / 14 : 0;
      for (let j = 0; j < W; j++) {
        const v = k * W + j, g = f.ground[v];
        // (Under the ground where it hasn't reached: hidden.)
        pos.setY(v, depth > 0.05 ? Math.max(level, g - 0.4) : g - 0.5);
        flow.setXYZ(v, s, Math.max(0, level - g), isFront * (depth > 0.05 ? 1 : 0));
        const mud = Math.min(1, Math.max(0, level - g) / 1.5);
        col.setXYZ(v, 0.5 - 0.12 * mud, 0.38 - 0.1 * mud, 0.24 - 0.06 * mud);
      }
    }
    pos.needsUpdate = flow.needsUpdate = col.needsUpdate = true;
    f.geometry.computeVertexNormals();
  }

  /** The flood's water at (x, z), or null: { level, fx, fz, speed }. */
  waterAt(x, z) {
    const f = this.flood;
    if (!f) return null;
    let best = null, bd = Infinity;
    for (let k = 0; k < f.path.length; k++) {
      const p = f.path[k], d = Math.hypot(x - p.x, z - p.z);
      if (d < bd) (bd = d), (best = k);
    }
    if (best === null || bd > SPAN / 2 || !(f.levels[best] > -Infinity)) return null;
    const p = f.path[best];
    return { level: f.levels[best], fx: p.fx, fz: p.fz, speed: 3.5, flood: true };
  }

  // A wash: from a little way up the land round you, down its steepest way (the way the water will go).
  #start(ctx) {
    const e = ctx.eye;
    let top = null;
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2, x = e.x + Math.cos(a) * 140, z = e.z + Math.sin(a) * 140, h = ctx.height(x, z);
      if (!top || h > top.h) top = { x, z, h };
    }
    if (!top) return;
    const path = [];
    let x = top.x, z = top.z, px = 0, pz = 0;
    for (let n = 0; n < 90; n++) {
      // (The lowest way on, not doubling back.)
      let best = null;
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a);
        if (n && dx * px + dz * pz < 0.2) continue;
        const h = ctx.height(x + dx * STEP, z + dz * STEP);
        if (!best || h < best.h) best = { h, dx, dz };
      }
      if (!best) break;
      (px = best.dx), (pz = best.dz);
      x += best.dx * STEP;
      z += best.dz * STEP;
      path.push({ x, z, fx: best.dx, fz: best.dz });
    }
    if (path.length < 20) return;
    // The cross-sections, square to the wash.
    const ground = new Float32Array(path.length * W), positions = new Float32Array(path.length * W * 3);
    for (let k = 0; k < path.length; k++) {
      const p = path[k], ax = -p.fz, az = p.fx;
      let low = Infinity;
      for (let j = 0; j < W; j++) {
        const o = (j / (W - 1) - 0.5) * SPAN, wx = p.x + ax * o, wz = p.z + az * o, g = ctx.height(wx, wz);
        ground[k * W + j] = g;
        positions.set([wx, g - 0.5, wz], (k * W + j) * 3);
        if (Math.abs(o) < SPAN * 0.2) low = Math.min(low, g);
      }
      p.low = low;
    }
    const index = [];
    for (let k = 0; k < path.length - 1; k++) for (let j = 0; j < W - 1; j++) {
      const a = k * W + j, b = a + 1, c = a + W, d = c + 1;
      index.push(a, c, b, b, c, d);
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setAttribute('aFlow', new BufferAttribute(new Float32Array(path.length * W * 3), 3));
    geometry.setAttribute('color', new BufferAttribute(new Float32Array(path.length * W * 3), 3));
    geometry.setIndex(index);
    const mesh = new Mesh(geometry, this.material);
    mesh.frustumCulled = false;
    mesh.name = 'flash flood';
    this.scene.add(mesh);
    this.flood = { path, ground, geometry, mesh, levels: new Float32Array(path.length).fill(-Infinity), t: -Math.random() * 20, depth: 1.6 + Math.random() * 1.2 };
  }

  #end() {
    const f = this.flood;
    this.scene.remove(f.mesh);
    f.geometry.dispose();
    this.flood = null;
  }

  /** For testing: a flood down the nearest wash now. */
  test(ctx) {
    if (this.flood) this.#end();
    this.#start(ctx);
    if (this.flood) this.flood.t = 0;
  }
}
