import { BufferAttribute, BufferGeometry, Color, DoubleSide, DynamicDrawUsage, Euler, InstancedMesh, Matrix4, MeshLambertMaterial, Quaternion, Vector3 } from 'three';

const MAX = 600;
const AUTUMN = [0xd9861f, 0xe0a22a, 0xc4501f, 0xa83218, 0xe8c23a, 0x9a6a2a];
const GREEN = [0x6aa447, 0x7fb455, 0x5a9a3a];

/** A leaf: a little pointed oval, bent along its middle. */
function leafGeometry() {
  const p = [
    [0, 0, -0.1], [0.045, 0.012, -0.02], [0, 0.02, 0.03], [-0.045, 0.012, -0.02],
    [0.035, 0.01, 0.05], [0, 0, 0.1], [-0.035, 0.01, 0.05],
  ];
  const tris = [[0, 1, 2], [0, 2, 3], [1, 4, 2], [2, 4, 5], [2, 5, 6], [3, 2, 6]];
  const pos = new Float32Array(tris.length * 9);
  tris.forEach((t, i) => t.forEach((v, k) => pos.set(p[v], i * 9 + k * 3)));
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/**
 * Leaves drifting down from the broad-leaved trees around you: a steady
 * fall of red, orange and gold in autumn (more when the wind blows), the
 * odd green one in summer, none in winter (the trees are bare) and hardly
 * any in spring. Each flutters and tumbles as it falls, carried downwind,
 * then lies on the ground a little while before it's gone.
 */
export class FallingLeaves {
  constructor(scene) {
    this.material = new MeshLambertMaterial({ side: DoubleSide });
    this.mesh = new InstancedMesh(leafGeometry(), this.material, MAX);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'falling leaves';
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    scene.add(this.mesh);
    this.leaves = [];
    this.crowns = []; // [x, z, bottom, top, radius] of crowns near you
    this.wait = 0;
    this.owed = 0;
    this._m = new Matrix4();
    this._q = new Quaternion();
    this._e = new Euler();
    this._p = new Vector3();
    this._s = new Vector3();
    this._c = new Color();
  }

  /**
   * @param dt        seconds
   * @param camera    where you are
   * @param crowns    TreeLayer.crowns (chunk key -> flat list of crowns)
   * @param chunkSize metres
   * @param ground    (x, z) => the ground's height
   * @param season    { autumn, summer, spring, winter } (0..1)
   * @param wind      0..1, and `dir` ({ x, y }: which way it blows)
   */
  update(dt, camera, crowns, chunkSize, ground, season, wind, dir, hidden) {
    // Every second or so, the broad-leaved crowns within 70 m.
    this.wait -= dt;
    if (this.wait <= 0) {
      this.wait = 1;
      this.crowns.length = 0;
      const { x, z } = camera.position;
      const cx = Math.floor(x / chunkSize), cz = Math.floor(z / chunkSize);
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const list = crowns.get(`${cx + dx},${cz + dz}`);
          if (!list) continue;
          for (let k = 0; k < list.length; k += 5) {
            if (Math.hypot(list[k] - x, list[k + 1] - z) < 70) this.crowns.push(list[k], list[k + 1], list[k + 2], list[k + 3], list[k + 4]);
          }
        }
      }
    }
    // New leaves: many in autumn, a few in summer, more in the wind.
    const rate = hidden || !this.crowns.length ? 0 : (season.autumn * 1.0 + season.summer * 0.06 + season.spring * 0.02) * (1 - season.winter) * (0.35 + 1.4 * wind) * Math.min(1, this.crowns.length / 5 / 40) * 45;
    this.owed += rate * dt;
    while (this.owed >= 1 && this.leaves.length < MAX) {
      this.owed -= 1;
      const n = Math.floor(Math.random() * (this.crowns.length / 5)) * 5;
      const [cx, cz, bottom, top, r] = this.crowns.slice(n, n + 5);
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r * 0.85;
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      const autumn = Math.random() < season.autumn / (season.autumn + 0.08);
      const palette = autumn ? AUTUMN : GREEN;
      this.leaves.push({
        x, z, y: bottom + Math.random() * (top - bottom) * 0.7,
        floor: ground(x, z) + 0.02,
        fall: 0.6 + Math.random() * 0.5,
        phase: Math.random() * 100, flutter: 1.5 + Math.random() * 2,
        spin: (Math.random() - 0.5) * 6, tilt: Math.random() * Math.PI * 2,
        lying: 0, colour: palette[Math.floor(Math.random() * palette.length)],
        size: 0.8 + Math.random() * 0.6,
      });
    }
    this.owed = Math.min(this.owed, 5);
    // Down they come.
    const t = performance.now() / 1000;
    let n = 0;
    for (let i = this.leaves.length - 1; i >= 0; i--) {
      const L = this.leaves[i];
      if (L.lying > 0) {
        L.lying -= dt;
        if (L.lying <= 0) {
          this.leaves.splice(i, 1);
          continue;
        }
      } else {
        const sway = Math.sin(t * L.flutter + L.phase);
        L.y -= L.fall * (0.75 + 0.4 * Math.abs(sway)) * dt;
        L.x += (dir.x * wind * 2.2 + Math.cos(L.phase) * sway * 0.7) * dt;
        L.z += (dir.y * wind * 2.2 + Math.sin(L.phase) * sway * 0.7) * dt;
        L.tilt += L.spin * dt;
        if (L.y <= L.floor) {
          L.y = L.floor;
          L.lying = 4 + Math.random() * 5;
        }
        // (Blown too far from where you are: gone.)
        if (Math.hypot(L.x - camera.position.x, L.z - camera.position.z) > 120) {
          this.leaves.splice(i, 1);
          continue;
        }
      }
      if (n >= MAX) continue;
      const flat = L.lying > 0;
      const sway = Math.sin(t * L.flutter + L.phase);
      this._e.set(flat ? 0 : sway * 0.9, L.tilt, flat ? 0 : Math.cos(t * L.flutter * 0.7 + L.phase) * 0.8);
      const shrink = flat ? Math.min(1, L.lying / 1.5) : 1;
      this._m.compose(this._p.set(L.x, L.y, L.z), this._q.setFromEuler(this._e), this._s.setScalar(L.size * 1.3 * shrink));
      this.mesh.setMatrixAt(n, this._m);
      this.mesh.setColorAt(n, this._c.setHex(L.colour));
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
