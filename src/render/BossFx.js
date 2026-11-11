import { CircleGeometry, Color, DoubleSide, Group, IcosahedronGeometry, Mesh, MeshBasicMaterial, MeshLambertMaterial, RingGeometry, SphereGeometry } from 'three';

/**
 * What you see of a great beast's moves (see Wildlife.#bossMove): the ring on
 * the ground that warns of where a blow will land, filling as it comes; the
 * wave of dust that runs out from a slam; rocks falling; a gob of venom
 * thrown, and the pool it leaves. A small pool of meshes, reused.
 */
export class BossFx {
  constructor(scene) {
    this.group = new Group();
    scene.add(this.group);
    this.live = [];
    this.spare = { ring: [], disc: [], rock: [], glob: [] };
    this.geo = {
      ring: new RingGeometry(0.93, 1, 40).rotateX(-Math.PI / 2),
      disc: new CircleGeometry(1, 32).rotateX(-Math.PI / 2),
      rock: new IcosahedronGeometry(1, 0),
      glob: new SphereGeometry(1, 8, 6),
    };
  }

  #take(kind, colour, opacity) {
    let m = this.spare[kind].pop();
    if (!m) {
      const lit = kind === 'rock';
      const mat = lit ? new MeshLambertMaterial({ flatShading: true }) : new MeshBasicMaterial({ transparent: true, depthWrite: false, side: DoubleSide, fog: true });
      m = new Mesh(this.geo[kind], mat);
      m.userData.kind = kind;
      m.renderOrder = 3;
      m.frustumCulled = false;
      if (lit) m.castShadow = true;
      this.group.add(m);
    }
    m.material.color = new Color(colour);
    m.material.opacity = opacity;
    m.visible = true;
    return m;
  }

  #add(e) {
    e.t = 0;
    this.live.push(e);
    return e;
  }

  /** The ground at (x, z) `r` round, marked for `dur` seconds: a ring, and a disc inside it growing to fill it as the blow comes. */
  warn(x, z, r, dur, colour = 0xff3a20) {
    this.#add({ kind: 'warn', x, z, r, dur, a: this.#take('ring', colour, 0.9), b: this.#take('disc', colour, 0.28) });
  }

  /** A wave running out over the ground from (x, z) to `r`, in `dur` seconds. */
  wave(x, z, r, dur = 0.5, colour = 0xd8c8a8) {
    this.#add({ kind: 'wave', x, z, r, dur, a: this.#take('ring', colour, 0.85) });
  }

  /** A pool lying on the ground `dur` seconds (venom). */
  pool(x, z, r, dur, colour = 0x9adf30) {
    this.#add({ kind: 'pool', x, z, r, dur, a: this.#take('disc', colour, 0.45) });
  }

  /** A rock falling from high over (x, z), landing after `dur` seconds. */
  rock(x, z, dur, size = 1.1, colour = 0x6a665e) {
    const a = this.#take('rock', colour, 1);
    a.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    this.#add({ kind: 'rock', x, z, dur, size, a, spin: 2 + Math.random() * 3 });
  }

  /** Something thrown from one point to another, in an arc, over `dur` seconds. */
  glob(from, to, dur, colour = 0x9adf30, size = 0.35, arc = 3) {
    this.#add({ kind: 'glob', from: { ...from }, to: { ...to }, dur, arc, size, a: this.#take('glob', colour, 0.95) });
  }

  update(dt, ground) {
    if (!this.live.length) return;
    for (const e of this.live) {
      e.t += dt;
      const k = Math.min(1, e.t / e.dur);
      const y = e.kind === 'glob' ? 0 : (ground(e.x, e.z) ?? 0) + 0.12;
      if (e.kind === 'warn') {
        e.a.position.set(e.x, y, e.z);
        e.a.scale.setScalar(e.r);
        e.a.material.opacity = 0.55 + 0.4 * Math.abs(Math.sin(e.t * 14));
        e.b.position.set(e.x, y - 0.03, e.z);
        e.b.scale.setScalar(Math.max(0.01, e.r * k));
        e.b.material.opacity = 0.18 + 0.3 * k;
      } else if (e.kind === 'wave') {
        e.a.position.set(e.x, y, e.z);
        e.a.scale.setScalar(Math.max(0.01, e.r * (1 - (1 - k) ** 2)));
        e.a.material.opacity = 0.85 * (1 - k);
      } else if (e.kind === 'pool') {
        e.a.position.set(e.x, y, e.z);
        e.a.scale.setScalar(e.r * Math.min(1, e.t * 4));
        e.a.material.opacity = 0.45 * Math.min(1, (e.dur - e.t) * 1.5);
      } else if (e.kind === 'rock') {
        e.a.position.set(e.x, y + 22 * (1 - k * k), e.z);
        e.a.scale.setScalar(e.size);
        e.a.rotation.x += e.spin * dt;
        e.a.rotation.z += e.spin * 0.7 * dt;
      } else if (e.kind === 'glob') {
        const f = e.from, t = e.to;
        e.a.position.set(f.x + (t.x - f.x) * k, f.y + (t.y - f.y) * k + e.arc * 4 * k * (1 - k), f.z + (t.z - f.z) * k);
        e.a.scale.setScalar(e.size);
      }
    }
    this.live = this.live.filter((e) => {
      if (e.t < e.dur) return true;
      for (const m of [e.a, e.b]) if (m) (m.visible = false), this.spare[m.userData.kind].push(m);
      return false;
    });
  }
}
