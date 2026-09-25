import { Color, Mesh, PlaneGeometry, ShaderMaterial } from 'three';

const MAX = 9;

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

const fragmentShader = /* glsl */ `
  uniform vec3 colour;
  uniform vec3 horizon;
  uniform float opacity;
  uniform float haze;
  uniform float time;
  uniform float seed;
  uniform float flash;
  varying vec2 vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }

  void main() {
    // A shower hanging from the cloud base: ragged at its sides, the rain in
    // it slanting streaks, thinning a little towards the ground.
    float x = vUv.x + 0.06 * sin(vUv.y * 3.0 + seed) + 0.04 * (noise(vec2(vUv.y * 4.0, seed)) - 0.5);
    float sides = smoothstep(0.0, 0.25 + 0.1 * noise(vec2(vUv.y * 3.0, seed + 3.0)), x) * smoothstep(1.0, 0.75 - 0.1 * noise(vec2(vUv.y * 3.0, seed + 7.0)), x);
    float streaks = 0.55 + 0.45 * noise(vec2(x * 60.0 + vUv.y * 6.0, vUv.y * 3.0 + time * 1.4 + seed));
    float body = 0.55 + 0.45 * noise(vec2(x * 5.0 + seed, vUv.y * 1.5 - time * 0.05));
    float fall = smoothstep(0.0, 0.25, vUv.y) * (0.75 + 0.25 * vUv.y);
    float a = opacity * sides * streaks * body * fall * (1.0 - 0.55 * haze);
    vec3 c = mix(colour, horizon, haze * 0.7) + vec3(0.8, 0.85, 1.0) * flash;
    gl_FragColor = vec4(c, a);
    #include <colorspace_fragment>
  }`;

/**
 * Weather you can see coming: showers out on the horizon, grey curtains of
 * rain hanging from the cloud base and drifting with the wind. A few trail
 * under a cloudy sky; before rain sets in more of them gather upwind and
 * come on towards you; in rain they're all around. Before a storm, lightning
 * flickers inside them (see Lightning's far strikes).
 */
export class Showers {
  constructor(scene) {
    this.list = [];
    const geometry = new PlaneGeometry(1, 1).translate(0, 0.5, 0);
    for (let k = 0; k < MAX; k++) {
      const material = new ShaderMaterial({
        uniforms: {
          colour: { value: new Color(0x6f7a88) },
          horizon: { value: new Color() },
          opacity: { value: 0 },
          haze: { value: 0 },
          time: { value: 0 },
          seed: { value: k * 13.7 },
          flash: { value: 0 },
        },
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        fog: false,
      });
      const mesh = new Mesh(geometry, material);
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = 1;
      scene.add(mesh);
      this.list.push({ mesh, x: 0, z: 0, width: 0, fade: 0, on: false });
    }
    this.time = 0;
    this.flash = 0; // a flicker of far lightning, 0..1 (set from outside)
    this.flashAt = null; // { x, z } of it
  }

  /**
   * @param weather  the Weather (cover, rain, approaching)
   * @param wind     { x, z } the clouds' drift, m/s
   * @param horizon  the sky's colour at the horizon
   * @param fog      the scene's fog (near, far)
   */
  update(dt, camera, weather, wind, horizon, fog) {
    this.time += dt;
    const coming = weather.approaching;
    // How showery it is out there.
    const showery = Math.max(smoothstep(0.5, 0.9, weather.cover) * 0.45, coming.rain * 1.3, weather.rain);
    const want = Math.round(MAX * Math.min(1, showery));
    const upwind = Math.atan2(-wind.z, -wind.x);
    const cam = camera.position;
    const top = 235 - 80 * weather.cover;
    const grey = 0.42 + 0.25 * (1 - weather.storm) - 0.12 * coming.storm;
    let on = this.list.filter((s) => s.on).length;
    for (const s of this.list) {
      if (!s.on && on < want) {
        // Out towards the horizon: upwind when rain's on its way.
        const a = (coming.rain > 0 ? upwind : Math.random() * Math.PI * 2) + (Math.random() - 0.5) * (coming.rain > 0 ? 1.6 : 6.28);
        const d = 1300 + Math.random() * 1300;
        s.x = cam.x + Math.cos(a) * d;
        s.z = cam.z + Math.sin(a) * d;
        s.width = 240 + Math.random() * 380;
        s.on = true;
        s.fade = 0;
        on++;
      }
      if (!s.on && s.fade <= 0) {
        s.mesh.visible = false;
        continue;
      }
      s.x += wind.x * dt * 1.2;
      s.z += wind.z * dt * 1.2;
      const dx = s.x - cam.x, dz = s.z - cam.z, dist = Math.hypot(dx, dz);
      // Gone past, or out of sight, or no longer wanted: fade away.
      if (s.on && (dist > 3300 || dist < 600 || on > want)) {
        s.on = false;
        on--;
      }
      s.fade = Math.min(1, Math.max(0, s.fade + (s.on ? dt / 12 : -dt / 8)));
      const m = s.mesh;
      m.visible = s.fade > 0;
      m.position.set(s.x, -10, s.z);
      m.scale.set(s.width, top + 10, 1);
      m.rotation.y = Math.atan2(-dx, -dz);
      const u = m.material.uniforms;
      u.opacity.value = 0.5 * s.fade * smoothstep(600, 900, dist);
      u.haze.value = smoothstep(fog.near, fog.far * 1.3, dist);
      u.horizon.value.copy(horizon);
      u.colour.value.setRGB(grey, grey * 1.04, grey * 1.1);
      u.time.value = this.time;
      u.flash.value = this.flashAt && Math.hypot(this.flashAt.x - s.x, this.flashAt.z - s.z) < s.width ? this.flash : 0;
    }
  }

  /** Where one of the showers stands, for far lightning to strike inside it (or null). */
  pick() {
    const on = this.list.filter((s) => s.on && s.fade > 0.5);
    return on.length ? on[Math.floor(Math.random() * on.length)] : null;
  }
}
