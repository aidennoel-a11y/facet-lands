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
  }

  get count() {
    return this.torches.length;
  }

  /**
   * Puts a torch at `point` on a surface facing `normal` (cold, unless
   * `lit`). On the ground it stands up; on a wall it leans out. Returns null
   * for ceilings.
   */
  place(point, normal, save = true, lit = false) {
    if (normal.y < -0.3) return null;
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

    const torch = { group, outer, inner, glow, phase: Math.random() * 100, point: point.clone(), normal: normal.clone(), lit };
    outer.visible = inner.visible = glow.visible = lit;
    this.torches.push(torch);
    if (save) this.#save();
    return torch;
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
    return this.torches.map((t) => ({ k: Torches.key(t), p: [t.point.x, t.point.y, t.point.z, t.normal.x, t.normal.y, t.normal.z].map((v) => +v.toFixed(3)), lit: !!t.lit }));
  }

  /** A torch as someone else has it (online): put up, or lit or put out. */
  apply(rec) {
    const [x, y, z, nx, ny, nz] = rec.p;
    const point = new Vector3(x, y, z);
    const t = this.torches.find((t) => t.point.distanceTo(point) < 0.02);
    if (t) {
      if (!!t.lit !== !!rec.lit) this.light(t, !!rec.lit);
    } else this.place(point, new Vector3(nx, ny, nz), true, !!rec.lit);
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
    for (const [x, y, z, nx, ny, nz, lit = 1] of saved) this.place(new Vector3(x, y, z), new Vector3(nx, ny, nz), false, !!lit);
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
    const data = this.torches.map((t) => [t.point.x, t.point.y, t.point.z, t.normal.x, t.normal.y, t.normal.z].map((v) => +v.toFixed(3)).concat(t.lit ? 1 : 0));
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
    this.lights.forEach((light, i) => {
      const t = nearest[i];
      if (!t) {
        light.intensity = 0;
        light.position.set(0, -10000, 0);
        return;
      }
      if (t.group) {
        light.position.copy(t.group.localToWorld(this._flame.set(0, FLAME_HEIGHT + 0.1, 0)));
        light.intensity = 30 * t.flicker;
        light.distance = 26;
      } else {
        light.position.set(t.x, t.y, t.z);
        const f = 0.85 + 0.15 * Math.sin(time * 11 + t.x) * Math.sin(time * 6.1 + t.z);
        light.intensity = t.strength * f;
        light.distance = t.reach ?? 26;
      }
    });
  }
}
