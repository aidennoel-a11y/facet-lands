import { ConeGeometry, Color, InstancedMesh, Matrix4, MeshLambertMaterial, Quaternion, Vector3, Euler } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { hash2 } from '../noise/random.js';

const COUNT = 40;
const m4 = new Matrix4(), q = new Quaternion(), e = new Euler(), p = new Vector3(), s = new Vector3();

/**
 * Piranha, in the jungle's rivers and pools (not all of them: some reaches
 * teem with them, most have none). Wade or swim in one and they come: first
 * a few, flickering silver and red round your legs; then the water boils.
 * Bleeding, they find you at once and there are far more of them. Get out.
 */
export class Piranha {
  constructor(scene) {
    // A little deep-bodied fish: silver back, red belly (two cones, nose to nose, and a tail).
    const body = new ConeGeometry(0.06, 0.13, 6).rotateX(Math.PI / 2).translate(0, 0, -0.065);
    const head = new ConeGeometry(0.06, 0.06, 6).rotateX(-Math.PI / 2).translate(0, 0, 0.03);
    const tail = new ConeGeometry(0.035, 0.06, 4).rotateX(-Math.PI / 2).translate(0, 0, -0.15);
    const paint = (g, top, belly) => {
      const pos = g.getAttribute('position'), col = new Float32Array(pos.count * 3), a = new Color(top), b = new Color(belly);
      for (let k = 0; k < pos.count; k++) (pos.getY(k) > -0.01 ? a : b).toArray(col, k * 3);
      g.setAttribute('color', new (pos.constructor)(col, 3));
      return g;
    };
    const geo = mergeGeometries([paint(body, 0x8a949a, 0xc8402a), paint(head, 0x7a8288, 0xd04a30), paint(tail, 0x5a6268, 0x5a6268)].map((g) => g.toNonIndexed()));
    this.mesh = new InstancedMesh(geo, new MeshLambertMaterial({ vertexColors: true }), COUNT);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'piranha';
    scene.add(this.mesh);
    this.fish = Array.from({ length: COUNT }, (_, k) => ({ a: (k / COUNT) * Math.PI * 2, r: 1 + Math.random() * 2.5, y: Math.random(), dart: Math.random() * 6 }));
    this.frenzy = 0; // 0..1: how many have come, how wild
    this.bite = 1;
  }

  /** Whether this reach of water has them: jungle rivers and pools, some of them (by 96 m stretch). */
  static teems(generator, x, z, w) {
    if (!w || w.lake || w.hot || w.cave || w.frozen) return false;
    const b = generator.getBiomeWeights(x, z, {});
    if ((b.jungle ?? 0) + (b.jungleFoothills ?? 0) + (b.jungleMountains ?? 0) * 0.5 < 0.5) return false;
    return hash2(Math.floor(x / 96), Math.floor(z / 96), (generator.seed ^ 0x51a7) | 0) < 0.45;
  }

  /**
   * ctx: { camera, feet (y of your feet), water (waterAt here), generator, bleeding (bool),
   *        hurt(amount), bleed(), splash(x, y, z, n, speed, ring), sound, flash(text), alive }
   */
  update(dt, ctx) {
    const cam = ctx.camera.position, w = ctx.water;
    const wading = ctx.alive && w && w.level - ctx.feet > 0.35 && Piranha.teems(ctx.generator, cam.x, cam.z, w);
    // (They gather: a few seconds, or at once to blood in the water.)
    const target = wading ? (ctx.bleeding ? 1 : 0.55) : 0;
    const rise = ctx.bleeding ? 0.5 : 0.12;
    this.frenzy += (target - this.frenzy) * Math.min(1, dt * (target > this.frenzy ? rise : 0.6));
    if (wading && this.frenzy > 0.2 && !this.warned) {
      this.warned = true;
      ctx.flash?.('Something flickers round your legs in the brown water. Piranha! Get out of the river');
    }
    if (!wading) this.warned = false;
    const n = Math.round(this.frenzy * COUNT);
    this.mesh.count = n;
    if (n === 0 || !w) return;
    // They circle you, dart in, nip, turn away.
    const t = (this.t = (this.t ?? 0) + dt);
    const level = w.level, floor = ctx.feet;
    for (let k = 0; k < n; k++) {
      const f = this.fish[k];
      f.dart -= dt;
      if (f.dart <= 0) (f.dart = 0.6 + Math.random() * 2.4), (f.in = Math.random() < this.frenzy * 0.7);
      const r = f.in ? 0.35 + 0.2 * Math.sin(t * 9 + k) : f.r;
      f.a += dt * (f.in ? 4 : 1.2 + this.frenzy * 2) * (k % 2 ? 1 : -1);
      const y = Math.min(level - 0.08, floor + 0.15 + f.y * Math.max(0.1, level - floor - 0.3));
      p.set(cam.x + Math.sin(f.a) * r, y, cam.z + Math.cos(f.a) * r);
      e.set(Math.sin(t * 7 + k) * 0.2, f.a + (k % 2 ? Math.PI / 2 : -Math.PI / 2), 0);
      this.mesh.setMatrixAt(k, m4.compose(p, q.setFromEuler(e), s.setScalar(0.9 + 0.3 * ((k * 37) % 7) / 7)));
      // (The water churns white where they thrash at the top.)
      if (this.frenzy > 0.6 && Math.random() < dt * 1.5) ctx.splash?.(p.x, level, p.z, 3, 1.2, 0.4);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    // The bites.
    if (!wading || this.frenzy < 0.3) return;
    this.bite -= dt * (0.5 + this.frenzy * 1.5);
    if (this.bite > 0) return;
    this.bite = 1;
    ctx.hurt?.(2 + Math.random() * 3 * this.frenzy);
    ctx.sound?.call('splash', 0, 0.3);
    if (Math.random() < 0.25) ctx.bleed?.();
  }
}
