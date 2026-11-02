import { BufferAttribute, BufferGeometry, Color, DoubleSide, DynamicDrawUsage, InstancedMesh, Matrix4, MeshLambertMaterial, Quaternion, Vector3 } from 'three';

const MAX = 600;
const m4 = new Matrix4(), q = new Quaternion(), q2 = new Quaternion(), p = new Vector3(), s = new Vector3(), X = new Vector3(1, 0, 0), Y = new Vector3(0, 1, 0);

/**
 * Grass cut with a sickle: the stalks sheared off at the foot, toppling
 * over and falling flat (each its own way, the way the blade swept), and
 * lying in a swathe on the stubble a while before they wither into it.
 */
export class CutBlades {
  constructor(scene) {
    // A tuft's cut stalks: a few thin tapering blades from one foot.
    const pos = [];
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI + 0.3, w = 0.025, lean = (k - 1.5) * 0.08, cx = Math.cos(a) * w, cz = Math.sin(a) * w;
      pos.push(-cx, 0, -cz, cx, 0, cz, lean, 1, lean * 0.5);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    g.computeVertexNormals();
    this.mesh = new InstancedMesh(g, new MeshLambertMaterial({ side: DoubleSide }), MAX);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.setColorAt(0, new Color());
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'cut grass';
    scene.add(this.mesh);
    this.list = [];
    this.colour = new Color();
  }

  /**
   * Cut round (x, z) (`r` m): `ground(x, z)` the ground's height, `tint`
   * the grass's colour there, `sweep` the way the blade went (radians).
   */
  cut(x, z, r, ground, tint, sweep) {
    const n = Math.min(40, Math.round(r * r * 9));
    for (let k = 0; k < n; k++) {
      if (this.list.length >= MAX) this.list.shift();
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d, y = ground(px, pz);
      if (!Number.isFinite(y)) continue;
      this.list.push({
        x: px, y: y + 0.06, z: pz, h: 0.35 + Math.random() * 0.4, t: -Math.random() * 0.25,
        fall: sweep + (Math.random() - 0.5) * 1.6, spin: Math.random() * Math.PI * 2,
        colour: this.colour.copy(tint).multiplyScalar(0.85 + Math.random() * 0.3).getHex(),
      });
    }
  }

  update(dt) {
    let n = 0;
    const tint = this.colour;
    this.list = this.list.filter((b) => (b.t += dt) < 40);
    for (const b of this.list) {
      // (Toppling: slow at first, quicker as it goes over, a little bounce as it lands.)
      const u = Math.min(1, Math.max(0, b.t / 0.7)), over = (Math.PI / 2 - 0.08) * (u * u) - (u >= 1 ? 0 : 0) + (u >= 1 ? 0.05 * Math.exp(-(b.t - 0.7) * 8) * Math.sin((b.t - 0.7) * 30) : 0);
      // (Withering into the stubble at the end: lying lower, shrinking.)
      const wither = 1 - Math.max(0, (b.t - 30) / 10);
      q.setFromAxisAngle(Y, b.fall);
      q2.setFromAxisAngle(X, over);
      q.multiply(q2).multiply(q2.setFromAxisAngle(Y, b.spin));
      p.set(b.x, b.y - (1 - wither) * 0.05, b.z);
      m4.compose(p, q, s.set(1, b.h * wither, 1));
      this.mesh.setMatrixAt(n, m4);
      this.mesh.setColorAt(n++, tint.setHex(b.colour).multiplyScalar(1 - 0.35 * Math.min(1, b.t / 30)));
    }
    this.mesh.count = n;
    if (n) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.mesh.instanceColor.needsUpdate = true;
    }
  }
}
