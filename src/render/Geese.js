import { BoxGeometry, Group, InstancedMesh, Matrix4, MeshLambertMaterial, Quaternion, Vector3, Euler } from 'three';

const MAX = 18;
const m4 = new Matrix4(), q = new Quaternion(), e = new Euler(), p = new Vector3(), s = new Vector3(1, 1, 1);

/**
 * Geese on the move in the spring and the autumn: now and then a skein of
 * them high overhead in a long V, north in the spring, south in the
 * autumn, honking as they go, their wings beating steadily.
 */
export class Geese {
  constructor(scene) {
    this.group = new Group();
    this.group.name = 'geese';
    scene.add(this.group);
    const mat = new MeshLambertMaterial({ color: 0x5a524a, flatShading: true });
    const body = new BoxGeometry(0.28, 0.24, 0.85);
    const neck = new BoxGeometry(0.09, 0.09, 0.5).translate(0, 0.05, 0.6);
    this.bodies = new InstancedMesh(mergeBoxes([body, neck]), mat, MAX);
    const wing = new BoxGeometry(0.95, 0.03, 0.42).translate(0.48, 0, 0);
    this.left = new InstancedMesh(wing, mat, MAX);
    this.right = new InstancedMesh(wing.clone().translate(-0.96, 0, 0), mat, MAX);
    for (const m of [this.bodies, this.left, this.right]) {
      m.count = 0;
      m.frustumCulled = false;
      this.group.add(m);
    }
    this.flight = null;
    this.wait = 40 + Math.random() * 80;
  }

  update(dt, camera, { spring, autumn }, sound, pan) {
    const c = camera.position;
    if (!this.flight) {
      this.wait -= dt;
      const season = Math.max(spring, autumn);
      if (this.wait <= 0 && season > 0.3) {
        // (North in the spring, south in the autumn: -z is north. Passing over somewhere near you.)
        const north = spring > autumn ? -1 : 1, sway = (Math.random() - 0.5) * 0.6;
        const dir = new Vector3(Math.sin(sway), 0, north * Math.cos(sway)).normalize();
        const side = new Vector3(-dir.z, 0, dir.x).multiplyScalar((Math.random() - 0.5) * 220);
        this.flight = { dir, at: c.clone().addScaledVector(dir, -650).add(side).setY(c.y + 70 + Math.random() * 50), n: 9 + Math.floor(Math.random() * 8), t: 0, honk: 0 };
      }
      if (this.wait <= 0) this.wait = 150 + Math.random() * 200;
      for (const m of [this.bodies, this.left, this.right]) m.count = 0;
      if (!this.flight) return;
    }
    const f = this.flight;
    f.t += dt;
    f.at.addScaledVector(f.dir, 16 * dt);
    const heading = Math.atan2(f.dir.x, f.dir.z);
    const side = new Vector3(-f.dir.z, 0, f.dir.x);
    for (let i = 0; i < f.n; i++) {
      // (The leader at the point, the rest down each arm of the V.)
      const rank = Math.ceil(i / 2), arm = i % 2 ? 1 : -1;
      p.copy(f.at).addScaledVector(f.dir, -rank * 2.3).addScaledVector(side, arm * rank * 1.9);
      p.y += Math.sin(f.t * 0.7 + i) * 0.3;
      e.set(0, heading, 0);
      q.setFromEuler(e);
      this.bodies.setMatrixAt(i, m4.compose(p, q, s));
      const flap = Math.sin(f.t * 5.5 + i * 0.6) * 0.55;
      e.set(0, heading, flap, 'YXZ');
      this.left.setMatrixAt(i, m4.compose(p, q.setFromEuler(e), s));
      e.set(0, heading, -flap, 'YXZ');
      this.right.setMatrixAt(i, m4.compose(p, q.setFromEuler(e), s));
    }
    for (const m of [this.bodies, this.left, this.right]) {
      m.count = f.n;
      m.instanceMatrix.needsUpdate = true;
    }
    // (Their honking, carrying down from up there.)
    const d = Math.hypot(f.at.x - c.x, f.at.z - c.z);
    f.honk -= dt;
    if (d < 420 && f.honk <= 0) {
      f.honk = 0.8 + Math.random() * 1.8;
      sound?.call('honk', pan(f.at.x, f.at.z), Math.min(0.55, 60 / (d + 40)));
    }
    if (f.t > 90) this.flight = null;
  }
}

// (Boxes into one geometry.)
function mergeBoxes(list) {
  const g = list[0].clone();
  const pos = [...g.attributes.position.array], norm = [...g.attributes.normal.array], idx = [...g.index.array];
  for (const o of list.slice(1)) {
    const base = pos.length / 3;
    pos.push(...o.attributes.position.array);
    norm.push(...o.attributes.normal.array);
    idx.push(...Array.from(o.index.array, (v) => v + base));
  }
  g.setAttribute('position', new g.attributes.position.constructor(new Float32Array(pos), 3));
  g.setAttribute('normal', new g.attributes.normal.constructor(new Float32Array(norm), 3));
  g.deleteAttribute('uv');
  g.setIndex(idx);
  return g;
}
