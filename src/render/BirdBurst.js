import { BoxGeometry, InstancedMesh, Matrix4, MeshLambertMaterial, Quaternion, Vector3, Euler } from 'three';

/**
 * Birds bursting up out of the trees at a fright (a tree crashing down, a
 * great beast's roar, a close lightning strike): a dozen or so small dark
 * birds flung up out of the canopy round it, flapping hard, scattering
 * outwards and away, gone in a few seconds. Instanced: one draw for all.
 */
const MAX = 96;
const _m = new Matrix4(), _q = new Quaternion(), _e = new Euler(), _p = new Vector3(), _s = new Vector3();

export class BirdBurst {
  constructor(scene) {
    // (A bird: a body, and wings either side, as one shape; flapping by scaling it.)
    const body = new BoxGeometry(0.09, 0.07, 0.24);
    this.body = new InstancedMesh(body, new MeshLambertMaterial({ color: 0x2a2622, flatShading: true }), MAX);
    this.wings = new InstancedMesh(new BoxGeometry(0.46, 0.015, 0.11), new MeshLambertMaterial({ color: 0x3a3430, flatShading: true }), MAX);
    for (const m of [this.body, this.wings]) {
      m.count = 0;
      m.frustumCulled = false;
      scene.add(m);
    }
    this.birds = [];
  }

  /**
   * A fright at (x, y, z) (the ground there): `n` birds up out of the
   * trees within `r` of it, the canopy `canopy` metres up.
   */
  burst(x, y, z, { n = 12, r = 18, canopy = 12 } = {}) {
    for (let k = 0; k < n && this.birds.length < MAX; k++) {
      const a = Math.random() * Math.PI * 2, d = r * Math.sqrt(Math.random());
      const bx = x + Math.cos(a) * d, bz = z + Math.sin(a) * d;
      const out = 3 + Math.random() * 5;
      this.birds.push({
        x: bx, y: y + canopy * (0.6 + Math.random() * 0.5), z: bz,
        vx: Math.cos(a) * out, vy: 4 + Math.random() * 4, vz: Math.sin(a) * out,
        flap: Math.random() * 6, rate: 16 + Math.random() * 8,
        delay: Math.random() * 0.5, age: 0, life: 5 + Math.random() * 3,
      });
    }
  }

  update(dt) {
    const list = this.birds;
    let n = 0;
    for (let i = list.length - 1; i >= 0; i--) {
      const b = list[i];
      if (b.delay > 0) {
        b.delay -= dt;
        continue;
      }
      b.age += dt;
      if (b.age > b.life) {
        list.splice(i, 1);
        continue;
      }
      // (Climbing hard at first, then levelling off and speeding away.)
      b.vy += (b.age < 1.2 ? 2 : -3) * dt;
      b.vy = Math.max(b.vy, 0.5);
      const speed = 1 + Math.min(1, b.age / 2) * 0.8;
      b.x += b.vx * speed * dt;
      b.y += b.vy * dt;
      b.z += b.vz * speed * dt;
      b.flap += b.rate * dt;
      const shrink = b.age > b.life - 1 ? Math.max(0, b.life - b.age) : 1; // (gone off in the distance)
      _e.set(-Math.atan2(b.vy, Math.hypot(b.vx, b.vz)) * 0.5, Math.atan2(b.vx, b.vz), 0);
      _q.setFromEuler(_e);
      _p.set(b.x, b.y, b.z);
      _s.setScalar(shrink);
      _m.compose(_p, _q, _s);
      this.body.setMatrixAt(n, _m);
      // (The wings beating: their span opening and folding, and the bird lifting a little with each stroke.)
      _s.set(shrink * (0.35 + 0.65 * Math.abs(Math.cos(b.flap))), shrink, shrink);
      _p.y += 0.04 * Math.sin(b.flap);
      _m.compose(_p, _q, _s);
      this.wings.setMatrixAt(n, _m);
      n++;
    }
    for (const m of [this.body, this.wings]) {
      m.count = n;
      m.instanceMatrix.needsUpdate = n > 0;
    }
  }
}
