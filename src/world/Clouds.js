import { BufferAttribute, Color, Group, IcosahedronGeometry, InstancedMesh, Matrix4, MeshLambertMaterial, Object3D, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { hashSeed, mulberry32 } from '../noise/random.js';
import { paintCloudShadows } from '../render/cloudShadow.js';

const WHITE = new Color(0xffffff);
const BELLY = new Color(0xb9c6d8); // shaded underside
const STORM = new Color(0x464c56); // dark rain-cloud grey
const HIDDEN = new Matrix4().makeScale(0, 0, 0);
const here = { cover: 0, rain: 0, storm: 0 };
const tint = new Color();

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
        totalEmissiveRadiance *= vColor.r; // (a dark rain cloud glows less)
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
 * About a third are wispy and see-through. Their shadows slide across the
 * land out to the edge of the view (see cloudShadow: soft and dark under the
 * solid ones, faint under the wisps), and the solid ones block the sun (so
 * light shafts form around them).
 *
 * Clouds drift faster or slower with the wind, and keep clear of the land:
 * each one checks the ground under its footprint (and a little ahead) and
 * rises smoothly over mountains instead of passing through them.
 *
 * The weather decides how many are out: each cloud has a rank, and forms
 * (or dissolves) as the cover passes it. As the sky clouds over they swell
 * and sink into a low grey deck, darkest in a storm. The weather drifts in
 * with them: out upwind the clouds already show what's coming (see
 * Weather.at), so a change rolls in across the sky as a front, and the
 * rain hangs under the clouds that bring it (see Showers). At sunset they
 * catch the low sun (see addSunsetGlow).
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
    // (Drawn as instanced meshes, one for each shape and material: each
    // cloud is a placeholder whose matrix is copied in every frame.)
    const kinds = new Map();
    for (let i = 0; i < count; i++) {
      const wispy = rand() < 0.35;
      const shape = Math.floor(rand() * shapes.length);
      const cloud = new Object3D();
      const s = 0.8 + rand() * 1.4;
      cloud.scale.set(s * (1 + rand() * 0.6), s * (0.6 + rand() * 0.4), s);
      cloud.userData.scale = cloud.scale.clone();
      // Clouds form in order of rank as the sky clouds over (wisps first
      // and last, so thin cloud comes and goes before the heavy deck).
      cloud.userData.rank = wispy ? rand() * 0.55 : 0.03 + rand() * 0.95;
      cloud.rotation.y = rand() * Math.PI * 2;
      cloud.position.set((rand() - 0.5) * range, minHeight + rand() * (maxHeight - minHeight), (rand() - 0.5) * range);
      cloud.userData.x0 = cloud.position.x; // (where it started: it's there plus the drift, see update)
      cloud.userData.z0 = cloud.position.z;
      const box = shapes[shape].boundingBox;
      cloud.userData.baseY = cloud.position.y;
      cloud.userData.bottom = box.min.y * cloud.scale.y; // flat base, below the centre
      cloud.userData.reach = Math.max(-box.min.x, box.max.x, -box.min.z, box.max.z) * Math.max(cloud.scale.x, cloud.scale.z);
      cloud.userData.targetY = cloud.position.y;
      cloud.userData.wispy = wispy;
      // The weather this cloud brings (see update).
      cloud.userData.cover = 0.3;
      cloud.userData.rain = 0;
      cloud.userData.storm = 0;
      cloud.userData.overcast = 0;
      cloud.userData.ground = 0; // the land under it
      const key = `${shape}:${wispy}`;
      if (!kinds.has(key)) kinds.set(key, { shape, wispy, list: [] });
      cloud.userData.slot = kinds.get(key).list.length;
      kinds.get(key).list.push(cloud);
      this.clouds.push(cloud);
    }
    this.meshes = [];
    for (const { shape, wispy, list } of kinds.values()) {
      const mesh = new InstancedMesh(shapes[shape], wispy ? this.wispy : this.solid, list.length);
      mesh.castShadow = false; // (their shadows are painted: see cloudShadow)
      mesh.frustumCulled = false; // (spread right across the sky)
      mesh.renderOrder = wispy ? 2 : 0;
      mesh.name = 'clouds';
      for (const cloud of list) cloud.userData.mesh = mesh;
      for (let k = 0; k < list.length; k++) mesh.setColorAt(k, WHITE); // (each cloud greys with its own weather)
      this.meshes.push(mesh);
      this.group.add(mesh);
    }
    scene.add(this.group);
    this.materials = [this.solid, this.wispy];
    this.clearance = 18; // metres between a cloud's base and the ground below it
    this._next = 0;
    this.overcast = 0;
    // How far they've drifted, in seconds at full wind speed: every cloud
    // is where it started plus the wind times this (wrapped round you), so
    // online, with the host's drift, everyone has the same clouds overhead.
    this.travel = 0;
    this.travelTarget = null; // (online: the host's, eased towards)
  }

  /** Height a cloud needs so its base clears the land under and just ahead of it. */
  #targetHeight(cloud, generator) {
    // Heavy cloud hangs lower, and has swollen (see update).
    const overcast = cloud.userData.overcast;
    const baseY = cloud.userData.baseY - 75 * overcast;
    const reach = cloud.userData.reach * (1 + 1.1 * overcast);
    const bottom = cloud.userData.bottom * (1 + 0.5 * overcast);
    const p = cloud.position;
    const ahead = 25; // seconds of drift to look ahead
    let highest = -Infinity;
    for (const [ox, oz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7]]) {
      for (const t of [0, ahead]) {
        const x = p.x + ox * reach + this.wind.x * t;
        const z = p.z + oz * reach + this.wind.z * t;
        const h = generator.getBaseHeight(x, z);
        if (ox === 0 && oz === 0 && t === 0) cloud.userData.ground = h;
        highest = Math.max(highest, h);
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
    const speed = 0.25 * (0.25 + 0.75 * windStrength); // (a slow, lazy drift; they never stop entirely)
    const cover = sky ? sky.cover : 0.3;
    const storm = sky ? sky.storm : 0;
    this.overcast = Math.min(1, Math.max(0, (cover - 0.5) / 0.45));
    // The weather rides in on the clouds: each carries what it will be
    // like here once it has drifted overhead (or what it was like, once
    // it's gone by), so a front comes in from upwind as a wall of cloud,
    // swelling, sinking and darkening, the rain hanging under it.
    const wind = Math.hypot(this.wind.x, this.wind.z) || 1;
    const drift = wind * speed;
    const ease = Math.min(1, dt / 6); // (and no cloud changes in a blink as you move about)
    this.travel += speed * dt;
    if (this.travelTarget !== null) {
      this.travelTarget += speed * dt;
      const gap = this.travelTarget - this.travel;
      this.travel += Math.abs(gap) > 600 ? gap : gap * Math.min(1, dt * 0.3); // (a long way out: just there)
    }
    for (const cloud of this.clouds) {
      const d = cloud.userData;
      if (sky?.weather) {
        const upwind = -((cloud.position.x - focus.x) * this.wind.x + (cloud.position.z - focus.z) * this.wind.z) / wind;
        sky.weather.at(upwind / drift, here);
      } else Object.assign(here, { cover, rain: 0, storm });
      const k = d.generator === generator && !d.snap ? ease : 1; // (just wrapped round, out in the fog: no need to ease)
      d.snap = false;
      d.cover += (here.cover - d.cover) * k;
      d.rain += (here.rain - d.rain) * k;
      d.storm += (here.storm - d.storm) * k;
      d.overcast = Math.min(1, Math.max(0, (d.cover - 0.5) / 0.45));
      // Form or dissolve with the cover, and swell as it thickens.
      const grown = Math.min(1, Math.max(0, (d.cover - d.rank) / 0.08 + 0.5));
      cloud.visible = grown > 0.01;
      if (cloud.visible) {
        const base = d.scale;
        const k = (0.35 + 0.65 * grown) * (1 + 1.1 * d.overcast) * (1 + 0.45 * d.storm); // (a storm's clouds run together into a wall)
        cloud.scale.set(base.x * k, base.y * (0.35 + 0.65 * grown) * (1 + 0.5 * d.overcast), base.z * k);
      }
      const p = cloud.position;
      const wrap = (v, f) => f + ((((v - f + half) % this.range) + this.range) % this.range) - half;
      const nx = wrap(d.x0 + this.wind.x * this.travel, focus.x), nz = wrap(d.z0 + this.wind.z * this.travel, focus.z);
      const wrapped = Math.abs(nx - p.x) > half || Math.abs(nz - p.z) > half;
      p.x = nx;
      p.z = nz;
      if (wrapped) cloud.userData.snap = true;
      if (cloud.userData.generator !== generator) {
        cloud.userData.targetY = this.#targetHeight(cloud, generator);
        cloud.userData.generator = generator;
        p.y = cloud.userData.targetY;
      } else if (wrapped) cloud.userData.due = true; // (its height over the land there: worked out in a moment, below; out in the fog meanwhile)
      // Ease towards the height that clears the land.
      p.y += (cloud.userData.targetY - p.y) * Math.min(1, dt * 0.6);
    }
    // Re-check the land under a couple of clouds each frame (all of them
    // every second or two: the land's height is slow to work out).
    // (Those just wrapped round first, a few a frame, each jumping straight
    // to its height: still out of sight in the fog.)
    let due = 0;
    for (const cloud of this.clouds) {
      if (!cloud.userData.due || due >= 3) continue;
      due++;
      cloud.userData.due = false;
      cloud.position.y = cloud.userData.targetY = this.#targetHeight(cloud, generator);
    }
    for (let k = due; k < 2; k++) {
      const cloud = this.clouds[this._next];
      cloud.userData.targetY = this.#targetHeight(cloud, generator);
      this._next = (this._next + 1) % this.clouds.length;
    }
    // Into the instanced meshes (a cloud not formed yet shrinks to nothing).
    // Rain clouds are dark, each by its own weather.
    for (const cloud of this.clouds) {
      const d = cloud.userData;
      if (cloud.visible) {
        cloud.updateMatrix();
        tint.copy(WHITE).lerp(STORM, Math.min(1, 0.6 * d.overcast + 0.5 * d.storm));
        d.mesh.setColorAt(d.slot, tint);
      }
      d.mesh.setMatrixAt(d.slot, cloud.visible ? cloud.matrix : HIDDEN);
    }
    for (const mesh of this.meshes) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
    }
    // A little self-light in the sky's colour gives soft undersides by
    // day, pink-orange at sunset, dim blue at night.
    const dark = Math.min(1, 0.55 * this.overcast + 0.35 * storm);
    for (const m of this.materials) m.emissive.copy(skyGlow).multiplyScalar(0.3 * (1 - 0.6 * dark));
    // Their shadows on the land: sharp-edged in sunshine, gone under a lid of cloud.
    // (Every third frame: they drift a few centimetres a frame, over a map
    // of 20 m texels.)
    this._shadowFrame = ((this._shadowFrame ?? 0) + 1) % 3;
    if (sky?.lightDir && this._shadowFrame === 0) {
      const strength = 0.7 * Math.min(1, sky.lightStrength) * (1 - 0.9 * this.overcast);
      paintCloudShadows(this.clouds, focus, sky.lightDir, generator.getBaseHeight(focus.x, focus.z), this.range, strength);
    }
    // Sunset glow on the faces the sun lights, fading under a lid of cloud.
    if (sky) {
      this.glowUniforms.glow.value.copy(sky.glowColor);
      this.glowUniforms.glowStrength.value = sky.glowStrength * (1 - 0.8 * this.overcast) * 1.3;
      this.glowUniforms.sunView.value.copy(sky.sunDir).transformDirection(sky.viewMatrix);
    }
  }
}
