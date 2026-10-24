import {
  BoxGeometry,
  CylinderGeometry,
  Color,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshLambertMaterial,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  Vector3,
} from 'three';

const PRINTS = 900;
const DROPS = 500;
const RINGS = 80;
const CROWNS = 24;

// How long a print lasts (seconds) in each ground.
const LASTS = { snow: 180, mud: 120, sand: 90, grass: 100, blood: 200, dung: 600, twig: 500 };
// Shapes of print: a boot, a cloven hoof, a paw, a rabbit's long hind foot
// (each blocky, cut square like the animals' feet).
export const PRINT = { boot: 0, hoof: 1, paw: 2, rabbit: 3, square: 4 };

const m4 = new Matrix4(), q = new Quaternion(), spin = new Quaternion(), p = new Vector3(), s = new Vector3(), n = new Vector3();
const UP = new Vector3(0, 1, 0);

/**
 * Traces of things passing: footprints pressed into snow, sand and mud
 * (the player's boots, the hooves of the deer and bison, a bear's paws, a
 * rabbit's hops), fading away over a few minutes; and splashes where
 * feet, hooves or a leaping fish break the water, with rings spreading
 * over its surface.
 */
export class Traces {
  constructor(scene) {
    // --- Footprints: flat marks laid on the ground, each its shape cut out
    // (in the shader) and fading as it ages.
    const plane = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.uniforms = { uTime: { value: 0 } };
    const printMaterial = new MeshLambertMaterial({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    printMaterial.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec3 aPrint;\nvarying vec3 vPrint;\nvarying vec2 vPrintUv;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPrint = aPrint;\nvPrintUv = uv * 2.0 - 1.0;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying vec3 vPrint;\nvarying vec2 vPrintUv;')
        .replace(
          '#include <alphatest_fragment>',
          /* glsl */ `{
            // aPrint: when it was made, how long it lasts, its shape.
            vec2 u = vPrintUv;
            float shape = vPrint.z, inside = 0.0;
            // (Every shape blocky, cut square like the feet that made it: see
            // the animals' models, each foot a block.)
            #define BOX(c, h) step(max(abs(u.x - (c).x) / (h).x, abs(u.y - (c).y) / (h).y), 1.0)
            if (shape > 3.5) {
              // A square-cut hollow: a big flat foot (an elephant's, a hippo's), a snake's trail.
              inside = BOX(vec2(0.0), vec2(0.92));
            } else if (shape < 0.5) {
              // A boot: the sole and the heel, a gap at the instep.
              inside = BOX(vec2(0.0, 0.3), vec2(0.55, 0.65)) + BOX(vec2(0.0, -0.72), vec2(0.5, 0.26));
            } else if (shape < 1.5) {
              // A cloven hoof: two blocks side by side, a gap between.
              inside = BOX(vec2(0.47, 0.0), vec2(0.33, 0.9)) + BOX(vec2(-0.47, 0.0), vec2(0.33, 0.9));
            } else if (shape < 2.5) {
              // A paw: the square pad, and four square toes ahead of it.
              inside = BOX(vec2(0.0, -0.3), vec2(0.5, 0.42));
              for (int k = 0; k < 4; k++) {
                float x = -0.6 + 0.4 * float(k);
                inside += BOX(vec2(x, 0.5 - 0.12 * abs(x)), vec2(0.15, 0.17));
              }
            } else {
              // A rabbit's long hind foot.
              inside = BOX(vec2(0.0), vec2(0.45, 0.95));
            }
            if (inside < 0.5) discard;
            float age = uTime - vPrint.x;
            diffuseColor.a *= 0.9 * (1.0 - smoothstep(vPrint.y * 0.6, vPrint.y, age)) * smoothstep(0.0, 0.15, age);
          }
          #include <alphatest_fragment>`,
        );
    };
    printMaterial.customProgramCacheKey = () => 'footprints';
    this.prints = new InstancedMesh(plane, printMaterial, PRINTS);
    this.prints.instanceMatrix.setUsage(DynamicDrawUsage);
    this.printInfo = new InstancedBufferAttribute(new Float32Array(PRINTS * 3).fill(-1e6), 3);
    plane.setAttribute('aPrint', this.printInfo);
    for (let k = 0; k < PRINTS; k++) this.prints.setMatrixAt(k, m4.makeScale(0, 0, 0));
    this.prints.setColorAt(0, new Color());
    this.prints.frustumCulled = false;
    this.prints.renderOrder = 1;
    this.prints.name = 'footprints';
    scene.add(this.prints);
    this.nextPrint = 0;

    // --- Splashes: drops thrown up out of the water, falling back.
    this.drops = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshLambertMaterial({ color: 0xeef6f8, transparent: true, opacity: 0.85 }), DROPS);
    this.drops.instanceMatrix.setUsage(DynamicDrawUsage);
    this.drops.frustumCulled = false;
    this.drops.count = 0;
    this.drops.name = 'splashes';
    scene.add(this.drops);
    this.dropList = [];

    // --- The crown of a splash: a thin sheet of water thrown up in a ring,
    // rising and falling back (white with foam).
    this.crowns = new InstancedMesh(new CylinderGeometry(0.75, 0.45, 1, 10, 1, true).translate(0, 0.5, 0), new MeshLambertMaterial({ color: 0xf2f8fa, transparent: true, opacity: 0.7, depthWrite: false }), CROWNS);
    this.crowns.instanceMatrix.setUsage(DynamicDrawUsage);
    this.crowns.frustumCulled = false;
    this.crowns.count = 0;
    this.crowns.name = 'splash crowns';
    scene.add(this.crowns);
    this.crownList = [];
    this.later = []; // ripples to come: { at, x, level, z, size }

    // --- Rings spreading over the water.
    this.ringUniforms = { uTime: { value: 0 } };
    const ringGeometry = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.ringInfo = new InstancedBufferAttribute(new Float32Array(RINGS * 2).fill(-1e6), 2);
    ringGeometry.setAttribute('aRing', this.ringInfo);
    this.rings = new InstancedMesh(
      ringGeometry,
      new ShaderMaterial({
        uniforms: this.ringUniforms,
        transparent: true,
        depthWrite: false,
        vertexShader: /* glsl */ `
          attribute vec2 aRing; // when, how big it grows
          uniform float uTime;
          varying vec2 vUv;
          varying float vAge;
          void main() {
            vUv = uv * 2.0 - 1.0;
            vAge = (uTime - aRing.x) / 1.6;
            float grow = aRing.y * (0.15 + sqrt(clamp(vAge, 0.0, 1.0)));
            vec3 pos = position * grow * 2.0;
            gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(pos, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          varying vec2 vUv;
          varying float vAge;
          void main() {
            if (vAge < 0.0 || vAge > 1.0) discard;
            float r = length(vUv);
            float ring = smoothstep(0.78, 0.9, r) * (1.0 - smoothstep(0.9, 1.0, r));
            gl_FragColor = vec4(vec3(0.93, 0.97, 1.0), ring * 0.55 * (1.0 - vAge));
          }`,
      }),
      RINGS,
    );
    this.rings.frustumCulled = false;
    this.rings.renderOrder = 3;
    this.rings.name = 'ripples';
    for (let k = 0; k < RINGS; k++) this.rings.setMatrixAt(k, m4.makeScale(0, 0, 0));
    scene.add(this.rings);
    this.nextRing = 0;
    this.time = 0;
    this.dirty = { prints: false, rings: false };
  }

  /**
   * A footprint at (x, y, z) facing `heading`, of `shape` (see PRINT) and
   * `size` (m, its length), pressed into ground `kind` (snow, sand, mud)
   * of colour `colour`, tipped to the ground's slope `normal`.
   */
  print(x, y, z, heading, shape, size, kind, colour, normal = UP) {
    const k = this.nextPrint;
    this.nextPrint = (k + 1) % PRINTS;
    q.setFromUnitVectors(UP, n.copy(normal).normalize()).multiply(spin.setFromAxisAngle(UP, heading));
    p.set(x, y + 0.03, z);
    s.set(size * (shape === PRINT.rabbit ? 0.45 : 0.62), 1, size);
    this.prints.setMatrixAt(k, m4.compose(p, q, s));
    this.prints.setColorAt(k, colour);
    this.printInfo.setXYZ(k, this.time, LASTS[kind] ?? 90, shape);
    this.dirty.prints = true;
  }

  /**
   * A splash at (x, level, z): `n` drops thrown up at `speed` (m/s), out in
   * a ring and falling back (each rings the water where it lands); a crown
   * of water thrown up round it (bigger the harder the splash), and the
   * rings spreading, one after another.
   */
  splash(x, level, z, n = 8, speed = 2.2, ring = 0.8) {
    for (let k = 0; k < n && this.dropList.length < DROPS; k++) {
      const a = Math.random() * Math.PI * 2, out = (0.3 + Math.random() * 0.7) * speed * 0.45;
      const big = Math.random() < 0.3;
      this.dropList.push({
        x: x + Math.cos(a) * 0.15, y: level + 0.05, z: z + Math.sin(a) * 0.15,
        vx: Math.cos(a) * out, vy: speed * (0.6 + Math.random() * 0.6), vz: Math.sin(a) * out,
        size: (big ? 0.06 : 0.03) + Math.random() * 0.04 * Math.min(2, speed / 2), level, rings: big && speed > 1.5,
      });
    }
    if (speed > 1.1 && this.crownList.length < CROWNS) this.crownList.push({ x, level, z, t: 0, size: Math.min(2.2, 0.2 + speed * 0.14), life: 0.25 + speed * 0.05 });
    if (ring > 0) {
      this.ripple(x, level, z, ring);
      this.later.push({ at: this.time + 0.35, x, level, z, size: ring * 0.7 });
      if (speed > 2) this.later.push({ at: this.time + 0.7, x, level, z, size: ring * 0.5 });
    }
  }

  /** A ring spreading out over the water from (x, level, z), to `size` metres across. */
  ripple(x, level, z, size = 0.8) {
    const k = this.nextRing;
    this.nextRing = (k + 1) % RINGS;
    this.rings.setMatrixAt(k, m4.makeTranslation(x, level + 0.06, z));
    this.ringInfo.setXY(k, this.time, size);
    this.dirty.rings = true;
  }

  update(dt) {
    this.time += dt;
    this.uniforms.uTime.value = this.time;
    this.ringUniforms.uTime.value = this.time;
    if (this.dirty.prints) {
      this.prints.instanceMatrix.needsUpdate = true;
      this.prints.instanceColor.needsUpdate = true;
      this.printInfo.needsUpdate = true;
    }
    if (this.dirty.rings) {
      this.rings.instanceMatrix.needsUpdate = true;
      this.ringInfo.needsUpdate = true;
    }
    this.dirty.prints = this.dirty.rings = false;
    // Ripples to come.
    if (this.later.length) {
      for (const r of this.later) if (r.at <= this.time) this.ripple(r.x, r.level, r.z, r.size);
      this.later = this.later.filter((r) => r.at > this.time);
    }
    // The drops fly (drawn out along the way they go), and fall back
    // into the water (the bigger ones ringing it).
    let live = 0;
    for (const d of this.dropList) {
      d.vy -= 9.8 * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.z += d.vz * dt;
      if (d.y < d.level && d.vy < 0) {
        if (d.rings) this.ripple(d.x, d.level, d.z, 0.25);
        continue;
      }
      this.dropList[live++] = d;
      const v = Math.hypot(d.vx, d.vy, d.vz) || 1;
      q.setFromUnitVectors(UP, n.set(d.vx / v, d.vy / v, d.vz / v));
      this.drops.setMatrixAt(live - 1, m4.compose(p.set(d.x, d.y, d.z), q, s.set(d.size * 0.8, d.size * (1 + v * 0.12), d.size * 0.8)));
    }
    this.dropList.length = live;
    this.drops.count = live;
    if (live) this.drops.instanceMatrix.needsUpdate = true;
    // The crowns rise and fall back.
    let c = 0;
    for (const k of this.crownList) {
      k.t += dt;
      const u = k.t / k.life;
      if (u >= 1) continue;
      this.crownList[c++] = k;
      const h = Math.sin(Math.PI * Math.min(1, u * 1.3)) * k.size * 0.6, w = k.size * (0.4 + 0.6 * u);
      this.crowns.setMatrixAt(c - 1, m4.compose(p.set(k.x, k.level - 0.02, k.z), q.identity(), s.set(w, Math.max(0.001, h), w)));
    }
    this.crownList.length = c;
    this.crowns.count = c;
    if (c) this.crowns.instanceMatrix.needsUpdate = true;
  }
}
