import { BufferAttribute, Color, Group, IcosahedronGeometry, Mesh, MeshLambertMaterial, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { hashSeed, mulberry32 } from '../noise/random.js';

const WHITE = new Color(0xffffff);
const BELLY = new Color(0xb9c6d8); // shaded underside
const STORM = new Color(0x5c636e); // dark rain-cloud grey

/**
 * One low-poly cumulus: a row of lumpy icosahedron puffs with their bottoms
 * sliced flat, coloured per face from a blue-grey belly to a white top.
 */
function cloudGeometry(rand) {
  const puffs = [];
  const count = 4 + Math.floor(rand() * 5);
  const length = 40 + rand() * 60;
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const middle = 1 - Math.abs(t - 0.5) * 1.4; // bigger puffs in the middle
    const r = (10 + rand() * 10) * (0.6 + 0.6 * middle);
    const g = new IcosahedronGeometry(r, 0);
    const pos = g.attributes.position;
    for (let k = 0; k < pos.count; k++) {
      // Lumps hashed from the corner position so shared corners move together.
      const x = pos.getX(k), y = pos.getY(k), z = pos.getZ(k);
      const h = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + i * 4.1) * 43758.5453;
      const s = 0.85 + (h - Math.floor(h)) * 0.3;
      pos.setXYZ(k, x * s, Math.max(y * s, -r * 0.3), z * s); // flat base
    }
    g.translate((t - 0.5) * length, (rand() - 0.3) * r * 0.5 + middle * r * 0.3, (rand() - 0.5) * r * 0.9);
    g.deleteAttribute('uv');
    puffs.push(g);
  }
  const g = mergeGeometries(puffs);
  g.computeVertexNormals();
  g.computeBoundingBox();

  const { min, max } = g.boundingBox;
  const pos = g.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new Color();
  for (let f = 0; f < pos.count; f += 3) {
    const cy = (pos.getY(f) + pos.getY(f + 1) + pos.getY(f + 2)) / 3;
    const t = Math.pow((cy - min.y) / (max.y - min.y), 0.7);
    c.copy(BELLY).lerp(WHITE, t).multiplyScalar(0.95 + rand() * 0.08);
    for (let k = 0; k < 3; k++) colors.set([c.r, c.g, c.b], (f + k) * 3);
  }
  g.setAttribute('color', new BufferAttribute(colors, 3));
  return g;
}

/**
 * Makes a cloud material glow where the low sun lights it: `uniforms.glow`
 * (colour) times `uniforms.glowStrength`, on the faces turned towards the
 * sun (`uniforms.sunView`, the sun's direction in view space). At sunset
 * that lights their undersides orange, red, pink and purple.
 */
function addSunsetGlow(material, uniforms) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 glow;\nuniform float glowStrength;\nuniform vec3 sunView;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float towardSun = smoothstep(-0.45, 0.65, dot(normal, sunView));
        totalEmissiveRadiance += glow * glowStrength * (0.12 + 0.88 * towardSun) * (0.55 + 0.45 * diffuseColor.r);`,
      );
  };
  material.customProgramCacheKey = () => 'cloud-glow';
}

/**
 * A field of drifting low-poly clouds around the camera.
 *
 * Clouds live in a square `range` metres across centred on the camera and
 * wrap around when they drift off one side, so the sky never runs out.
 * Fog swallows them near the wrap distance, so you never see one pop.
 * About a third are wispy and see-through; the solid ones cast moving
 * shadows on the land and block the sun (so light shafts form around them).
 *
 * Clouds drift faster or slower with the wind, and keep clear of the land:
 * each one checks the ground under its footprint (and a little ahead) and
 * rises smoothly over mountains instead of passing through them.
 *
 * The weather decides how many are out: each cloud has a rank, and forms
 * (or dissolves) as the cover passes it. As the sky clouds over they swell
 * and sink into a low grey deck, darkest in a storm. At sunset they catch
 * the low sun (see addSunsetGlow).
 */
export class Clouds {
  constructor(scene, { seed = 'clouds', count = 150, range = 2600, minHeight = 170, maxHeight = 310 } = {}) {
    this.range = range;
    this.wind = { x: 5.5, z: 1.8 }; // m/s

    this.solid = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.wispy = new MeshLambertMaterial({
      vertexColors: true,
      flatShading: true,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    });
    this.glowUniforms = { glow: { value: new Color() }, glowStrength: { value: 0 }, sunView: { value: new Vector3(0, 1, 0) } };
    addSunsetGlow(this.solid, this.glowUniforms);
    addSunsetGlow(this.wispy, this.glowUniforms);
    this.cover = 0.3;

    const rand = mulberry32(hashSeed(seed));
    const shapes = Array.from({ length: 10 }, () => cloudGeometry(rand));

    this.group = new Group();
    this.group.name = 'clouds';
    this.clouds = [];
    for (let i = 0; i < count; i++) {
      const wispy = rand() < 0.35;
      const mesh = new Mesh(shapes[Math.floor(rand() * shapes.length)], wispy ? this.wispy : this.solid);
      const s = 0.8 + rand() * 1.4;
      mesh.scale.set(s * (1 + rand() * 0.6), s * (0.6 + rand() * 0.4), s);
      mesh.userData.scale = mesh.scale.clone();
      // Clouds form in order of rank as the sky clouds over (wisps first
      // and last, so thin cloud comes and goes before the heavy deck).
      mesh.userData.rank = wispy ? rand() * 0.55 : 0.03 + rand() * 0.95;
      mesh.rotation.y = rand() * Math.PI * 2;
      mesh.position.set((rand() - 0.5) * range, minHeight + rand() * (maxHeight - minHeight), (rand() - 0.5) * range);
      mesh.castShadow = !wispy;
      const box = mesh.geometry.boundingBox;
      mesh.userData.baseY = mesh.position.y;
      mesh.userData.bottom = box.min.y * mesh.scale.y; // flat base, below the centre
      mesh.userData.reach = Math.max(-box.min.x, box.max.x, -box.min.z, box.max.z) * Math.max(mesh.scale.x, mesh.scale.z);
      mesh.userData.targetY = mesh.position.y;
      mesh.renderOrder = wispy ? 2 : 0;
      this.group.add(mesh);
      this.clouds.push(mesh);
    }
    scene.add(this.group);
    this.materials = [this.solid, this.wispy];
    this.clearance = 18; // metres between a cloud's base and the ground below it
    this._next = 0;
    this.overcast = 0;
  }

  /** Height a cloud needs so its base clears the land under and just ahead of it. */
  #targetHeight(cloud, generator) {
    // Heavy cloud hangs lower, and has swollen (see update).
    const baseY = cloud.userData.baseY - 75 * this.overcast;
    const reach = cloud.userData.reach * (1 + 1.1 * this.overcast);
    const bottom = cloud.userData.bottom * (1 + 0.5 * this.overcast);
    const p = cloud.position;
    const ahead = 25; // seconds of drift to look ahead
    let highest = -Infinity;
    for (const [ox, oz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7]]) {
      for (const t of [0, ahead]) {
        const x = p.x + ox * reach + this.wind.x * t;
        const z = p.z + oz * reach + this.wind.z * t;
        highest = Math.max(highest, generator.getHeight(x, z));
      }
    }
    return Math.max(baseY, highest + this.clearance - bottom);
  }

  /**
   * @param dt       seconds
   * @param focus    camera position (clouds wrap around it)
   * @param skyGlow  colour the clouds pick up from the sky (e.g. the horizon)
   */
  update(dt, focus, skyGlow, generator, windStrength = 1, sky = null) {
    const half = this.range / 2;
    const speed = 0.25 + 0.75 * windStrength; // clouds never stop entirely
    const cover = sky ? sky.cover : 0.3;
    const storm = sky ? sky.storm : 0;
    this.overcast = Math.min(1, Math.max(0, (cover - 0.5) / 0.45));
    const swell = 1 + 1.1 * this.overcast;
    for (const cloud of this.clouds) {
      // Form or dissolve with the cover, and swell as it thickens.
      const grown = Math.min(1, Math.max(0, (cover - cloud.userData.rank) / 0.08 + 0.5));
      cloud.visible = grown > 0.01;
      if (cloud.visible) {
        const base = cloud.userData.scale;
        const k = (0.35 + 0.65 * grown) * swell;
        cloud.scale.set(base.x * k, base.y * (0.35 + 0.65 * grown) * (1 + 0.5 * this.overcast), base.z * k);
      }
      const p = cloud.position;
      p.x += this.wind.x * speed * dt;
      p.z += this.wind.z * speed * dt;
      let wrapped = false;
      if (p.x - focus.x > half) (p.x -= this.range), (wrapped = true);
      else if (p.x - focus.x < -half) (p.x += this.range), (wrapped = true);
      if (p.z - focus.z > half) (p.z -= this.range), (wrapped = true);
      else if (p.z - focus.z < -half) (p.z += this.range), (wrapped = true);
      if (wrapped || cloud.userData.generator !== generator) {
        cloud.userData.targetY = this.#targetHeight(cloud, generator);
        cloud.userData.generator = generator;
        p.y = cloud.userData.targetY; // out of sight in the fog, so just jump
      }
      // Ease towards the height that clears the land.
      p.y += (cloud.userData.targetY - p.y) * Math.min(1, dt * 0.6);
    }
    // Re-check the land under a few clouds each frame.
    for (let k = 0; k < 6; k++) {
      const cloud = this.clouds[this._next];
      cloud.userData.targetY = this.#targetHeight(cloud, generator);
      this._next = (this._next + 1) % this.clouds.length;
    }
    // Rain clouds are dark; a little self-light in the sky's colour gives
    // soft undersides by day, pink-orange at sunset, dim blue at night.
    const dark = Math.min(1, 0.55 * this.overcast + 0.35 * storm);
    for (const m of this.materials) {
      m.color.set(0xffffff).lerp(STORM, dark);
      m.emissive.copy(skyGlow).multiplyScalar(0.3 * (1 - 0.6 * dark));
    }
    // Sunset glow on the faces the sun lights, fading under a lid of cloud.
    if (sky) {
      this.glowUniforms.glow.value.copy(sky.glowColor);
      this.glowUniforms.glowStrength.value = sky.glowStrength * (1 - 0.8 * this.overcast) * 1.3;
      this.glowUniforms.sunView.value.copy(sky.sunDir).transformDirection(sky.viewMatrix);
    }
  }
}
