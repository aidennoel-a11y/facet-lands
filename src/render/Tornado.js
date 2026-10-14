import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  Quaternion,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  Vector3,
} from 'three';

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
// (Seeded, so a tornado's every twist is the same for everyone online.)
function mulberry(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const DEBRIS = 900; // (bits of the land swept up and round: soil, leaves, twigs, splinters)
const m4 = new Matrix4(), q = new Quaternion(), p = new Vector3(), s = new Vector3(), e3 = new Vector3();

/**
 * A funnel of whirling air (and, lower down, the dust and wreckage it's
 * lifted): a tube from the ground up into the storm cloud, narrow at the
 * foot and flaring above, its surface streaked by spiral bands turning
 * round it, the whole of it leaning and snaking as it goes. Drawn in the
 * world, lit by the storm's light; misted by distance like everything else.
 */
function funnelMaterial({ dust = false } = {}) {
  return new ShaderMaterial({
    uniforms: UniformsUtils.merge([
      UniformsLib.fog,
      {
        uTime: { value: 0 },
        uBase: { value: new Vector3() }, // (its foot: x, ground, z)
        uHeight: { value: 300 },
        uFoot: { value: 20 }, // radius at the foot
        uTop: { value: 120 }, // radius up at the cloud
        uLean: { value: new Vector3() }, // (where its top is, from its foot: the storm's drift)
        uForm: { value: 1 }, // how far down it's reached (0: still in the cloud .. 1: on the ground)
        uFade: { value: 1 },
        uSpin: { value: 1 },
        uLight: { value: new Color(0.5, 0.5, 0.5) },
        uColour: { value: dust ? new Color(0.36, 0.29, 0.22) : new Color(0.4, 0.41, 0.42) },
        uDense: { value: dust ? 0.9 : 1 },
      },
    ]),
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    fog: true,
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      uniform float uTime, uHeight, uFoot, uTop, uSpin;
      uniform vec3 uBase, uLean;
      varying float vH;
      varying float vA;
      varying float vRim;
      void main() {
        float h = position.y; // 0 at the foot .. 1 at the top
        float a = atan(position.z, position.x);
        // Its girth: a narrow neck low down, flaring out into the cloud above.
        float r = mix(uFoot, uTop, pow(h, 2.2));
        // Lumpy, and the lumps travel round with it.
        r *= 1.0 + 0.16 * sin(a * 3.0 - uTime * 3.1 * uSpin + h * 9.0) + 0.1 * sin(a * 5.0 + uTime * 2.3 * uSpin - h * 14.0);
        // It snakes: the middle bowing out one way then another, more low down.
        vec2 bow = vec2(sin(h * 5.0 + uTime * 0.7), cos(h * 4.3 - uTime * 0.53)) * uFoot * 1.6 * (1.0 - h) * h * 4.0;
        vec3 at = uBase + vec3(cos(a) * r + uLean.x * h * h + bow.x, h * uHeight, sin(a) * r + uLean.z * h * h + bow.y);
        vH = h;
        vA = a;
        vec4 mvPosition = modelViewMatrix * vec4(at, 1.0);
        // (Seen edge-on, it's thicker: more cloud to look through.)
        vec3 outward = normalize(vec3(cos(a), 0.0, sin(a)));
        vRim = abs(dot(normalize((viewMatrix * vec4(outward, 0.0)).xyz), normalize(-mvPosition.xyz)));
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
        #ifdef USE_FOG
          vFogDepth *= 0.35; // (dark and dense: it shows through the rain and murk further than the land does)
        #endif
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform float uTime, uForm, uFade, uSpin, uDense;
      uniform vec3 uLight, uColour;
      varying float vH;
      varying float vA;
      varying float vRim;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      void main() {
        // Still coming down out of the cloud: only its upper part.
        float shown = smoothstep(1.0 - uForm - 0.06, 1.0 - uForm + 0.02, vH);
        if (shown <= 0.001) discard;
        // Spiral bands of cloud and dust, wound round it and racing upward.
        vec2 sp = vec2(vA * 2.0 + vH * 9.0 - uTime * 2.6 * uSpin, vH * 7.0 - uTime * 0.9);
        float bands = 0.55 + 0.45 * noise(sp * vec2(1.3, 2.2)) * (0.6 + 0.4 * noise(sp * 3.1 + 7.0));
        float edge = mix(0.62, 1.0, smoothstep(0.0, 0.65, 1.0 - vRim)); // (thicker at its edges, as seen)
        // Into the cloud base at the top; into the debris at the foot.
        float top = 1.0 - smoothstep(0.82, 1.0, vH);
        float foot = smoothstep(0.0, 0.05, vH);
        float alpha = min(0.96, uDense * (0.35 + 0.75 * bands) * edge * top * foot * shown * uFade);
        // (Its edges catch what light there is: a pale outline against the dark of the storm.)
        vec3 col = uColour * (0.7 + 0.5 * bands) * uLight * (1.0 + 0.6 * (1.0 - vRim));
        gl_FragColor = vec4(col, alpha);
        #include <fog_fragment>
      }`,
  });
}

/**
 * Tornadoes. Out of the strongest thunderstorms of late spring and early
 * summer, over the open plains and grasslands, in the afternoon and
 * evening: one now and then touches down. There's warning first (see
 * `threat`): the sky going a sick green-black, hail, a roar growing out of
 * the storm. Then the funnel lowers out of a dark wall of cloud, touches
 * down in a whirl of dust and wreckage, and travels across the land (with
 * the storm, mostly from the south-west) for a few kilometres over some
 * minutes, before it thins to a rope and lifts. Where it goes it tears the
 * land up (see main's wreck): trees snapped and uprooted, the grass torn
 * away, anything built ripped apart and flung about.
 *
 * Its winds (see windAt) are a vortex: fastest at the edge of its core,
 * dying away outward; anything caught in the core is lifted and thrown.
 */
export class Tornadoes {
  constructor(scene) {
    this.scene = scene;
    this.group = new Group();
    this.group.name = 'tornado';
    this.group.visible = false;
    scene.add(this.group);
    // (The funnel; round its foot, the debris cloud; above, the slowly turning wall cloud it drops from.)
    const tube = new CylinderGeometry(1, 1, 1, 40, 48, true).translate(0, 0.5, 0);
    this.funnel = new Mesh(tube, funnelMaterial());
    this.funnel.frustumCulled = false;
    this.dust = new Mesh(tube, funnelMaterial({ dust: true }));
    this.dust.frustumCulled = false;
    this.dust.renderOrder = 1;
    const wall = new CylinderGeometry(1, 1.15, 1, 36, 4, false).translate(0, 0.5, 0);
    this.wallMaterial = new MeshLambertMaterial({ color: 0x3a3e40, transparent: true, opacity: 0.92, depthWrite: false });
    this.wall = new Mesh(wall, this.wallMaterial);
    this.wall.frustumCulled = false;
    this.debris = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshLambertMaterial({ vertexColors: false }), DEBRIS);
    this.debris.frustumCulled = false;
    const tints = [0x4a3a2a, 0x5a4a34, 0x3a4a26, 0x6a5a3a, 0x2a2a22, 0x7a6244];
    const c = new Color();
    for (let k = 0; k < DEBRIS; k++) this.debris.setColorAt(k, c.set(tints[k % tints.length]));
    this.group.add(this.wall, this.funnel, this.dust, this.debris);
    this.active = null; // { x0, z0, hx, hz, speed, R, life, born, seed, ... }
    this.time = 0;
    this.threat = 0; // (0..1: the warning signs of one on its way, or here: the green sky, hail)
    this.warned = false;
    this.light = new Color(0.5, 0.5, 0.5);
    this.rolled = false;
  }

  /**
   * One on its way: touching down at (x, z) in `delay` seconds and going
   * along `heading` (radians: 0 is +z) at `speed` m/s for `life` seconds,
   * its core `R` metres across (half that a radius) give or take.
   */
  spawn(x, z, heading, { speed = 12, life = 240, R = 45, delay = 45, seed = Math.floor(Math.random() * 1e9) } = {}) {
    this.active = { x0: x, z0: z, hx: Math.sin(heading), hz: Math.cos(heading), speed, life, R, born: this.time + delay, delay, seed, wobble: mulberry(seed)() * 6.28 };
    this.warned = false;
    return this.active;
  }

  /** Where it is (x, z), how wide its core (r), how strong (0..1: forming, full, roping out), at `t` seconds from its touchdown. */
  at(t, out = {}) {
    const a = this.active;
    // (Mostly straight with the storm, wandering a little to and fro.)
    const along = a.speed * t, side = Math.sin(t * 0.021 + a.wobble) * 60 + Math.sin(t * 0.067 + a.wobble * 2) * 18;
    out.x = a.x0 + a.hx * along + a.hz * side;
    out.z = a.z0 + a.hz * along - a.hx * side;
    const grow = smoothstep(0, 20, t), rope = smoothstep(a.life * 0.78, a.life, t);
    out.strength = grow * (1 - rope);
    // (Narrowest as it forms and as it ropes out: broadest in its prime.)
    out.r = a.R * 0.5 * (0.45 + 0.55 * grow) * (1 - 0.7 * rope) * (0.85 + 0.15 * Math.sin(t * 0.05 + a.wobble));
    return out;
  }

  /**
   * The wind of it at (x, z) (where you stand, `y` above the ground), as
   * { x, z (m/s, horizontal), up (m/s), core (0..1: how deep in it) }; or null.
   */
  windAt(x, z, out = {}) {
    const c = this.now;
    if (!c || c.strength <= 0) return null;
    const dx = x - c.x, dz = z - c.z, d = Math.hypot(dx, dz) || 0.01, R = c.r;
    const vmax = 75 * c.strength; // (an EF3 or so at its strongest)
    // (Turning anticlockwise, as they do in the north: fastest at the edge of
    // the core, falling away as one over the distance outside it; drawn in
    // toward it near the ground.)
    const vt = d < R ? (vmax * d) / R : (vmax * R) / d;
    const vr = -0.45 * vt * (d < R ? d / R : 1);
    out.x = (-dz / d) * vt + (dx / d) * vr;
    out.z = (dx / d) * vt + (dz / d) * vr;
    out.up = d < R * 1.1 ? 40 * c.strength * (1 - d / (R * 1.1)) : 0;
    out.core = d < R ? 1 - d / R : 0;
    out.d = d;
    out.R = R;
    return out;
  }

  /** For online play: the one there is, to send (see follow). */
  toJSON() {
    const a = this.active;
    if (!a) return null;
    return { x0: a.x0, z0: a.z0, hx: a.hx, hz: a.hz, speed: a.speed, life: a.life, R: a.R, seed: a.seed, age: +(this.time - a.born).toFixed(2) };
  }

  /** Online, not the host: theirs, where they have it. */
  follow(j) {
    if (!j) {
      if (this.active?.followed) this.active = null;
      return;
    }
    const a = this.active;
    if (a?.seed === j.seed) {
      a.born += ((this.time - j.age) - a.born) * 0.2; // (kept in step)
      return;
    }
    this.active = { ...j, born: this.time - j.age, wobble: mulberry(j.seed)() * 6.28, followed: true };
  }

  /**
   * @param ctx { camera, ground (x, z), light (Color), wind ({x, z}: the
   *   storm's drift, for its lean), wreck (x, z, r, strength, dir): what it
   *   tears up along its way (call often) }
   */
  update(dt, ctx) {
    dt *= this.timeScale ?? 1; // (for testing: hurried along)
    this.time += dt;
    const a = this.active;
    if (!a) {
      this.threat = Math.max(0, this.threat - dt / 30);
      this.group.visible = false;
      this.now = null;
      return;
    }
    const t = this.time - a.born;
    // Before it comes down: the warning signs build.
    this.threat = Math.min(1, Math.max(this.threat, t < 0 ? 1 - -t / Math.max(1, a.delay) : 1));
    if (t > a.life + 25) {
      this.active = null;
      this.now = null;
      this.group.visible = false;
      return;
    }
    const c = (this.now = this.at(Math.max(0, t), this.now ?? {}));
    if (t < 0) c.strength = 0;
    const g = ctx.ground(c.x, c.z);
    const groundY = Number.isFinite(g) ? g : 0;
    const top = Math.max(groundY + 260, 330); // (the cloud base)
    const form = smoothstep(-a.delay * 0.35, 6, t) * (1 - smoothstep(a.life, a.life + 20, t)); // (lowering, touching down; lifting off at the end)
    this.light.copy(ctx.light ?? this.light);
    const lean = { x: (ctx.wind?.x ?? 6) * 14, z: (ctx.wind?.z ?? 2) * 14 };
    const rope = smoothstep(a.life * 0.75, a.life, t);
    for (const [mesh, foot, topR, height, dense] of [
      [this.funnel, c.r * 0.5 * (1 - 0.6 * rope) + 2, Math.max(c.r * 1.7, 40) * (1 - 0.45 * rope), top - groundY, 1 - 0.5 * rope],
      [this.dust, c.r * 1.0 + 4, c.r * 1.45 + 10, 10 + c.r * 0.6, 0.85 * smoothstep(0, 10, t) * (1 - rope)],
    ]) {
      const u = mesh.material.uniforms;
      u.uTime.value = this.time;
      u.uBase.value.set(c.x, groundY - 2, c.z);
      u.uHeight.value = height;
      u.uFoot.value = foot;
      u.uTop.value = topR;
      u.uLean.value.set(lean.x * (1 + 2 * rope), 0, lean.z * (1 + 2 * rope)).multiplyScalar(mesh === this.dust ? 0.05 : 1);
      u.uForm.value = mesh === this.dust ? 1 : form;
      u.uFade.value = dense;
      u.uSpin.value = 0.6 + 0.6 * c.strength;
      u.uLight.value.copy(this.light).multiplyScalar(1.3);
    }
    this.dust.visible = t > 0;
    // The wall cloud: a dark, slowly turning shelf hanging under the storm where the funnel comes from.
    const wallR = 220 + a.R * 2;
    this.wall.position.set(c.x + lean.x, top - 40, c.z + lean.z);
    this.wall.scale.set(wallR, 45, wallR);
    this.wall.rotation.y = this.time * 0.05;
    this.wallMaterial.opacity = 0.9 * smoothstep(-a.delay, -a.delay * 0.4, t) * (1 - smoothstep(a.life, a.life + 25, t));
    this.wallMaterial.color.setRGB(0.24, 0.27, 0.27).multiply(this.light).multiplyScalar(1.4);
    // The debris whirling round its foot: up, round and out, falling away.
    const rand = mulberry(a.seed ^ 0x51ed);
    const heave = t > 0 ? c.strength : 0;
    for (let k = 0; k < DEBRIS; k++) {
      const r0 = rand(), r1 = rand(), r2 = rand(), size = 0.08 + rand() * rand() * rand() * 1.6;
      if (heave <= 0.02) {
        this.debris.setMatrixAt(k, m4.makeScale(0, 0, 0));
        continue;
      }
      const u = (this.time * (0.08 + 0.1 * r1) + r0) % 1; // (its journey: lifted, whirled, flung out)
      const rad = c.r * (0.5 + 0.9 * u + 0.6 * r2) + u * u * 40 * r1;
      const ang = r0 * 6.283 + this.time * (2.4 - 1.4 * u) * (0.8 + 0.4 * r2) * heave;
      const hgt = (u < 0.75 ? Math.pow(u / 0.75, 0.7) : 1 - (u - 0.75) * 3) * (25 + 70 * r1 * r1) * heave;
      p.set(c.x + Math.cos(ang) * rad, groundY + hgt, c.z + Math.sin(ang) * rad);
      q.setFromAxisAngle(e3.set(r1, r2, r0).normalize(), this.time * (3 + 5 * r2) + k);
      s.set(size, size * (r2 < 0.3 ? 0.15 : 0.5), size * (r2 < 0.3 ? 2.2 : 0.8)); // (some long and thin: splinters and branches)
      this.debris.setMatrixAt(k, m4.compose(p, q, s));
    }
    this.debris.instanceMatrix.needsUpdate = true;
    this.group.visible = true;
    // What it tears up as it goes (along its track, a few times a second).
    this.wreckWait = (this.wreckWait ?? 0) - dt;
    if (t > 2 && c.strength > 0.15 && this.wreckWait <= 0 && ctx.wreck) {
      this.wreckWait = 0.2;
      ctx.wreck(c.x, c.z, c.r, c.strength, { x: a.hx, z: a.hz });
    }
  }
}
