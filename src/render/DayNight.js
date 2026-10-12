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
  night: { top: 0x070d22, horizon: 0x1a2748, hemiSky: 0x7083b8, hemiGround: 0x1c2230 },
};
const HEMI_INTENSITY = { day: 1.4, golden: 1.2, twilight: 0.95, night: 0.6 };
const MOONLESS = new Color(0x020306); // (the sky on a dark night, near the horizon)

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
  uniform float time; // seconds, for twinkling and shooting stars
  uniform float moonPhase; // 0 new, 0.25 first quarter, 0.5 full, 0.75 last quarter
  uniform float aurora; // northern lights, 0..1
  uniform float rainbow; // after rain, 0..1
  varying vec3 vDir;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float vnoise(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
      f.z);
  }

  void main() {
    vec3 d = normalize(vDir);
    float up = d.y - horizonY; // height above the horizon you can see
    float t = pow(clamp(up / (1.0 - horizonY), 0.0, 1.0), 0.55);
    vec3 col = mix(horizon, top, t);

    // Warm glow around the sun, strongest at sunrise / sunset.
    float s = max(dot(d, sunDir), 0.0);
    float clear = 1.0 - smoothstep(0.7, 1.0, cover);
    // (The discs, and the sun's tight halo, are gone behind thick cloud:
    // there's only a soft brightening in the cloud where the sun is.)
    float veiled = 1.0 - smoothstep(0.45, 0.78, cover);
    col += sunColor * (pow(s, 6.0) * 0.45 * dusk + pow(s, 90.0) * 0.35 * (1.0 - night) * veiled) * (0.35 + 0.65 * clear);
    col += vec3(1.0, 0.98, 0.94) * pow(s, 14.0) * 0.16 * (1.0 - veiled) * (1.0 - night) * (1.0 - 0.6 * smoothstep(0.9, 1.0, cover));

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
    col = mix(col, vec3(1.0, 0.97, 0.88), smoothstep(0.99955, 0.99972, s) * veiled * smoothstep(-0.012, 0.004, up));
    // The moon: a ball lit from the side the sun is on, so it waxes and
    // wanes with a curved terminator (its dark part faint with earthshine),
    // its grey seas on the lit part.
    vec3 md = -sunDir;
    float m = max(dot(d, md), 0.0);
    float disc = smoothstep(0.99965, 0.9998, m);
    if (disc > 0.0) {
      vec3 e1 = normalize(cross(md, vec3(0.0, 1.0, 0.0)) + vec3(1e-4, 0.0, 0.0));
      vec3 e2 = cross(e1, md);
      vec2 uv = vec2(dot(d, e1), dot(d, e2)) / 0.0235;
      vec3 n = vec3(uv, sqrt(max(0.0, 1.0 - dot(uv, uv))));
      float ph = moonPhase * 6.28318;
      vec3 L = vec3(sin(ph), 0.0, -cos(ph));
      float lit = smoothstep(-0.04, 0.12, dot(n, L));
      float seas = 0.78 + 0.22 * vnoise(vec3(uv * 2.2, 3.0));
      vec3 moonCol = vec3(0.92, 0.94, 1.0) * seas * (0.55 + 0.45 * n.z) * lit;
      moonCol += vec3(0.05, 0.06, 0.08) * (1.0 - lit); // earthshine
      col = mix(col, moonCol + col * 0.25 * (1.0 - lit), disc * night * veiled);
    }

    float starsShow = night * smoothstep(0.0, 0.15, up) * (1.0 - smoothstep(0.35, 0.8, cover));

    // Stars: sparse cells on the sky sphere,
    // some bluish, some golden, twinkling.
    vec3 p = d * 240.0;
    vec3 cell = floor(p);
    float h = hash(cell);
    vec3 centre = vec3(hash(cell + 1.3), hash(cell + 2.7), hash(cell + 4.1));
    float star = step(0.9962, h) * smoothstep(0.32, 0.0, length(fract(p) - centre));
    float twinkle = 0.75 + 0.25 * sin(time * (2.0 + 3.0 * hash(cell + 5.0)) + hash(cell + 6.0) * 6.28);
    vec3 tint = mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.9, 0.72), hash(cell + 9.0));
    col += tint * star * starsShow * (0.5 + 0.5 * hash(cell + 7.0)) * twinkle;

    // The northern lights: curtains of green light hanging in the northern
    // sky (-z), rippling and drifting, fringed with red and violet above,
    // bright rays running up them.
    if (aurora > 0.0 && starsShow > 0.0) {
      float az = atan(d.x, -d.z); // 0 due north
      float north = 1.0 - 0.75 * smoothstep(1.0, 2.6, abs(az));
      float lights = 0.0;
      vec3 auroraCol = vec3(0.0);
      for (int k = 0; k < 2; k++) {
        float fk = float(k);
        float base = 0.1 + 0.12 * fk + 0.05 * sin(az * (2.0 + fk) + time * 0.04 + fk * 2.0) + 0.03 * sin(az * 7.0 - time * 0.09 + fk);
        float above = up - base;
        float rise = smoothstep(-0.015, 0.01, above) * exp(-max(above, 0.0) * (5.5 - 1.5 * fk));
        float rays = 0.7 + 0.3 * sin(az * 70.0 + 5.0 * vnoise(vec3(az * 6.0, time * 0.12 + fk * 5.0, 0.0)));
        float ripple = 0.35 + 0.65 * vnoise(vec3(az * 4.0 - time * 0.05, fk * 3.0, time * 0.03));
        float c = rise * rays * ripple;
        auroraCol += mix(vec3(0.18, 1.0, 0.45), vec3(0.75, 0.2, 0.75), smoothstep(0.03, 0.2, above)) * c;
      }
      col += auroraCol * north * aurora * starsShow * 0.5;
    }

    // Now and then a shooting star streaks across.
    float slot = floor(time / 7.0);
    float ts = time - slot * 7.0;
    if (ts < 0.9 && hash(vec3(slot, 3.1, 7.7)) < 0.45) {
      float a = hash(vec3(slot, 1.0, 2.0)) * 6.283;
      float el = 0.35 + 0.5 * hash(vec3(slot, 5.0, 1.0));
      vec3 start = vec3(cos(a) * cos(el), sin(el), sin(a) * cos(el));
      vec3 way = normalize(cross(start, vec3(hash(vec3(slot, 2.0, 9.0)) - 0.5, 1.0, hash(vec3(slot, 8.0, 4.0)) - 0.5)));
      float prog = ts / 0.9;
      vec3 head = normalize(start + way * prog * 0.35);
      vec3 tail = normalize(start + way * max(0.0, prog - 0.3) * 0.35);
      vec3 ab = head - tail;
      float along = clamp(dot(d - tail, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
      float dist = length(d - (tail + ab * along));
      col += vec3(1.0, 0.95, 0.85) * smoothstep(0.0025, 0.0, dist) * along * (1.0 - prog) * 1.6 * starsShow;
    }

    // A rainbow after rain: an arc 42 degrees round the point opposite the
    // sun, red outside to violet inside, the sky a shade brighter within
    // it, and a fainter second bow outside with its colours the other way.
    if (rainbow > 0.0 && up > -0.01) {
      float ang = degrees(acos(clamp(dot(d, -sunDir), -1.0, 1.0)));
      float t1 = (ang - 40.4) / 2.2, t2 = (53.4 - ang) / 3.2;
      vec3 bow = vec3(0.0);
      if (t1 > 0.0 && t1 < 1.0) bow += clamp(vec3(smoothstep(0.35, 0.9, t1), 1.0 - abs(t1 - 0.5) * 2.2, 1.0 - smoothstep(0.1, 0.55, t1)), 0.0, 1.0) * sin(3.14159 * t1);
      if (t2 > 0.0 && t2 < 1.0) bow += 0.35 * clamp(vec3(smoothstep(0.35, 0.9, t2), 1.0 - abs(t2 - 0.5) * 2.2, 1.0 - smoothstep(0.1, 0.55, t2)), 0.0, 1.0) * sin(3.14159 * t2);
      float inside = 0.06 * (1.0 - smoothstep(38.0, 40.5, ang));
      col += (bow * 0.32 + inside) * rainbow * smoothstep(-0.01, 0.05, up);
    }

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
    this.aurora = 0; // the northern lights, 0..1 (set from outside: on clear winter nights)
    this.viewDir = null; // which way you're looking (the shadows reach mostly ahead of you)
    this._ahead = new Vector3();
    this.rainbow = 0; // a rainbow, 0..1 (set from outside: as rain clears with the sun out)
    // Where you see the land meet the sky, as an angle below level (0 on
    // the ground, a few degrees down from high up). The sun sets there.
    // Set groundAt to (x, z) => the land's height to have it worked out.
    this.groundAt = null;
    this.horizonDistance = radius * 0.75;
    this.horizonAngle = 0;
    this._horizonTarget = 0;
    this._horizonWait = 0;
    this._moonLit = false;
    this.day = 2.8; // (so the first nights have a waxing moon)
    this.moonPhase = 0.35;
    this._skyTime = 0;

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
          time: { value: 0 },
          moonPhase: { value: 0.35 },
          aurora: { value: 0 },
          rainbow: { value: 0 },
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
    // Its shadow in two maps (see splitShadow.js): a sharp one close round
    // you, its own, redrawn every frame; and one out to the shadows' full
    // reach, held by a second light that gives no light, redrawn every
    // other frame (far off, a frame late is never seen).
    const light = new DirectionalLight();
    const far = new DirectionalLight(0x000000, 0);
    for (const l of [light, far]) {
      l.castShadow = true;
      l.shadow.camera.near = 1;
      l.shadow.camera.far = 1600;
      l.shadow.bias = -0.0004;
      l.shadow.normalBias = 0.09; // (enough that faceted ground and crowns don't shadow themselves in patches)
    }
    far.shadow.autoUpdate = false;
    scene.add(light, light.target, far, far.target); // (the sun first: it's the near map, see splitShadow.js)
    this.light = light;
    this.farLight = far;
    this._shadowFrame = 0;
    this.setShadowSize(config.shadowExtent, config.shadowMapSize);

    this._lightDir = new Vector3();
    this._shadowDir = new Vector3(); // (see update: the light's direction, in steps)
    this._shaftDir = new Vector3();
    this._basis = new Matrix4();
    this._inverse = new Matrix4();
    this._focus = new Vector3();
  }

  /**
   * How far the shadows reach (metres across) and how sharp the far map is
   * (texels across); the near one covers the nearest part, as sharp or sharper.
   */
  setShadowSize(extent, mapSize) {
    const near = Math.min(160, extent * 0.45), nearSize = Math.max(1024, mapSize / 2);
    for (const [l, e, size] of [[this.light, near, nearSize], [this.farLight, extent, mapSize]]) {
      if (l.shadow.mapSize.x !== size) {
        l.shadow.mapSize.set(size, size);
        l.shadow.map?.dispose();
        l.shadow.map = null;
      }
      Object.assign(l.shadow.camera, { left: -e / 2, right: e / 2, top: e / 2, bottom: -e / 2 });
      l.shadow.camera.updateProjectionMatrix();
      l.userData.extent = e;
    }
    this.farLight.shadow.needsUpdate = true;
  }

  /** The far shadow map's sharpness (texels across): see setShadowSize. */
  get shadowMapSize() {
    return this.farLight.shadow.mapSize.x;
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
    this._dt = dt;
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
    // The moon goes through its phases over eight days.
    if (this._prevHour !== undefined && this.hour < this._prevHour - 12) this.day++;
    this._prevHour = this.hour;
    this.moonPhase = (((this.day + this.hour / 24) / 8) % 1 + 1) % 1;
    // How much the moon lights the land: 0 with no moon (new, or not up,
    // or behind thick cloud) .. 1 a full moon high in a clear sky. A night
    // without one is black: only what's lit by a fire or a torch shows,
    // and the land fades out a few dozen metres off (see main: nightSight).
    const full = 0.5 - 0.5 * Math.cos(this.moonPhase * Math.PI * 2);
    this.moonlight = full * smoothstep(0.02, 0.3, -e) * (1 - 0.85 * overcast);
    const blackness = night * (1 - this.moonlight);
    if (blackness > 0) {
      this.horizon.lerp(MOONLESS, 0.7 * blackness);
      this.top.lerp(MOONLESS, 0.75 * blackness);
    }
    this._skyTime += dt;
    const u = this.sky.material.uniforms;
    u.time.value = this._skyTime % 10000;
    u.moonPhase.value = this.moonPhase;
    u.aurora.value = this.aurora;
    u.rainbow.value = this.rainbow;
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
    this.hemi.intensity = (w.day * HEMI_INTENSITY.day + w.golden * HEMI_INTENSITY.golden + w.twilight * HEMI_INTENSITY.twilight + w.night * HEMI_INTENSITY.night * (0.85 + 0.15 * this.moonlight)) * (1 - 0.25 * rain - 0.3 * storm) + 0.2 * overcast * w.day * (1 - storm); // (night: starlight alone enough, once your eyes are used to it, to make out what's near)
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
      // (A full moon lights the land well; a thin one, barely.)
      // (Strong enough, with so little light from the sky, to cast dark shadows.)
      light.intensity = 0.75 * full * smoothstep(0.12, 0.3, -e) * (1 - 0.85 * overcast);
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
      this.shaftStrength = sunUp * (0.55 + 0.75 * golden) * broken * (1 - overcast) * (1 - 0.7 * rain);
      this.shaftReach = 1.6 + 0.9 * golden;
    }

    // Toggling castShadow recompiles every material, so only the user's
    // Shadows switch changes it (not the dim moments at dawn and dusk).
    light.castShadow = this.farLight.castShadow = this.shadows;
    // (The far map redrawn every other frame.)
    this._shadowFrame = (this._shadowFrame + 1) % 2;
    if (this._shadowFrame === 0) this.farLight.shadow.needsUpdate = true;

    // Centre the shadow boxes a little ahead of the player, where they're
    // looking (shadows behind them are never seen), snapped to whole texels.
    // The shadows are cast along the light's direction, but it's only
    // brought up to date in small steps (a fifth of a degree), not every
    // frame: the sun creeps across the sky, and its height above the
    // horizon you can see shifts as you walk, and a shadow map turned even
    // a hair every frame makes every shadow's edge crawl and shake.
    // So it follows the light smoothly, every frame, but slowly (a
    // second or so behind): the sun's own creep is seamless, while the
    // little jumps of the horizon as you walk are smoothed away. (A big
    // jump, the time of day set or sun to moon, it takes at once.)
    const sd = this._shadowDir;
    if (sd.lengthSq() === 0 || sd.angleTo(dir) > 0.08) sd.copy(dir);
    else sd.lerp(dir, Math.min(1, (this._dt ?? 0.016) / 1.2)).normalize();
    this._basis.lookAt(sd, new Vector3(0, 0, 0), new Vector3(0, 1, 0));
    this._inverse.copy(this._basis).transpose();
    for (const l of [light, this.farLight]) {
      const extent = l.userData.extent, texel = extent / l.shadow.mapSize.x;
      const f = this._focus.copy(focus);
      if (this.viewDir) {
        const len = Math.hypot(this.viewDir.x, this.viewDir.z);
        if (len > 1e-3) f.addScaledVector(this._ahead.set(this.viewDir.x / len, 0, this.viewDir.z / len), extent * (l === light ? 0.25 : 0.32));
      }
      f.applyMatrix4(this._inverse);
      f.x = Math.round(f.x / texel) * texel;
      f.y = Math.round(f.y / texel) * texel;
      f.applyMatrix4(this._basis);
      l.target.position.copy(f);
      l.position.copy(f).addScaledVector(sd, 800);
    }
  }
}
