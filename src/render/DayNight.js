import {
  BackSide,
  Color,
  DirectionalLight,
  HemisphereLight,
  Matrix4,
  Mesh,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three';

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// Sky and light palettes (sRGB hex) for the four moods of the day, blended
// by how high the sun is: full day, golden hour (sun low), twilight (sun
// just set: the afterglow) and night. `twilightDull` is the afterglow on an
// evening whose sunset doesn't catch fire.
const PALETTE = {
  day: { top: 0x3f7fd0, horizon: 0xd6e8f7, hemiSky: 0xdcecff, hemiGround: 0x5b4c3a },
  golden: { top: 0x4a72bc, horizon: 0xf6bd78, hemiSky: 0xf7cf9e, hemiGround: 0x5e4432 },
  twilight: { top: 0x223066, horizon: 0xc8665e, hemiSky: 0xb48ab8, hemiGround: 0x3a3044 },
  twilightDull: { top: 0x2a3860, horizon: 0x7a7488, hemiSky: 0x8a8aa8, hemiGround: 0x303040 },
  night: { top: 0x070d22, horizon: 0x1a2748, hemiSky: 0x5b6fa8, hemiGround: 0x202838 },
};
const HEMI_INTENSITY = { day: 1.4, golden: 1.2, twilight: 0.95, night: 0.75 };

// Sunlight: deep orange at the horizon, gold a little higher, near-white by day.
const SUN_STOPS = [
  [-0.03, new Color(0xff5a24)],
  [0.03, new Color(0xff8a3c)],
  [0.12, new Color(0xffbd6e)],
  [0.35, new Color(0xfff1dc)],
];
const MOON = new Color(0x9fb6ff);
// Clouds catching the low sun: gold, then orange-red, pink and purple as it sinks.
const GLOW_STOPS = [
  [0.2, new Color(0xffd9a0)],
  [0.08, new Color(0xffb050)],
  [0.02, new Color(0xff6a30)],
  [-0.04, new Color(0xff4a6a)],
  [-0.09, new Color(0xc0508a)],
  [-0.15, new Color(0x6a4a8a)],
];
const FLASH = new Color(0xdfe8ff);
const GREY = new Color();

const tmp = new Color();

/** Colour along a list of [elevation, colour] stops (either direction). */
function ramp(stops, e, out) {
  const first = stops[0], last = stops[stops.length - 1];
  const up = last[0] > first[0];
  if (up ? e <= first[0] : e >= first[0]) return out.copy(first[1]);
  for (let i = 1; i < stops.length; i++) {
    const [e1, c1] = stops[i];
    if (up ? e <= e1 : e >= e1) {
      const [e0, c0] = stops[i - 1];
      return out.copy(c0).lerp(c1, (e - e0) / (e1 - e0));
    }
  }
  return out.copy(last[1]);
}

/** Weighted mix of a palette entry over the four moods. */
function mood(key, w, out, dull) {
  out.setRGB(0, 0, 0);
  for (const m of ['day', 'golden', 'twilight', 'night']) {
    if (w[m] <= 0) continue;
    if (m === 'twilight') {
      tmp.set(PALETTE.twilight[key]).lerp(GREY.set(PALETTE.twilightDull[key]), dull);
    } else {
      tmp.set(PALETTE[m][key]);
    }
    out.r += tmp.r * w[m];
    out.g += tmp.g * w[m];
    out.b += tmp.b * w[m];
  }
  return out;
}

/** The same colour, greyed (keeping its brightness) by `amount`. */
function greyed(c, amount) {
  const l = c.r * 0.3 + c.g * 0.55 + c.b * 0.15;
  return c.lerp(GREY.setRGB(l, l, l * 1.04), amount);
}

const skyVertex = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

const skyFragment = /* glsl */ `
  uniform vec3 top;
  uniform vec3 horizon;
  uniform vec3 sunDir;
  uniform vec3 sunColor;
  uniform float night;
  uniform float dusk;
  uniform float afterglow; // how strongly the horizon burns at sunset
  uniform float cover; // cloud cover: hides sun, moon and stars
  uniform float flash; // lightning
  uniform vec3 glowLow;
  uniform vec3 glowHigh;
  uniform float horizonY; // where the land's edge is (below level when you're up high)
  varying vec3 vDir;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  void main() {
    vec3 d = normalize(vDir);
    float up = d.y - horizonY; // height above the horizon you can see
    float t = pow(clamp(up / (1.0 - horizonY), 0.0, 1.0), 0.55);
    vec3 col = mix(horizon, top, t);

    // Warm glow around the sun, strongest at sunrise / sunset.
    float s = max(dot(d, sunDir), 0.0);
    float clear = 1.0 - smoothstep(0.7, 1.0, cover);
    col += sunColor * (pow(s, 6.0) * 0.45 * dusk + pow(s, 90.0) * 0.35 * (1.0 - night)) * (0.35 + 0.65 * clear);

    // Sunset afterglow: bands of colour along the horizon, burning orange
    // low down and fading up through pink into purple, strongest on the
    // sun's side of the sky.
    if (afterglow > 0.0) {
      vec2 ground = normalize(d.xz + 1e-5);
      vec2 sunFlat = normalize(sunDir.xz + 1e-5);
      float side = 0.25 + 0.75 * pow(max(dot(ground, sunFlat) * 0.5 + 0.5, 0.0), 2.0);
      float h = max(up, 0.0);
      float band = exp(-h * 9.0);
      float upper = exp(-h * 5.0) - band;
      col += (glowLow * band + glowHigh * upper * 0.8) * side * afterglow;
    }

    // Sun and moon discs (the moon sits opposite the sun), hidden by thick cloud.
    // (Below the horizon the land would hide it.)
    col = mix(col, vec3(1.0, 0.97, 0.88), smoothstep(0.99955, 0.99972, s) * clear * smoothstep(-0.012, 0.004, up));
    float m = max(dot(d, -sunDir), 0.0);
    col = mix(col, vec3(0.9, 0.93, 1.0), smoothstep(0.99965, 0.9998, m) * night * clear);

    // Stars: sparse cells on the sky sphere, only at night and above the horizon.
    vec3 p = d * 240.0;
    vec3 cell = floor(p);
    float h = hash(cell);
    vec3 centre = vec3(hash(cell + 1.3), hash(cell + 2.7), hash(cell + 4.1));
    float star = step(0.9965, h) * smoothstep(0.32, 0.0, length(fract(p) - centre));
    col += vec3(star) * night * smoothstep(0.0, 0.15, up) * (0.6 + 0.4 * hash(cell + 7.0)) * (1.0 - smoothstep(0.35, 0.8, cover));

    // Lightning lights up the whole sky.
    col += vec3(0.75, 0.8, 1.0) * flash;

    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }`;

/**
 * Sun, moon, sky colours, fog colour and the shadow-casting light, all
 * driven by one number: the hour of the day (0-24).
 *
 * The sun rises in the east (+x), passes to the south (+z) at noon and sets
 * in the west. At night the moon (opposite the sun) takes over as the light
 * that casts shadows. The shadow camera follows the player and snaps to
 * whole shadow-map texels so shadows don't shimmer as you move.
 */
export class DayNight {
  constructor(scene, config, radius) {
    this.scene = scene;
    this.config = config;
    this.hour = config.startHour;
    this.playing = true;
    this.shadows = true;

    this.sunDir = new Vector3();
    this.horizon = new Color();
    this.top = new Color();
    this.sunColor = new Color();
    // For the clouds: the colour the low sun paints them, and how strongly.
    this.glowColor = new Color();
    this.glowStrength = 0;
    // For the light shafts.
    this.shaftColor = new Color();
    this.shaftStrength = 0;
    this.shaftReach = 1.6;
    this.flash = 0; // lightning, 0..1 (set by the storm)
    // Where you see the land meet the sky, as an angle below level (0 on
    // the ground, a few degrees down from high up). The sun sets there.
    // Set groundAt to (x, z) => the land's height to have it worked out.
    this.groundAt = null;
    this.horizonDistance = radius * 0.75;
    this.horizonAngle = 0;
    this._horizonTarget = 0;
    this._horizonWait = 0;
    this._moonLit = false;

    this.sky = new Mesh(
      new SphereGeometry(radius, 32, 16),
      new ShaderMaterial({
        side: BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          top: { value: this.top },
          horizon: { value: this.horizon },
          sunDir: { value: this.sunDir },
          horizonY: { value: 0 },
          sunColor: { value: this.sunColor },
          night: { value: 0 },
          dusk: { value: 0 },
          afterglow: { value: 0 },
          cover: { value: 0 },
          flash: { value: 0 },
          glowLow: { value: new Color() },
          glowHigh: { value: new Color() },
        },
        vertexShader: skyVertex,
        fragmentShader: skyFragment,
      }),
    );
    this.sky.renderOrder = -1;
    this.sky.frustumCulled = false;
    scene.add(this.sky);

    this.hemi = new HemisphereLight();
    scene.add(this.hemi);

    // One light plays the sun by day and the moon by night.
    const light = new DirectionalLight();
    light.castShadow = true;
    light.shadow.mapSize.set(config.shadowMapSize, config.shadowMapSize);
    const e = config.shadowExtent / 2;
    Object.assign(light.shadow.camera, { left: -e, right: e, top: e, bottom: -e, near: 1, far: 1600 });
    light.shadow.bias = -0.0004;
    light.shadow.normalBias = 0.06;
    scene.add(light, light.target);
    this.light = light;

    this._lightDir = new Vector3();
    this._shaftDir = new Vector3();
    this._basis = new Matrix4();
    this._inverse = new Matrix4();
    this._focus = new Vector3();
  }

  /** "09:30" style label for the current hour. */
  get clock() {
    const h = Math.floor(this.hour);
    const m = Math.floor((this.hour - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  /** Towards the sun (or moon) as you see it in the sky: where light shafts stream from. */
  get shaftDirection() {
    return this._shaftDir;
  }

  /** Direction towards whichever of sun or moon is lighting the world. */
  get lightDirection() {
    return this._lightDir;
  }

  /** How strong that light's shafts should be, 0..1 (the moon's are faint). */
  get lightStrength() {
    return this.shaftStrength;
  }

  /**
   * Looks along the ground towards the sun (every so often, easing
   * between) for the highest land against the sky, out to the edge of the
   * view: the angle down to it is where the sun sets. Never above level
   * (a ridge nearby just shades you; the sky still goes by the far horizon).
   */
  #measureHorizon(dt, focus) {
    if (!this.groundAt) return;
    this._horizonWait -= dt;
    if (this._horizonWait <= 0) {
      this._horizonWait = 0.3;
      const l = Math.hypot(this.sunDir.x, this.sunDir.z) || 1;
      const ux = this.sunDir.x / l, uz = this.sunDir.z / l;
      let best = -Math.PI / 2;
      for (const f of [0.3, 0.5, 0.7, 0.85, 1]) {
        const d = this.horizonDistance * f;
        const h = this.groundAt(focus.x + ux * d, focus.z + uz * d);
        best = Math.max(best, Math.atan2(h - focus.y, d));
      }
      this._horizonTarget = Math.min(0, best);
    }
    this.horizonAngle += (this._horizonTarget - this.horizonAngle) * Math.min(1, dt / 0.8);
  }

  /**
   * @param dt       seconds
   * @param focus    the camera position (the sky and shadows follow it)
   * @param weather  { cover, rain, storm, sunsetGlow } (see Weather), or null
   */
  update(dt, focus, weather = null) {
    if (this.playing) this.hour = (this.hour + (dt * 24) / (this.config.dayLengthMinutes * 60)) % 24;
    const cover = weather ? weather.cover : 0.2;
    const rain = weather ? weather.rain : 0;
    const storm = weather ? weather.storm : 0;
    const sunsetGlow = weather ? weather.sunsetGlow : 0.6;

    // Sun path: a circle tilted 30 degrees towards the south.
    const angle = ((this.hour - 6) / 24) * Math.PI * 2;
    const tilt = Math.PI / 6;
    this.sunDir.set(Math.cos(angle), Math.sin(angle) * Math.cos(tilt), Math.sin(angle) * Math.sin(tilt)).normalize();

    // The horizon you can see, towards the sun: from up high the land's
    // edge lies below level, so the sun stays up (and the evening goes on)
    // until it reaches that. Everything below goes by the sun's height
    // above that horizon, `e`, not above level.
    this.#measureHorizon(dt, focus);
    const horizonY = Math.sin(this.horizonAngle);
    const e = this.sunDir.y - horizonY;

    // The four moods, by sun height: golden hour lasts until the sun
    // touches the horizon, then twilight glows on until it's well down.
    const w = this._w ?? (this._w = {});
    w.day = smoothstep(0.12, 0.35, e);
    w.golden = smoothstep(-0.03, 0.02, e) * (1 - w.day);
    w.twilight = smoothstep(-0.22, -0.06, e) * (1 - smoothstep(-0.03, 0.02, e));
    w.night = 1 - smoothstep(-0.18, -0.05, e);
    const sum = w.day + w.golden + w.twilight + w.night;
    for (const k in w) w[k] /= sum;
    const dull = 1 - Math.min(1, sunsetGlow * 1.6);
    const overcast = smoothstep(0.55, 1, cover);
    const darken = 1 - 0.35 * overcast - 0.2 * rain - 0.2 * storm;

    mood('top', w, this.top, dull);
    mood('horizon', w, this.horizon, dull);
    greyed(this.top, overcast * 0.85).multiplyScalar(darken);
    greyed(this.horizon, overcast * 0.8).multiplyScalar(darken);
    ramp(SUN_STOPS, e, this.sunColor);

    const duskF = Math.max(0, 1 - Math.abs(e - 0.02) / 0.22) * 0.75;
    const night = 1 - smoothstep(-0.2, 0.0, e);
    const u = this.sky.material.uniforms;
    u.night.value = night;
    u.dusk.value = duskF;
    u.cover.value = cover;
    u.flash.value = this.flash * 0.6;
    u.horizonY.value = horizonY;
    // Afterglow: the evening's sunset, from the sun touching the horizon
    // until it's well below it.
    const lowSun = smoothstep(-0.16, -0.03, e) * (1 - smoothstep(0.03, 0.14, e));
    u.afterglow.value = lowSun * (0.12 + 0.5 * sunsetGlow) * (1 - 0.8 * overcast);
    ramp(GLOW_STOPS, Math.max(e, -0.03), u.glowLow.value);
    ramp(GLOW_STOPS, e - 0.07, u.glowHigh.value);
    this.sky.position.copy(focus);

    if (this.scene.fog) this.scene.fog.color.copy(this.horizon);

    // Sky light, greyer and flatter under cloud, and a flash for lightning.
    mood('hemiSky', w, this.hemi.color, dull);
    mood('hemiGround', w, this.hemi.groundColor, dull);
    greyed(this.hemi.color, overcast * 0.7);
    this.hemi.intensity = (w.day * HEMI_INTENSITY.day + w.golden * HEMI_INTENSITY.golden + w.twilight * HEMI_INTENSITY.twilight + w.night * HEMI_INTENSITY.night) * (1 - 0.25 * rain - 0.3 * storm) + 0.2 * overcast * w.day * (1 - storm);
    if (this.flash > 0) {
      this.hemi.color.lerp(FLASH, Math.min(1, this.flash));
      this.hemi.intensity += this.flash * 3;
    }

    // The sun lights the world, warm and strong, right until it touches the
    // horizon; then only the sky does (twilight) until the moon takes over.
    const light = this.light;
    const dir = this._lightDir;
    const sunUp = smoothstep(-0.025, 0.035, e);
    const clouded = Math.max(0.05, 1 - 0.75 * overcast - 0.1 * rain - 0.1 * storm);
    if (e > -0.06) {
      this._moonLit = false;
      // From the sun's height above the horizon you can see (seen from up
      // high it can be below level and still up; it never lights the land
      // from underneath).
      const up = Math.min(0.999, Math.max(0.01, e));
      const flat = Math.hypot(this.sunDir.x, this.sunDir.z) || 1;
      const k = Math.sqrt(1 - up * up) / flat;
      dir.set(this.sunDir.x * k, up, this.sunDir.z * k);
      this._shaftDir.copy(this.sunDir);
      light.color.copy(this.sunColor);
      light.intensity = 2.6 * sunUp * (0.6 + 0.4 * smoothstep(0.03, 0.25, e)) * clouded;
    } else {
      this._moonLit = true;
      dir.copy(this.sunDir).negate();
      this._shaftDir.copy(dir);
      light.color.copy(MOON);
      light.intensity = 0.8 * smoothstep(0.12, 0.3, -e) * (1 - 0.85 * overcast);
    }

    // Clouds catch the low sun: gold, then orange-red, pink and purple as it
    // sinks, glowing on well after sunset when it lights them from below.
    ramp(GLOW_STOPS, e, this.glowColor);
    const glowWindow = smoothstep(-0.17, -0.08, e) * (1 - smoothstep(0.1, 0.25, e));
    this.glowStrength = glowWindow * (0.15 + 0.85 * sunsetGlow);

    // Light shafts: golden and strongest with the sun low; cloud gaps help,
    // a lid of cloud or rain hides them.
    const golden = smoothstep(-0.02, 0.04, e) * (1 - smoothstep(0.12, 0.3, e));
    if (this._moonLit) {
      this.shaftColor.copy(MOON);
      this.shaftStrength = (light.intensity / 0.8) * 0.3 * 0.55;
      this.shaftReach = 1.6;
    } else {
      this.shaftColor.copy(this.sunColor).lerp(tmp.set(0xffc060), golden * 0.5);
      const broken = 1 + 0.4 * smoothstep(0.15, 0.45, cover) * (1 - overcast);
      this.shaftStrength = sunUp * (0.55 + 0.75 * golden) * broken * (1 - 0.85 * overcast) * (1 - 0.7 * rain);
      this.shaftReach = 1.6 + 0.9 * golden;
    }

    // Toggling castShadow recompiles every material, so only the user's
    // Shadows switch changes it (not the dim moments at dawn and dusk).
    light.castShadow = this.shadows;

    // Centre the shadow box on the player, snapped to whole texels.
    const texel = this.config.shadowExtent / this.config.shadowMapSize;
    this._basis.lookAt(dir, new Vector3(0, 0, 0), new Vector3(0, 1, 0));
    this._inverse.copy(this._basis).transpose();
    const f = this._focus.copy(focus).applyMatrix4(this._inverse);
    f.x = Math.round(f.x / texel) * texel;
    f.y = Math.round(f.y / texel) * texel;
    f.applyMatrix4(this._basis);

    light.target.position.copy(f);
    light.position.copy(f).addScaledVector(dir, 800);
  }
}
