import { BoxGeometry, Group, InstancedMesh, Matrix4, MeshLambertMaterial, Quaternion, Vector3 } from 'three';
import { hash2 } from '../noise/random.js';
import { beehiveModel, nestModel, nestEggsModel } from './models.js';

const m4 = new Matrix4(), q = new Quaternion(), p = new Vector3(), s = new Vector3(1, 1, 1), UP = new Vector3(0, 1, 0);
const BIG = new Vector3(1.7, 1.7, 1.7), HIVE = new Vector3(1.4, 1.4, 1.4); // (drawn a little larger than life: to be seen up there)
const MAX = 64; // (drawn at once, the nearest)
const BEES = 24; // (bees about each hive close by)

/**
 * What's to be found up in the broad-leaved trees: here and there a bird's
 * nest in the fork of a branch (eggs in it in the spring and early summer),
 * and, rarer, a wild bees' nest hanging under a bough, its bees humming
 * round it (honey in it, if you'll risk the stings: a lit torch in your
 * hand smokes them quiet). Each tree's the same every visit (by where it
 * stands); what you've taken is remembered (`taken`: key -> world time).
 */
export class TreeFinds {
  constructor(scene, trees) {
    this.trees = trees;
    this.taken = new Map();
    this.material = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.group = new Group();
    this.group.name = 'tree finds';
    scene.add(this.group);
    const make = (geo) => {
      const m = new InstancedMesh(geo, this.material, MAX);
      m.count = 0;
      m.frustumCulled = false;
      m.castShadow = true;
      this.group.add(m);
      return m;
    };
    this.nests = make(nestModel());
    this.eggs = make(nestEggsModel());
    this.hives = make(beehiveModel());
    this.bees = new InstancedMesh(new BoxGeometry(0.03, 0.022, 0.035), new MeshLambertMaterial({ color: 0x1a1408 }), MAX * BEES); // (each bee a tiny dark speck)
    this.bees.count = 0;
    this.bees.frustumCulled = false;
    this.group.add(this.bees);
    this.near = []; // { key, kind: 'nest' | 'hive', x, y, z }
    this.wait = 0;
    this.time = 0;
  }

  /** What's in the crowns round (x, z) (within 70 m): nests and hives. */
  #find(x, z, chunkSize) {
    const out = [];
    const cx = Math.floor(x / chunkSize), cz = Math.floor(z / chunkSize);
    for (let dz = -2; dz <= 2; dz++) {
      for (let dx = -2; dx <= 2; dx++) {
        const list = this.trees.crowns?.get(`${cx + dx},${cz + dz}`);
        if (!list) continue;
        for (let k = 0; k < list.length; k += 5) {
          const tx = list[k], tz = list[k + 1], bottom = list[k + 2], r = list[k + 4];
          if (Math.abs(tx - x) > 70 || Math.abs(tz - z) > 70) continue;
          const h = hash2(Math.round(tx * 4), Math.round(tz * 4), 0x4e57);
          if (h >= 0.06) continue;
          const kind = h < 0.012 ? 'hive' : 'nest';
          // (In the fork of a low bough: out from the trunk a little, at the crown's foot.)
          const a = h * 1000, off = Math.min(1.6, r * 0.45);
          out.push({ key: `${Math.round(tx * 10)},${Math.round(tz * 10)}`, kind, x: tx + Math.cos(a) * off, y: bottom + (kind === 'hive' ? -0.35 : 0.1), z: tz + Math.sin(a) * off });
        }
      }
    }
    return out;
  }

  /** Whether it's had its eggs or honey taken lately (a nest's back next spring, a hive's honey in a few days). */
  empty(f, now) {
    const t = this.taken.get(f.key);
    return t !== undefined && now - t < (f.kind === 'hive' ? 2.5 : 30);
  }

  /**
   * @param now     world time (days)
   * @param season  the time of year (0 spring .. 4)
   */
  update(dt, camera, chunkSize, now, season, sound, pan) {
    this.time += dt;
    this.wait -= dt;
    const c = camera.position;
    if (this.wait <= 0) {
      this.wait = 1;
      this.near = this.#find(c.x, c.z, chunkSize).sort((a, b) => Math.hypot(a.x - c.x, a.z - c.z) - Math.hypot(b.x - c.x, b.z - c.z)).slice(0, MAX);
    }
    // Eggs in the spring and early summer.
    const laying = season > 0.25 && season < 1.6;
    let n = 0, e = 0, h = 0, b = 0;
    for (const f of this.near) {
      q.setFromAxisAngle(UP, (f.x * 7.1) % 6.28);
      p.set(f.x, f.y, f.z);
      m4.compose(p, q, f.kind === 'nest' ? BIG : HIVE);
      if (f.kind === 'nest') {
        this.nests.setMatrixAt(n++, m4);
        if (laying && !this.empty(f, now)) this.eggs.setMatrixAt(e++, m4);
      } else {
        this.hives.setMatrixAt(h++, m4);
        // (Its bees, round it, the closer ones only.)
        const d = Math.hypot(f.x - c.x, f.z - c.z);
        if (d < 35 && season < 3) {
          for (let k = 0; k < BEES; k++) {
            const t = this.time * (1.5 + (k % 5) * 0.4) + k * 2.3, r = 0.4 + (k % 4) * 0.25;
            p.set(f.x + Math.cos(t) * r, f.y - 0.1 + Math.sin(t * 1.7 + k) * 0.35, f.z + Math.sin(t * 1.2) * r);
            m4.compose(p, q.identity(), s.set(1, 1, 1));
            this.bees.setMatrixAt(b++, m4);
          }
          if (d < 12 && (this.buzzWait = (this.buzzWait ?? 0) - dt) <= 0) (this.buzzWait = 2.2), sound?.call('flybuzz', pan(f.x, f.z), Math.min(0.5, 3 / (d + 2)));
        }
      }
    }
    for (const [m, count] of [[this.nests, n], [this.eggs, e], [this.hives, h], [this.bees, b]]) {
      m.count = count;
      m.instanceMatrix.needsUpdate = true;
    }
  }

  /** The nest or hive along a ray within `reach` (a bit further than usual: they're up in the trees), or null: { find, distance }. */
  pick(origin, dir, reach) {
    let best = null;
    for (const f of this.near) {
      const ox = f.x - origin.x, oy = f.y - origin.y, oz = f.z - origin.z;
      const t = ox * dir.x + oy * dir.y + oz * dir.z;
      if (t < 0 || t > reach) continue;
      const off2 = ox * ox + oy * oy + oz * oz - t * t;
      if (off2 > 0.5 * 0.5) continue;
      if (!best || t < best.distance) best = { find: f, distance: t };
    }
    return best;
  }

  take(f, now) {
    this.taken.set(f.key, now);
  }

  toJSON() {
    return [...this.taken];
  }

  load(list) {
    this.taken = new Map(Array.isArray(list) ? list : []);
  }
}

