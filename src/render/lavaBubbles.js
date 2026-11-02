import { Color, DynamicDrawUsage, IcosahedronGeometry, InstancedMesh, Matrix4, MeshBasicMaterial, Quaternion, Vector3 } from 'three';

const MAX = 120;
const m4 = new Matrix4(), q = new Quaternion(), p = new Vector3(), s = new Vector3();

/**
 * The lava underground, alive: now and then out in the middle of a lake of
 * it a bubble swells and bursts, flinging up gobs of glowing melt that arc
 * and fall back in, with a deep 'blop' and the hiss and crackle of it.
 * `spots`: the lava's lights (see CaveLayer: caveGlowLights), each over its lava.
 */
export class LavaBubbles {
  constructor(scene) {
    this.mesh = new InstancedMesh(new IcosahedronGeometry(1, 0), new MeshBasicMaterial({ color: 0xffffff }), MAX);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.setColorAt(0, new Color());
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'lava bubbles';
    scene.add(this.mesh);
    this.drops = [];
    this.wait = 1;
    this.crackle = 2;
    this.tint = new Color();
  }

  update(dt, eye, spots, sound, pan) {
    const near = eye ? spots.filter((g) => g.lava && Math.hypot(g.x - eye.x, g.z - eye.z) < 45) : [];
    this.wait -= dt;
    if (near.length && this.wait <= 0) {
      this.wait = 0.8 + Math.random() * 2.6;
      const g = near[Math.floor(Math.random() * near.length)];
      const a = Math.random() * Math.PI * 2, d = Math.random() * 5, x = g.x + Math.cos(a) * d, z = g.z + Math.sin(a) * d, y = g.y - 1.6;
      const big = Math.random() < 0.3, n = big ? 12 : 6;
      for (let k = 0; k < n && this.drops.length < MAX; k++) {
        const b = Math.random() * Math.PI * 2, out = Math.random() * (big ? 1.6 : 0.9);
        this.drops.push({ x, y: y + 0.05, z, vx: Math.cos(b) * out, vy: (big ? 2.5 : 1.4) + Math.random() * (big ? 2.5 : 1.2), vz: Math.sin(b) * out, r: 0.06 + Math.random() * (big ? 0.12 : 0.07), level: y, t: 0 });
      }
      // (The dome of the bubble itself, swelling before it goes.)
      if (this.drops.length < MAX) this.drops.push({ x, y, z, vx: 0, vy: 0, vz: 0, r: big ? 0.6 : 0.35, level: y - 1, t: 0, dome: true });
      const dist = Math.hypot(x - eye.x, z - eye.z);
      sound?.call('lavaBubble', pan?.(x, z) ?? 0, Math.min(1, (big ? 0.7 : 0.45) * Math.max(0, 1 - dist / 45)));
    }
    // (And the crackle of it cooling at its edges, now and then, near.)
    this.crackle -= dt;
    if (near.length && this.crackle <= 0) {
      this.crackle = 1.5 + Math.random() * 3;
      const g = near[0], dist = Math.hypot(g.x - eye.x, g.z - eye.z);
      sound?.call('lavaCrackle', pan?.(g.x, g.z) ?? 0, Math.min(0.6, 0.5 * Math.max(0, 1 - dist / 35)));
    }
    let n = 0;
    this.drops = this.drops.filter((d) => {
      d.t += dt;
      if (d.dome) return d.t < 0.45;
      d.vy -= 9.8 * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.z += d.vz * dt;
      return d.y > d.level - 0.1;
    });
    for (const d of this.drops) {
      if (n >= MAX) break;
      if (d.dome) {
        const u = d.t / 0.45;
        p.set(d.x, d.level + 1 - d.r * 0.4, d.z);
        s.set(d.r * (0.5 + u), d.r * (0.3 + u * 0.6), d.r * (0.5 + u));
        this.tint.setRGB(1, 0.5, 0.12);
      } else {
        p.set(d.x, d.y, d.z);
        // (Cooling as they fly: yellow-white, to orange, to dull red.)
        const cool = Math.min(1, d.t / 1.2);
        s.set(d.r, d.r * (1 + Math.min(1.5, Math.abs(d.vy) * 0.12)), d.r);
        this.tint.setRGB(1, 0.75 - 0.45 * cool, 0.35 - 0.3 * cool);
      }
      this.mesh.setMatrixAt(n, m4.compose(p, q, s));
      this.mesh.setColorAt(n++, this.tint);
    }
    this.mesh.count = n;
    if (n) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.mesh.instanceColor.needsUpdate = true;
    }
  }
}
