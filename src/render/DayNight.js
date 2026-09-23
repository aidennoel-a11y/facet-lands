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

// Sky palettes (sRGB hex). Blended by how high the sun is.
const PALETTE = {
  night: { top: 0x070d22, horizon: 0x1a2748, hemiSky: 0x5b6fa8, hemiGround: 0x202838 },
  dusk: { top: 0x2a4478, horizon: 0xf2a066, hemiSky: 0xf0b890, hemiGround: 0x4a3a34 },
  day: { top: 0x3f7fd0, horizon: 0xd6e8f7, hemiSky: 0xdcecff, hemiGround: 0x5b4c3a },
};
const SUN_LOW = new Color(0xff9a4d);
const SUN_HIGH = new Color(0xfff1dc);
const MOON = new Color(0x9fb6ff);

const tmpA = new Color();
const tmpB = new Color();
function blend(key, dayF, duskF, out) {
  out.set(PALETTE.night[key]).lerp(tmpA.set(PALETTE.day[key]), dayF);
  return out.lerp(tmpB.set(PALETTE.dusk[key]), duskF);
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
  varying vec3 vDir;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  void main() {
    vec3 d = normalize(vDir);
    float t = pow(clamp(d.y, 0.0, 1.0), 0.55);
    vec3 col = mix(horizon, top, t);

    // Warm glow around the sun, strongest at sunrise / sunset.
    float s = max(dot(d, sunDir), 0.0);
    col += sunColor * (pow(s, 6.0) * 0.45 * dusk + pow(s, 90.0) * 0.35 * (1.0 - night));

    // Sun and moon discs (the moon sits opposite the sun).
    col = mix(col, vec3(1.0, 0.97, 0.88), smoothstep(0.99955, 0.99972, s));
    float m = max(dot(d, -sunDir), 0.0);
    col = mix(col, vec3(0.9, 0.93, 1.0), smoothstep(0.99965, 0.9998, m) * night);

    // Stars: sparse cells on the sky sphere, only at night and above the horizon.
    vec3 p = d * 240.0;
    vec3 cell = floor(p);
    float h = hash(cell);
    vec3 centre = vec3(hash(cell + 1.3), hash(cell + 2.7), hash(cell + 4.1));
    float star = step(0.9965, h) * smoothstep(0.32, 0.0, length(fract(p) - centre));
    col += vec3(star) * night * smoothstep(0.0, 0.15, d.y) * (0.6 + 0.4 * hash(cell + 7.0));

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
          sunColor: { value: this.sunColor },
          night: { value: 0 },
          dusk: { value: 0 },
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

  /** Direction towards whichever of sun or moon is lighting the world. */
  get lightDirection() {
    return this._lightDir;
  }

  /** How strong that light's shafts should be, 0..1 (the moon's are faint). */
  get lightStrength() {
    return this.sunDir.y > -0.05 ? this.light.intensity / 2.6 : (this.light.intensity / 0.8) * 0.3;
  }

  update(dt, focus) {
    if (this.playing) this.hour = (this.hour + (dt * 24) / (this.config.dayLengthMinutes * 60)) % 24;

    // Sun path: a circle tilted 30 degrees towards the south.
    const angle = ((this.hour - 6) / 24) * Math.PI * 2;
    const tilt = Math.PI / 6;
    this.sunDir.set(Math.cos(angle), Math.sin(angle) * Math.cos(tilt), Math.sin(angle) * Math.sin(tilt)).normalize();

    const elevation = this.sunDir.y;
    const dayF = smoothstep(-0.12, 0.3, elevation);
    const duskF = Math.max(0, 1 - Math.abs(elevation - 0.02) / 0.22) * 0.75;
    const night = 1 - smoothstep(-0.2, 0.0, elevation);

    blend('top', dayF, duskF * 0.4, this.top);
    blend('horizon', dayF, duskF, this.horizon);
    this.sunColor.copy(SUN_LOW).lerp(SUN_HIGH, smoothstep(0.0, 0.4, elevation));

    const u = this.sky.material.uniforms;
    u.night.value = night;
    u.dusk.value = duskF;
    this.sky.position.copy(focus);

    if (this.scene.fog) this.scene.fog.color.copy(this.horizon);

    blend('hemiSky', dayF, duskF * 0.5, this.hemi.color);
    blend('hemiGround', dayF, duskF * 0.5, this.hemi.groundColor);
    this.hemi.intensity = 0.75 + 0.65 * dayF;

    // Sun above the horizon lights the world; below it, the moon does.
    const light = this.light;
    const dir = this._lightDir;
    if (elevation > -0.05) {
      dir.copy(this.sunDir);
      light.color.copy(this.sunColor);
      light.intensity = 2.6 * smoothstep(-0.05, 0.25, elevation);
    } else {
      dir.copy(this.sunDir).negate();
      light.color.copy(MOON);
      light.intensity = 0.8 * smoothstep(0.05, 0.3, -elevation);
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
