import { Color, CylinderGeometry, DoubleSide, InstancedBufferAttribute, InstancedMesh, Matrix4, Quaternion, ShaderMaterial, Vector2, Vector3 } from 'three';

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

const vertexShader = /* glsl */ `
  uniform vec2 shear; // how far the rain blows downwind per metre it falls
  attribute float aRain;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying float vY;
  varying float vRain;
  varying vec2 vAxis;
  varying float vRadius;
  void main() {
    vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
    float height = length(instanceMatrix[1].xyz);
    wp.xz += shear * (1.0 - position.y) * height;
    vWorld = wp.xyz;
    vNormal = mat3(instanceMatrix) * normal;
    vY = position.y;
    vRain = aRain;
    vAxis = (modelMatrix * instanceMatrix[3]).xz;
    vRadius = length(instanceMatrix[0].xyz);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;

const fragmentShader = /* glsl */ `
  uniform vec3 colour;
  uniform vec3 horizon;
  uniform float opacity;
  uniform float time;
  uniform float fogNear;
  uniform float fogFar;
  uniform float flash;
  uniform vec2 flashAt;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying float vY;
  varying float vRain;
  varying vec2 vAxis;
  varying float vRadius;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }

  void main() {
    // A column of rain seen through: the line of sight crosses the most
    // of it through the middle and grazes it at the sides, so it's densest
    // down the middle and fades softly away at its edges (no hard outline).
    vec3 V = normalize(cameraPosition - vWorld);
    vec2 n = normalize(vNormal.xz);
    float through = abs(dot(n, normalize(V.xz + 1e-5)));
    // The rain in it: streaks falling, and thick and thin patches drifting
    // through, ragged where it hangs from the cloud.
    float around = atan(vNormal.z, vNormal.x);
    float streaks = 0.6 + 0.4 * noise(vec2(around * vRadius * 0.12, vWorld.y * 0.012 + time * 0.9));
    float body = 0.35 + 0.65 * noise(vec2(around * 2.2 + vAxis.x * 0.01, vY * 1.6 - time * 0.04 + vAxis.y * 0.01));
    float hang = smoothstep(0.0, 0.1, vY) * (1.0 - smoothstep(0.9, 1.0, vY));
    // Not when you're in it (the rain round you is drawn up close: see Rain).
    float near = smoothstep(vRadius * 0.7, vRadius * 0.7 + 260.0, distance(cameraPosition.xz, vAxis));
    float dist = distance(cameraPosition, vWorld);
    float haze = smoothstep(fogNear, fogFar * 1.3, dist);
    float a = opacity * vRain * pow(through, 0.9) * streaks * body * hang * near * (1.0 - 0.45 * haze);
    float lit = flash * (1.0 - smoothstep(0.0, 450.0, distance(vAxis, flashAt)));
    vec3 c = mix(colour, horizon, haze * 0.55) + vec3(0.8, 0.85, 1.0) * lit;
    gl_FragColor = vec4(c, a);
    #include <colorspace_fragment>
  }`;

const m4 = new Matrix4(), q = new Quaternion(), p = new Vector3(), s = new Vector3();

/**
 * Rain you can see coming: the grey columns of rain hanging under the
 * clouds that carry it (see Clouds, Weather.at), slanting with the wind
 * and drifting in with them: a far-off shower under a lone dark cloud,
 * or a whole wall of rain along a front. Soft-edged, as a column of
 * falling rain is, and streaked. Before a storm, lightning flickers
 * inside them (see the far strikes in main).
 */
export class Showers {
  constructor(scene, clouds) {
    this.clouds = clouds.clouds.filter((c) => !c.userData.wispy); // (wisps don't rain)
    this.sky = clouds.group; // (hidden with the clouds, deep in a cave)
    const geometry = new CylinderGeometry(1, 1.15, 1, 18, 1, true).translate(0, 0.5, 0);
    geometry.deleteAttribute('uv');
    this.material = new ShaderMaterial({
      uniforms: {
        colour: { value: new Color(0x6f7a88) },
        horizon: { value: new Color() },
        opacity: { value: 0.5 },
        time: { value: 0 },
        fogNear: { value: 100 },
        fogFar: { value: 2000 },
        shear: { value: new Vector2() },
        flash: { value: 0 },
        flashAt: { value: new Vector2() },
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      fog: false,
    });
    this.mesh = new InstancedMesh(geometry, this.material, this.clouds.length);
    this.rain = new InstancedBufferAttribute(new Float32Array(this.clouds.length), 1);
    geometry.setAttribute('aRain', this.rain);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.mesh.name = 'showers';
    scene.add(this.mesh);
    this.list = []; // the showers out now: { x, z, width }
    this.time = 0;
    this.flash = 0; // a flicker of far lightning, 0..1 (set from outside)
    this.flashAt = null; // { x, z } of it
  }

  /**
   * @param wind     { x, z } the clouds' drift, m/s
   * @param windStrength  how windy (0..1+)
   * @param horizon  the sky's colour at the horizon
   * @param fog      the scene's fog (near, far)
   */
  update(dt, camera, wind, windStrength, horizon, fog) {
    this.time += dt;
    const u = this.material.uniforms;
    let n = 0;
    this.list.length = 0;
    for (const cloud of this.clouds) {
      const d = cloud.userData;
      if (!cloud.visible) continue;
      // Rain only from the clouds really bringing it (an overcast sky
      // that isn't raining shows none).
      const rain = smoothstep(0.05, 0.5, d.rain);
      if (rain < 0.02) continue;
      const grown = cloud.scale.x / d.scale.x;
      const radius = d.reach * grown * 0.5;
      const base = cloud.position.y + d.bottom * (cloud.scale.y / d.scale.y) + 4;
      const foot = d.ground - 8;
      if (base - foot < 20) continue;
      p.set(cloud.position.x, foot, cloud.position.z);
      s.set(radius, base - foot, radius);
      m4.compose(p, q, s);
      this.mesh.setMatrixAt(n, m4);
      this.rain.array[n] = rain;
      this.list.push({ x: cloud.position.x, z: cloud.position.z, width: radius * 2, rain });
      n++;
    }
    this.mesh.count = n;
    this.mesh.visible = n > 0 && this.sky.visible;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.rain.needsUpdate = true;
    // Blown downwind as it falls (some 7 m/s).
    const blow = (0.25 + 0.75 * windStrength) / 7;
    u.shear.value.set(wind.x * blow, wind.z * blow);
    if (u.shear.value.length() > 0.7) u.shear.value.setLength(0.7);
    u.time.value = this.time;
    u.fogNear.value = fog.near;
    u.fogFar.value = fog.far;
    u.horizon.value.copy(horizon);
    // As dark as the sky behind them: grey by day, gone into the dark at night.
    const lum = Math.min(1, (0.3 * horizon.r + 0.59 * horizon.g + 0.11 * horizon.b) * 1.5);
    u.colour.value.setRGB(0.34 * lum, 0.37 * lum, 0.42 * lum);
    u.opacity.value = 0.8 * (0.3 + 0.7 * Math.min(1, (horizon.r + horizon.g + horizon.b) * 1.2));
    u.flash.value = this.flashAt ? this.flash : 0;
    if (this.flashAt) u.flashAt.value.set(this.flashAt.x, this.flashAt.z);
  }

  /**
   * How hard it's raining at `p` from the showers overhead (0..0.75, as
   * the weather's rain): fly in under one and you're in its rain.
   */
  rainAt(p) {
    let r = 0;
    for (const s of this.list) {
      const d = Math.hypot(s.x - p.x, s.z - p.z), half = s.width / 2;
      if (d < half) r = Math.max(r, 0.75 * s.rain * (1 - smoothstep(half * 0.6, half, d)));
    }
    return r;
  }

  /** Where one of the heavier showers stands, well away, for far lightning to strike inside it (or null). */
  pick(from, chance = () => true) {
    return this.list.find((s) => s.rain > 0.5 && Math.hypot(s.x - from.x, s.z - from.z) > 500 && chance(s)) ?? null;
  }
}
