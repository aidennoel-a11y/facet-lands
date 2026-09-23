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
  g.addColorStop(0, 'rgba(255,220,150,1)');
  g.addColorStop(0.25, 'rgba(255,170,80,0.55)');
  g.addColorStop(1, 'rgba(255,120,40,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new CanvasTexture(canvas);
}

/**
 * Placeable torches.
 *
 * Each torch is a low-poly stick with a flickering two-layer flame and a
 * soft glow. Real light comes from a fixed pool of point lights handed to
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
    this.innerMaterial = new MeshBasicMaterial({ color: 0xfff0a0 });
    this.glowMaterial = new SpriteMaterial({
      map: glowTexture(),
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });

    this.lights = [];
    for (let i = 0; i < maxLights; i++) {
      const light = new PointLight(0xffa24a, 0, 16, 1.7);
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
   * Puts a torch at `point` on a surface facing `normal`. On the ground it
   * stands up; on a wall it leans out. Returns null for ceilings.
   */
  place(point, normal, save = true) {
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

    const torch = { group, outer, inner, glow, phase: Math.random() * 100, point: point.clone(), normal: normal.clone() };
    this.torches.push(torch);
    if (save) this.#save();
    return torch;
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
    for (const [x, y, z, nx, ny, nz] of saved) this.place(new Vector3(x, y, z), new Vector3(nx, ny, nz), false);
  }

  #save() {
    if (this.seed === null) return;
    const data = this.torches.map((t) => [t.point.x, t.point.y, t.point.z, t.normal.x, t.normal.y, t.normal.z].map((v) => +v.toFixed(3)));
    try {
      localStorage.setItem(`facet-lands:torches:${this.seed}`, JSON.stringify(data));
    } catch {
      // Storage unavailable (private window etc.): torches just won't persist.
    }
  }

  /** Flicker the flames and give the nearest torches the real lights. */
  update(time, cameraPosition) {
    for (const t of this.torches) {
      const f = 0.85 + 0.15 * Math.sin(time * 13 + t.phase) * Math.sin(time * 7.3 + t.phase * 1.7);
      t.outer.scale.set(f, 0.9 + 0.2 * f, f);
      t.outer.rotation.y = time * 2 + t.phase;
      t.inner.scale.setScalar(0.9 + 0.15 * f);
      t.glow.scale.setScalar(1.4 + 0.35 * f);
      t.flicker = f;
      t.distance = t.group.position.distanceToSquared(cameraPosition);
    }
    const nearest = this.torches.length <= this.lights.length
      ? this.torches
      : [...this.torches].sort((a, b) => a.distance - b.distance).slice(0, this.lights.length);
    this.lights.forEach((light, i) => {
      const t = nearest[i];
      if (!t) {
        light.intensity = 0;
        light.position.set(0, -10000, 0);
        return;
      }
      light.position.copy(t.group.localToWorld(this._flame.set(0, FLAME_HEIGHT + 0.1, 0)));
      light.intensity = 14 * t.flicker;
    });
  }
}
