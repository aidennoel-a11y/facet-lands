import { BoxGeometry, CylinderGeometry, DynamicDrawUsage, InstancedMesh, Matrix4, MeshLambertMaterial, Object3D, TorusGeometry } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CaveField } from './CaveField.js';

/**
 * What's left in an abandoned mine (see CaveField.#layMine): its timber
 * sets every few metres (a post each side, a cap across, some sagging,
 * some fallen), the narrow rails on their sleepers down the middle, an old
 * ore cart, a lantern hung here and there (long gone out), a timber frame
 * at the adit's mouth. Laid out for the mines near you only.
 */
export class MineProps {
  constructor(scene) {
    const wood = new MeshLambertMaterial({ color: 0x6a4e34, flatShading: true });
    const iron = new MeshLambertMaterial({ color: 0x4a4440, flatShading: true });
    const make = (geo, mat, n) => {
      const m = new InstancedMesh(geo, mat, n);
      m.instanceMatrix.setUsage(DynamicDrawUsage);
      m.count = 0;
      m.castShadow = m.receiveShadow = true;
      m.frustumCulled = false;
      m.name = 'mine props';
      scene.add(m);
      return m;
    };
    this.posts = make(new BoxGeometry(0.28, 1, 0.28).translate(0, 0.5, 0), wood, 1600);
    this.caps = make(new BoxGeometry(1, 0.3, 0.3), wood, 800);
    this.sleepers = make(new BoxGeometry(1.3, 0.1, 0.22), wood, 3000);
    this.rails = make(new BoxGeometry(0.07, 0.09, 1), iron, 1200);
    const cart = mergeGeometries([
      new BoxGeometry(1.0, 0.7, 1.5).translate(0, 0.75, 0),
      ...[[-0.45, -0.5], [0.45, -0.5], [-0.45, 0.5], [0.45, 0.5]].map(([x, z]) => new CylinderGeometry(0.18, 0.18, 0.08, 8).rotateZ(Math.PI / 2).translate(x, 0.22, z)),
    ].map((g) => g.toNonIndexed()));
    this.carts = make(cart, iron, 16);
    const lantern = mergeGeometries([new BoxGeometry(0.18, 0.26, 0.18).translate(0, -0.25, 0), new TorusGeometry(0.05, 0.012, 3, 6).translate(0, -0.07, 0)].map((g) => g.toNonIndexed()));
    this.lanterns = make(lantern, iron, 200);
    this.key = '';
    this.o = new Object3D();
    this.m = new Matrix4();
    this.chests = []; // ({ key, x, y, z, rot }): the far end's chest, for Game.ruinChest
  }

  #put(mesh, x, y, z, ry, sx = 1, sy = 1, sz = 1, rz = 0) {
    if (mesh.count >= mesh.instanceMatrix.count) return;
    const o = this.o;
    o.position.set(x, y, z);
    o.rotation.set(0, ry, rz);
    o.scale.set(sx, sy, sz);
    o.updateMatrix();
    mesh.setMatrixAt(mesh.count++, o.matrix);
  }

  /** Lays out the props of the mines within 200 m of (x, z) (again only when that set changes). */
  update(x, z, field) {
    const mines = field.minesNear(x - 200, z - 200, x + 200, z + 200);
    const key = mines.map((m) => m.id).join('|');
    if (key === this.key) return;
    this.key = key;
    for (const mesh of [this.posts, this.caps, this.sleepers, this.rails, this.carts, this.lanterns]) mesh.count = 0;
    this.chests = [];
    const HW = CaveField.MINE_HW, HT = CaveField.MINE_HT;
    for (const mine of mines) {
      let n = 0;
      for (const q of mine.segments) {
        const ex = q.bx - q.ax, ez = q.bz - q.az, len = Math.hypot(ex, ez), dx = ex / len, dz = ez / len;
        const yaw = Math.atan2(dx, dz), slope = Math.atan2(q.ay - q.by, len);
        const at = (u) => [q.ax + dx * u, q.ay + (q.by - q.ay) * (u / len), q.az + dz * u];
        // Timber sets every 3.5 m: a post at each wall, a cap across under the roof.
        for (let u = 1.5; u < len - 0.5; u += 3.5) {
          const [px, py, pz] = at(u), h = HT - 0.5, wob = Math.sin(px * 7.1 + pz * 3.3);
          n++;
          for (const s of [-1, 1]) {
            const ox = -dz * s * (HW - 0.45), oz = dx * s * (HW - 0.45);
            this.#put(this.posts, px + ox, py, pz + oz, yaw, 1, h, 1, 0.04 * wob * s);
          }
          // (Here and there a cap's fallen, lying across the floor.)
          if (wob > 0.92) this.#put(this.caps, px, py + 0.15, pz, yaw + 0.4, (HW - 0.2) * 2, 1, 1);
          else this.#put(this.caps, px, py + h - 0.08 - Math.max(0, wob) * 0.12, pz, yaw + Math.PI / 2, (HW - 0.2) * 2, 1, 1, 0);
          // (A lantern on every fourth.)
          if (n % 4 === 0) this.#put(this.lanterns, px + dx * 0.2, py + h - 0.25, pz + dz * 0.2, yaw);
        }
        // The rails, on a sleeper every 0.9 m.
        for (let u = 0.5; u < len; u += 0.9) {
          const [px, py, pz] = at(u);
          this.#put(this.sleepers, px, py + 0.05, pz, yaw);
        }
        for (let u = 0; u < len; u += 3) {
          const [px, py, pz] = at(Math.min(len - 1.5, u + 1.5));
          for (const s of [-1, 1]) {
            const o = this.o;
            o.position.set(px - dz * s * 0.45, py + 0.15, pz + dx * s * 0.45);
            o.rotation.set(slope, yaw, 0, 'YXZ');
            o.scale.set(1, 1, 3);
            o.updateMatrix();
            if (this.rails.count < this.rails.instanceMatrix.count) this.rails.setMatrixAt(this.rails.count++, o.matrix);
          }
        }
      }
      const c = mine.cart;
      this.#put(this.carts, c.x, c.y + 0.1, c.z, mine.yaw + Math.PI / 2 + 0.15);
      // The chest at the far end of the workings.
      const last = mine.segments[mine.segments.length - 1];
      const lx = last.bx - last.ax, lz = last.bz - last.az, ll = Math.hypot(lx, lz);
      this.chests.push({ key: `mine:${mine.id}`, mine: true, x: mine.end.x - (lx / ll) * 1.5, y: mine.end.y, z: mine.end.z - (lz / ll) * 1.5, rot: Math.atan2(lx, lz) });
    }
    for (const mesh of [this.posts, this.caps, this.sleepers, this.rails, this.carts, this.lanterns]) mesh.instanceMatrix.needsUpdate = true;
  }
}
