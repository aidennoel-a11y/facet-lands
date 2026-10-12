import {
  AdditiveBlending,
  CanvasTexture,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  OctahedronGeometry,
  PointLight,
  Quaternion,
  Sprite,
  SpriteMaterial,
  Vector3,
} from 'three';

const UP = new Vector3(0, 1, 0);
const FLAME_HEIGHT = 0.78; // flame centre above the torch's base, along the stick

function glowTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  // (A soft warm haze, no hard white core: looked at straight on in the
  // dark of a cave it mustn't blind you.)
  g.addColorStop(0, 'rgba(255,190,110,0.55)');
  g.addColorStop(0.3, 'rgba(255,150,70,0.25)');
  g.addColorStop(1, 'rgba(255,110,40,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new CanvasTexture(canvas);
}

/**
 * Placeable torches.
 *
 * Each torch is a low-poly stick with a pitch-soaked head; set down, it's
 * cold until it's lit (with flint and steel, or a torch you're carrying),
 * then it burns with a flickering two-layer flame and a soft glow. Real light comes from a fixed pool of point lights handed to
 * the torches nearest the camera every frame: the number of lights never
 * changes, so placing torches never makes the renderer recompile shaders,
 * and hundreds of torches cost no more than a few.
 *
 * Torches are saved per world seed in this browser (localStorage).
 */
export class Torches {
  constructor(scene, { maxLights = 6 } = {}) {
    this.scene = scene;
    this.torches = [];
    this.seed = null;

    this.stickGeometry = new CylinderGeometry(0.045, 0.06, 0.7, 5).translate(0, 0.35, 0);
    this.headGeometry = new CylinderGeometry(0.09, 0.07, 0.16, 6).translate(0, 0.72, 0);
    this.outerFlame = new OctahedronGeometry(0.15, 0).scale(1, 1.6, 1);
    this.innerFlame = new OctahedronGeometry(0.08, 0).scale(1, 1.5, 1);
    this.stickMaterial = new MeshLambertMaterial({ color: 0x6b4a2f, flatShading: true });
    this.headMaterial = new MeshLambertMaterial({ color: 0x2e2620, flatShading: true });
    this.outerMaterial = new MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.9 });
    this.innerMaterial = new MeshBasicMaterial({ color: 0xffd070 });
    // A crystal lamp: crystals in an iron ring on a stone, glowing cold blue of themselves, for ever.
    this.lampBase = new CylinderGeometry(0.16, 0.2, 0.12, 6).translate(0, 0.06, 0);
    this.lampCrystal = new OctahedronGeometry(0.12, 0).scale(0.7, 2.2, 0.7).translate(0, 0.38, 0);
    this.lampCrystal2 = new OctahedronGeometry(0.08, 0).scale(0.7, 2, 0.7).rotateZ(0.4).translate(0.08, 0.28, 0.03);
    this.lampBaseMaterial = new MeshLambertMaterial({ color: 0x5a5058, flatShading: true });
    this.lampMaterial = new MeshBasicMaterial({ color: 0xa8ecff, transparent: true, opacity: 0.92 });
    this.lampGlowMaterial = new SpriteMaterial({ map: glowTexture(), color: 0x7ac8ff, blending: AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.6 });
    this.glowMaterial = new SpriteMaterial({
      map: glowTexture(),
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
      opacity: 0.7,
    });

    this.lights = [];
    for (let i = 0; i < maxLights; i++) {
      const light = new PointLight(0xffa24a, 0, 26, 1.35);
      light.position.set(0, -10000, 0);
      scene.add(light);
      this.lights.push(light);
    }
    this._flame = new Vector3();
    // How many of the lights are switched on at all: 0, a few, or all of
    // them (see #setTier). Each light switched on costs every lit pixel on
    // the screen its sum, used or not, so in the plain day, with no fire
    // about, none are.
    this.tier = maxLights;
    this.tiers = [0, Math.min(4, maxLights), maxLights];
    this.fewerSince = 0;
    this.#setTier(0);
  }

  #setTier(n) {
    if (n === this.tier) return;
    this.tier = n;
    this.lights.forEach((light, i) => (light.visible = i < n));
  }

  /**
   * Has the drawing of everything made ready for each number of lights, so
   * a fire lit later doesn't stall a frame while it's made ready then.
   */
  prewarm(renderer, scene, camera) {
    const was = this.tier;
    for (const n of this.tiers) {
      if (n === was) continue;
      this.#setTier(n);
      // (Handed to the graphics driver to finish in the background where it
      // can: no freeze while it's done.)
      if (renderer.compileAsync) renderer.compileAsync(scene, camera).catch(() => {});
      else renderer.compile(scene, camera);
    }
    this.#setTier(was);
  }

  get count() {
    return this.torches.length;
  }

  /**
   * Puts a torch at `point` on a surface facing `normal` (cold, unless
   * `lit`). On the ground it stands up; on a wall it leans out. Returns null
   * for ceilings.
   */
  place(point, normal, save = true, lit = false, lamp = false) {
    if (normal.y < -0.3) return null;
    if (lamp === true || lamp === 'lamp') return this.#placeLamp(point, normal, save);
    const coal = lamp === 'coal'; // (a coal torch: a white-hot flame, lighting twice as far)
    const lean = normal.y > 0.7 ? UP.clone() : normal.clone().multiplyScalar(0.55).add(UP).normalize();

    const group = new Group();
    group.name = 'torch';
    group.position.copy(point).addScaledVector(normal, normal.y > 0.7 ? -0.05 : -0.08);
    group.quaternion.copy(new Quaternion().setFromUnitVectors(UP, lean));

    const stick = new Mesh(this.stickGeometry, this.stickMaterial);
    stick.castShadow = true;
    const head = new Mesh(this.headGeometry, this.headMaterial);
    const outer = new Mesh(this.outerFlame, this.outerMaterial);
    const inner = new Mesh(this.innerFlame, this.innerMaterial);
    outer.position.y = inner.position.y = FLAME_HEIGHT + 0.08;
    const glow = new Sprite(this.glowMaterial);
    glow.position.y = FLAME_HEIGHT + 0.1;
    glow.scale.setScalar(1.6);
    group.add(stick, head, outer, inner, glow);
    this.scene.add(group);
    group.updateMatrixWorld(true);

    if (coal) {
      head.material = this.coalHeadMaterial ??= new MeshLambertMaterial({ color: 0x141210, flatShading: true });
      outer.material = this.coalOuterMaterial ??= new MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.9 });
      inner.material = this.coalInnerMaterial ??= new MeshBasicMaterial({ color: 0xffffff });
      glow.scale.setScalar(2.2);
    }
    const torch = { group, outer, inner, glow, coal, phase: Math.random() * 100, point: point.clone(), normal: normal.clone(), lit };
    outer.visible = inner.visible = glow.visible = lit;
    this.torches.push(torch);
    if (save) this.#save();
    return torch;
  }

  #placeLamp(point, normal, save) {
    const group = new Group();
    group.name = 'crystal lamp';
    group.position.copy(point).addScaledVector(normal, -0.03);
    if (normal.y < 0.7) group.quaternion.setFromUnitVectors(UP, normal.clone().multiplyScalar(0.6).add(UP).normalize());
    const base = new Mesh(this.lampBase, this.lampBaseMaterial);
    const a = new Mesh(this.lampCrystal, this.lampMaterial), b = new Mesh(this.lampCrystal2, this.lampMaterial);
    const glow = new Sprite(this.lampGlowMaterial);
    glow.position.y = 0.4;
    glow.scale.setScalar(1.3);
    group.add(base, a, b, glow);
    this.scene.add(group);
    group.updateMatrixWorld(true);
    const t = { group, glow, lamp: true, lit: true, phase: Math.random() * 100, point: point.clone(), normal: normal.clone(), outer: glow, inner: glow };
    this.torches.push(t);
    if (save) this.#save();
    return t;
  }

  /** The torch nearest a ray (within `reach`, near enough to it), or null. */
  alongRay(origin, direction, reach, tolerance = 0.5) {
    let best = null, bestD = tolerance;
    const c = new Vector3();
    for (const t of this.torches) {
      t.group.localToWorld(c.set(0, 0.6, 0));
      const ox = c.x - origin.x, oy = c.y - origin.y, oz = c.z - origin.z;
      const along = ox * direction.x + oy * direction.y + oz * direction.z;
      if (along < 0 || along > reach) continue;
      const off = Math.sqrt(Math.max(0, ox * ox + oy * oy + oz * oz - along * along));
      if (off < bestD) (bestD = off), (best = t);
    }
    return best;
  }

  /** Lights a torch (or puts it out). */
  light(t, lit = true) {
    if (t.lamp) return; // (a lamp's always alight)
    t.lit = lit;
    t.outer.visible = t.inner.visible = t.glow.visible = lit;
    this.#save();
  }

  /** Removes the torch closest to `point` within `radius`; returns true if one went. */
  removeNear(point, radius = 1.6) {
    let best = null;
    let bestD = radius;
    for (const t of this.torches) {
      const d = t.group.position.distanceTo(point);
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    if (!best) return false;
    this.scene.remove(best.group);
    this.torches.splice(this.torches.indexOf(best), 1);
    this.#save();
    return true;
  }

  /** Removes the torch nearest to a ray (e.g. where you click), if any is close enough to it. */
  removeAlongRay(ray, reach, tolerance = 0.7) {
    let best = null;
    let bestD = tolerance * tolerance;
    const centre = new Vector3();
    for (const t of this.torches) {
      t.group.localToWorld(centre.set(0, 0.5, 0));
      if (centre.distanceTo(ray.origin) > reach) continue;
      const d = ray.distanceSqToPoint(centre);
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    if (!best) return false;
    return this.removeNear(best.group.position, 0.01);
  }

  /** A torch's name online: where it is. */
  static key(t) {
    return `${t.point.x.toFixed(2)}:${t.point.y.toFixed(2)}:${t.point.z.toFixed(2)}`;
  }

  /** The torches as records: [{ k, p: [x, y, z, nx, ny, nz], lit }] (online: see WorldSync). */
  records() {
    return this.torches.map((t) => ({ k: Torches.key(t), p: [t.point.x, t.point.y, t.point.z, t.normal.x, t.normal.y, t.normal.z].map((v) => +v.toFixed(3)), lit: !!t.lit, lamp: t.lamp ? true : t.coal ? 'coal' : false }));
  }

  /** A torch as someone else has it (online): put up, or lit or put out. */
  apply(rec) {
    const [x, y, z, nx, ny, nz] = rec.p;
    const point = new Vector3(x, y, z);
    const t = this.torches.find((t) => t.point.distanceTo(point) < 0.02);
    if (t) {
      if (!!t.lit !== !!rec.lit) this.light(t, !!rec.lit);
    } else this.place(point, new Vector3(nx, ny, nz), true, !!rec.lit, rec.lamp === 'coal' ? 'coal' : !!rec.lamp);
  }

  /** Takes a torch down by its key (someone else did, online). */
  removeKey(key) {
    const t = this.torches.find((t) => Torches.key(t) === key);
    if (t) this.removeNear(t.group.position, 0.01);
  }

  /** Swaps to the saved torches of another world. */
  loadWorld(seed) {
    for (const t of this.torches) this.scene.remove(t.group);
    this.torches = [];
    this.seed = seed;
    let saved = [];
    try {
      saved = JSON.parse(localStorage.getItem(`facet-lands:torches:${seed}`) || '[]');
    } catch {
      saved = [];
    }
    for (const [x, y, z, nx, ny, nz, lit = 1, lamp = 0] of saved) this.place(new Vector3(x, y, z), new Vector3(nx, ny, nz), false, !!lit, lamp === 2 ? 'coal' : !!lamp);
  }

  /** Forgets this world's torches (a survival life that's over: see Game.#die). */
  clearWorld() {
    try {
      localStorage.removeItem(`facet-lands:torches:${this.seed}`);
    } catch {
      // (Nothing kept.)
    }
  }

  #save() {
    if (this.seed === null) return;
    const data = this.torches.map((t) => [t.point.x, t.point.y, t.point.z, t.normal.x, t.normal.y, t.normal.z].map((v) => +v.toFixed(3)).concat(t.lit ? 1 : 0, t.lamp ? 1 : t.coal ? 2 : 0));
    try {
      localStorage.setItem(`facet-lands:torches:${this.seed}`, JSON.stringify(data));
    } catch {
      // Storage unavailable (private window etc.): torches just won't persist.
    }
  }

  /**
   * Flicker the flames and give the real lights to the nearest of the
   * torches and `extra` lights ({ x, y, z, strength, distance? }: campfires,
   * a torch in your hand).
   */
  update(time, cameraPosition, extra = []) {
    for (const t of this.torches) {
      if (!t.lit) continue;
      if (t.lamp) {
        // (No flicker: a slow, faint breathing of the light.)
        t.flicker = 0.92 + 0.08 * Math.sin(time * 0.7 + t.phase);
        t.distance = t.group.position.distanceToSquared(cameraPosition);
        continue;
      }
      const f = 0.85 + 0.15 * Math.sin(time * 13 + t.phase) * Math.sin(time * 7.3 + t.phase * 1.7);
      t.outer.scale.set(f, 0.9 + 0.2 * f, f);
      t.outer.rotation.y = time * 2 + t.phase;
      t.inner.scale.setScalar(0.9 + 0.15 * f);
      t.distance = t.group.position.distanceToSquared(cameraPosition);
      // (The glow smaller close to: its light is on everything round
      // about, and up close a big halo only dazzles.)
      t.glow.scale.setScalar((0.9 + 0.25 * f) * (0.5 + 0.5 * Math.min(1, Math.sqrt(t.distance) / 6)));
      t.flicker = f;
    }
    const all = this.torches.filter((t) => t.lit);
    for (const x of extra) {
      x.distance = (x.x - cameraPosition.x) ** 2 + (x.y - cameraPosition.y) ** 2 + (x.z - cameraPosition.z) ** 2;
      all.push(x);
    }
    const nearest = all.length <= this.lights.length ? all : all.sort((a, b) => a.distance - b.distance).slice(0, this.lights.length);
    // (Up to more lights at once; back down only after a few seconds with
    // fewer, so lighting and putting out a fire doesn't keep switching.)
    const want = this.tiers.find((n) => n >= nearest.length) ?? this.lights.length;
    const now = performance.now();
    if (want > this.tier) this.#setTier(want), (this.fewerSince = 0);
    else if (want < this.tier) {
      if (!this.fewerSince) this.fewerSince = now;
      else if (now - this.fewerSince > 4000) this.#setTier(want), (this.fewerSince = 0);
    } else this.fewerSince = 0;
    this.lights.forEach((light, i) => {
      const t = nearest[i];
      if (!t) {
        light.intensity = 0;
        light.position.set(0, -10000, 0);
        return;
      }
      if (t.lamp) {
        light.position.copy(t.group.localToWorld(this._flame.set(0, 0.5, 0)));
        light.color.setHex(0x8ad4ff);
        light.intensity = 22 * t.flicker;
        light.distance = 22;
      } else if (t.group) {
        light.color.setHex(t.coal ? 0xffe2b8 : 0xffa24a);
        light.position.copy(t.group.localToWorld(this._flame.set(0, FLAME_HEIGHT + 0.1, 0)));
        light.intensity = (t.coal ? 60 : 30) * t.flicker;
        light.distance = t.coal ? 48 : 26;
      } else {
        light.color.setHex(t.colour ?? 0xffa24a);
        light.position.set(t.x, t.y, t.z);
        const f = t.steady ? 1 : 0.85 + 0.15 * Math.sin(time * 11 + t.x) * Math.sin(time * 6.1 + t.z);
        light.intensity = t.strength * f;
        light.distance = t.reach ?? 26;
      }
    });
  }
}
