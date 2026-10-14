import {
  AdditiveBlending, BoxGeometry, DoubleSide, BufferAttribute, CanvasTexture, CircleGeometry, Color, ConeGeometry, CylinderGeometry, DodecahedronGeometry, Euler, Group, IcosahedronGeometry,
  Matrix4, Mesh, MeshBasicMaterial, MeshLambertMaterial, OctahedronGeometry, PlaneGeometry, Quaternion, RepeatWrapping, Sprite, SpriteMaterial, Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../noise/random.js';
import { LANDMARKS } from './landmarkSites.js';

const tint = new Color(), m4 = new Matrix4(), q = new Quaternion(), e = new Euler(), p = new Vector3(), s3 = new Vector3();

/** A faceted model from coloured pieces (as the game's other things), merged into one geometry. */
class Kit {
  constructor(seed) {
    this.list = [];
    this.rand = mulberry32(seed);
  }

  add(geo, color, [x, y, z] = [0, 0, 0], [rx, ry, rz] = [0, 0, 0], [sx, sy, sz] = [1, 1, 1], jitter = 0.08) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    g.deleteAttribute('uv');
    g.deleteAttribute('normal');
    g.applyMatrix4(m4.compose(p.set(x, y, z), q.setFromEuler(e.set(rx, ry, rz)), s3.set(sx, sy, sz)));
    const pos = g.attributes.position, col = new Float32Array(pos.count * 3);
    for (let k = 0; k < pos.count; k += 3) {
      tint.set(color).multiplyScalar(1 - jitter + this.rand() * jitter * 2);
      for (let v = 0; v < 3; v++) col.set([tint.r, tint.g, tint.b], (k + v) * 3);
    }
    g.setAttribute('color', new BufferAttribute(col, 3));
    this.list.push(g);
    return this;
  }

  /** A limb or a trunk from a to b, radius r0 tapering to r1. */
  limb(a, b, r0, r1, color, sides = 7) {
    const d = new Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), len = d.length();
    const g = new CylinderGeometry(r1, r0, len, sides).translate(0, len / 2, 0);
    g.applyQuaternion(q.setFromUnitVectors(new Vector3(0, 1, 0), d.normalize()));
    return this.add(g, color, a);
  }

  build() {
    const g = mergeGeometries(this.list);
    g.computeVertexNormals();
    return g;
  }
}

const rock = (k, col, at, size, rot = [0, 0, 0], scale = [1, 1, 1]) => k.add(new DodecahedronGeometry(size, 0), col, at, rot, scale, 0.1);

/**
 * The landmarks themselves (where: see landmarkSites): each one's model,
 * what of it is solid (circles you can't walk through, or stand on top
 * of), its water (a lake, a pool, the falls' basin: to swim in and drink,
 * clean or hot), and what it gives the first time it's found. Only the
 * ones within 900 m are built.
 */
export class Landmarks {
  constructor(scene, generator) {
    this.scene = scene;
    this.generator = generator;
    this.built = new Map(); // key -> { site, group, solids, water }
    this.material = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.iceMaterial = new MeshLambertMaterial({ vertexColors: true, flatShading: true, transparent: true, opacity: 0.86 });
    this.glowMaterial = new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85 });
    this.waterMats = {
      clear: new MeshLambertMaterial({ color: 0x2e7a8a, transparent: true, opacity: 0.78, depthWrite: false }),
      crystal: new MeshLambertMaterial({ color: 0x3aa8c0, transparent: true, opacity: 0.72, depthWrite: false }),
      dark: new MeshLambertMaterial({ color: 0x2a4a3a, transparent: true, opacity: 0.86, depthWrite: false }),
      hot: new MeshLambertMaterial({ color: 0x5ac8c0, transparent: true, opacity: 0.8, depthWrite: false }),
    };
    this.wait = 0;
    this.time = 0;
  }

  #ground(x, z) {
    return this.generator.getHeight(x, z);
  }

  /** The water of a basin site: its level (lowest of its rim, a little under), and how far it reaches. */
  #lake(site) {
    const b = LANDMARKS[site.kind].basin;
    return { level: this.generator.landmarks.levelOf(site), r: b.r * 1.02 };
  }

  #disc(group, r, level, mat, x = 0, z = 0) {
    const m = new Mesh(new CircleGeometry(r, 40).rotateX(-Math.PI / 2), mat);
    m.position.set(x, level, z);
    m.renderOrder = 2;
    group.add(m);
    return m;
  }

  // --- Each kind ------------------------------------------------------------------

  #build(site) {
    // (The falls come down the uphill side of their pool: the cliff there faces downhill.)
    if (site.kind === 'twinFalls') {
      let best = -Infinity, up = 0;
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2, h = this.#ground(site.x + Math.cos(a) * 24, site.z + Math.sin(a) * 24);
        if (h > best) (best = h), (up = a);
      }
      site = { ...site, rot: up };
    }
    const g = new Group(), solids = [], R = mulberry32(site.seed), r = (a, b) => a + (b - a) * R();
    const y0 = this.#ground(site.x, site.z);
    g.position.set(site.x, 0, site.z);
    const local = (u, v) => [Math.cos(site.rot) * u - Math.sin(site.rot) * v, Math.sin(site.rot) * u + Math.cos(site.rot) * v];
    const at = (u, v) => {
      const [dx, dz] = local(u, v);
      return [dx, this.#ground(site.x + dx, site.z + dz), dz];
    };
    const solid = (dx, dz, rad, top) => solids.push({ x: site.x + dx, z: site.z + dz, r: rad, top });
    let water = null, steam = null, falls = null;
    const k = new Kit(site.seed);
    switch (site.kind) {
      case 'elderTree': {
        // A vast old oak: a fluted trunk, roots buttressing it, great boughs out, a crown like a hill.
        const bark = 0x5a4632, moss = 0x4a6a34;
        // (Built at two thirds its size, then grown: see the scale below.)
        k.limb([0, y0 - 1, 0], [0.4, y0 + 9, 0.2], 3.2, 2.4, bark, 9).limb([0.4, y0 + 9, 0.2], [0, y0 + 16, 0], 2.4, 1.7, bark, 8);
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2 + r(-0.2, 0.2);
          k.limb([Math.cos(a) * 1.5, y0 + 2.2, Math.sin(a) * 1.5], [Math.cos(a) * 5.5, y0 - 0.6, Math.sin(a) * 5.5], 1.1, 0.4, i % 3 ? bark : moss, 6);
        }
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + r(-0.3, 0.3), out = r(8, 12), up = r(18, 24);
          k.limb([0, y0 + r(11, 15), 0], [Math.cos(a) * out, y0 + up, Math.sin(a) * out], 1.3, 0.5, bark, 6);
          for (let j = 0; j < 3; j++) rock(k, [0x3e6a2a, 0x4a7a30, 0x56843a][j], [Math.cos(a) * out * r(0.8, 1.2), y0 + up + r(0, 4), Math.sin(a) * out * r(0.8, 1.2)], r(5, 7.5), [r(0, 3), r(0, 3), 0], [1, 0.7, 1]);
        }
        rock(k, 0x467432, [0, y0 + 27, 0], 9, [0, 0, 0], [1.3, 0.75, 1.3]);
        // (Half again as big: a tree some 45 m high, its crown 50 m across, its trunk 10 m round.)
        const big = new Kit(site.seed + 5);
        for (const geo of k.list) big.list.push(geo.translate(0, -y0, 0).scale(1.5, 1.5, 1.5).translate(0, y0 - 0.5, 0));
        k.list = big.list;
        solid(0, 0, 5, y0 + 40);
        break;
      }
      case 'stoneArch': {
        // Two legs of banded red rock and the span between, 26 m across, 20 high.
        const band = [0xb4603a, 0xc87a4a, 0x9a4a30, 0xd09060];
        const half = 13, rise = 18, n = 14;
        for (const s of [-1, 1]) {
          const [lx, ly, lz] = at(s * half, 0);
          for (let i = 0; i < 6; i++) k.add(new BoxGeometry(6 - i * 0.3, 3.3, 5.5 - i * 0.25), band[i % 4], [lx, ly + i * 3 - 0.5, lz], [0, site.rot + r(-0.1, 0.1), 0], [1, 1, 1], 0.06);
          solid(lx, lz, 3.4, ly + 17);
        }
        const [, ya] = at(-half, 0), [, yb] = at(half, 0), base = Math.max(ya, yb);
        for (let i = 0; i <= n; i++) {
          const t = i / n, a = Math.PI * t, u = -Math.cos(a) * half;
          const [dx, dz] = local(u, 0);
          k.add(new BoxGeometry(4.2, 3.4, 4.6), band[i % 4], [dx, base + Math.sin(a) * rise + 1, dz], [0, site.rot, -Math.cos(a) * 0.9], [1, 1, 1], 0.06);
        }
        break;
      }
      case 'crystalLake': {
        water = { ...this.#lake(site), clean: true, mat: 'crystal' };
        const glow = new Kit(site.seed + 1);
        for (let i = 0; i < 14; i++) {
          const a = (i / 14) * Math.PI * 2 + r(-0.15, 0.15), d = LANDMARKS.crystalLake.basin.r * r(1.02, 1.18);
          const [dx, dz] = [Math.cos(a) * d, Math.sin(a) * d], gy = this.#ground(site.x + dx, site.z + dz);
          for (let j = 0; j < 4; j++) glow.add(new OctahedronGeometry(r(0.3, 0.7), 0), [0x9ae8ff, 0xc8a0ff, 0x80d8ff][j % 3], [dx + r(-0.8, 0.8), gy + r(0.4, 1.2), dz + r(-0.8, 0.8)], [r(-0.5, 0.5), r(0, 3), r(-0.5, 0.5)], [0.6, r(2, 3.4), 0.6], 0.05);
        }
        g.add(new Mesh(glow.build(), this.glowMaterial));
        break;
      }
      case 'twinFalls': {
        // A cliff on the far side of the pool, the falls pouring down it into the pool.
        const b = LANDMARKS.twinFalls.basin;
        water = { ...this.#lake(site), clean: true, mat: 'clear' };
        const top = Math.max(water.level + 14, this.#ground(site.x + Math.cos(site.rot) * b.r * 1.6, site.z + Math.sin(site.rot) * b.r * 1.6) + 2);
        for (let i = -4; i <= 4; i++) {
          const [dx, gy, dz] = at(b.r * 1.15 + r(0, 2), i * 4);
          const h = top - Math.min(gy, water.level) + 2;
          k.add(new BoxGeometry(5, h, 7), [0x6a6a66, 0x7a7872, 0x5e5e5a][(i + 9) % 3], [dx, Math.min(gy, water.level) - 1 + h / 2, dz], [0, site.rot + r(-0.08, 0.08), 0], [1, 1, 1], 0.08);
          solid(dx, dz, 3.5, top + 1);
        }
        falls = [];
        for (const v of [-4.5, 4.5]) {
          const [fx, , fz] = at(b.r * 1.15 - 2.6, v);
          falls.push({ x: fx, z: fz, top, bottom: water.level, rot: site.rot });
        }
        break;
      }
      case 'standingStones': {
        const grey = [0x8a8a84, 0x7a7c78, 0x9a9890];
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2, [dx, gy, dz] = [Math.cos(a) * 10, this.#ground(site.x + Math.cos(a) * 10, site.z + Math.sin(a) * 10), Math.sin(a) * 10];
          if (i === 7) {
            // (One fallen.)
            k.add(new BoxGeometry(1.4, 0.9, 4.2), grey[1], [dx, gy + 0.4, dz], [0, a + 0.4, 0.05], [1, 1, 1], 0.08);
            continue;
          }
          const h = r(3.4, 4.8);
          k.add(new BoxGeometry(1.4, h, 0.9), grey[i % 3], [dx, gy + h / 2 - 0.4, dz], [r(-0.06, 0.06), -a, r(-0.08, 0.08)], [1, 1, 1], 0.08);
          solid(dx, dz, 0.85, gy + h);
        }
        // (A lintel across two of them: a trilithon.)
        k.add(new BoxGeometry(1.0, 0.8, 4.4), grey[2], [Math.cos(0.26) * 10, this.#ground(site.x + 10, site.z) + 4.6, Math.sin(0.26) * 10], [0, -0.26 + Math.PI / 2, 0]);
        rock(k, 0x7a7c78, [0, y0 + 0.2, 0], 1.1, [0, 0, 0], [1.4, 0.5, 1]); // (the altar stone)
        break;
      }
      case 'sunkenForest': {
        water = { ...this.#lake(site), clean: false, mat: 'dark' };
        const deadwood = [0x8a8478, 0x6e685e, 0x9a9488];
        for (let i = 0; i < 26; i++) {
          const a = r(0, Math.PI * 2), d = Math.sqrt(R()) * LANDMARKS.sunkenForest.basin.r * 0.9;
          const dx = Math.cos(a) * d, dz = Math.sin(a) * d, gy = this.#ground(site.x + dx, site.z + dz), h = r(5, 13);
          k.limb([dx, gy - 0.5, dz], [dx + r(-0.6, 0.6), water.level + h, dz + r(-0.6, 0.6)], r(0.35, 0.6), 0.12, deadwood[i % 3], 6);
          if (R() < 0.6) k.limb([dx, water.level + h * 0.6, dz], [dx + r(-2, 2), water.level + h * 0.6 + r(1, 2.5), dz + r(-2, 2)], 0.14, 0.05, deadwood[(i + 1) % 3], 4);
          solid(dx, dz, 0.5, water.level + h);
        }
        break;
      }
      case 'petrifiedLog': {
        // A giant trunk turned to stone, broken in lengths where it fell: banded agate colours.
        const cols = [0xa87a50, 0x8a5a3e, 0xc0a080, 0x7a6a6a, 0xb06a4a];
        for (let i = 0; i < 6; i++) {
          const u0 = -15 + i * 5.2, u1 = u0 + 4.6;
          const [ax, ay, az] = at(u0, r(-0.3, 0.3)), [bx, by, bz] = at(u1, r(-0.3, 0.3));
          const base = Math.min(ay, by) + 1.1;
          k.limb([ax, base, az], [bx, base + (by - ay) * 0.5, bz], 1.6 - i * 0.08, 1.55 - i * 0.08, cols[i % 5], 9);
          k.add(new CylinderGeometry(1.5 - i * 0.08, 1.5 - i * 0.08, 0.1, 9), 0xd8c0a0, [ax, base, az], [0, 0, 0]); // (the rings showing at a break)
          for (let t = 0; t <= 1; t += 0.5) solid(ax + (bx - ax) * t, az + (bz - az) * t, 1.5, base + 1.5);
        }
        for (let i = 0; i < 10; i++) rock(k, cols[i % 5], at(r(-16, 16), r(-4, 4)), r(0.3, 0.7));
        break;
      }
      case 'boneField': {
        // The bones of something vast: a spine, the arch of its ribs, its skull; and an old hunters' camp.
        const bone = [0xe8e0cc, 0xd8ceb6, 0xf0e8d6];
        const [hx, hy, hz] = at(13, 0);
        for (let i = 0; i < 14; i++) {
          const u = -10 + i * 1.6, [dx, gy, dz] = at(u, 0), lift = 3.2 * Math.sin(((i + 1) / 15) * Math.PI);
          k.add(new BoxGeometry(1.0, 0.9, 1.2), bone[i % 3], [dx, gy + 0.6 + lift * 0.4, dz], [0, site.rot, 0]);
          if (i > 1 && i < 12) {
            for (const sd of [-1, 1]) {
              // (A rib: three segments arching out and down.)
              let [px, py, pz] = [dx, gy + 0.9 + lift * 0.4, dz];
              for (let j = 1; j <= 3; j++) {
                const [ox, oz] = local(0, sd * j * 1.5), ny = gy + 0.9 + lift * 0.4 + [2.2, 1.6, -0.6][j - 1] * (1 + lift * 0.15);
                k.limb([px, py, pz], [dx + ox, ny, dz + oz], 0.22, 0.17, bone[j % 3], 5);
                [px, py, pz] = [dx + ox, ny, dz + oz];
              }
            }
          }
        }
        k.add(new BoxGeometry(3.2, 2.2, 4.4), bone[0], [hx, hy + 1, hz], [0.1, site.rot, 0]).add(new BoxGeometry(2.6, 0.6, 3.6), bone[1], [hx, hy - 0.1, hz], [0.2, site.rot, 0]);
        k.add(new ConeGeometry(0.5, 3.5, 5), bone[2], [hx + 1.4, hy + 2.8, hz], [0, 0, -0.5]).add(new ConeGeometry(0.5, 3.5, 5), bone[2], [hx - 1.4, hy + 2.8, hz], [0, 0, 0.5]);
        solid(hx, hz, 2.4, hy + 2.4);
        // (The hunters' camp: a ring of fire-stones, a lean-to's bare poles.)
        const [cx, cy, cz] = at(-4, 9);
        for (let i = 0; i < 8; i++) rock(k, 0x6a6662, [cx + Math.cos(i) * 0.9, cy + 0.1, cz + Math.sin(i) * 0.9], 0.3);
        k.add(new BoxGeometry(1.2, 0.08, 1.2), 0x1e1a18, [cx, cy + 0.05, cz]);
        for (const sd of [-1, 1]) k.limb([cx + 2 * sd, cy, cz + 2], [cx, cy + 2.2, cz + 2.6], 0.06, 0.05, 0x6a5038, 4);
        break;
      }
      case 'glacierCave': {
        // A grotto of old blue ice: a ring of great ice blocks roofed over, open one side; icicles; crystals in its walls.
        const ice = [0xa8d8f0, 0x88c4e8, 0xc8e8f8, 0x6aa8d8];
        const icy = new Kit(site.seed + 2);
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2 + site.rot;
          if (Math.abs(Math.atan2(Math.sin(a - site.rot), Math.cos(a - site.rot))) < 0.45) continue; // (its mouth)
          const dx = Math.cos(a) * 8, dz = Math.sin(a) * 8, gy = this.#ground(site.x + dx, site.z + dz);
          icy.add(new BoxGeometry(3.6, 7.5, 2.6), ice[i % 4], [dx, gy + 3, dz], [r(-0.1, 0.1), -a, r(-0.1, 0.1)], [1, 1, 1], 0.06);
          solid(dx, dz, 1.8, gy + 7);
        }
        icy.add(new DodecahedronGeometry(9, 1), ice[2], [0, y0 + 7.5, 0], [0, 0, 0], [1, 0.35, 1], 0.05); // (its roof)
        for (let i = 0; i < 18; i++) icy.add(new ConeGeometry(0.25, r(1, 2.4), 5), ice[0], [r(-6, 6), y0 + 5.6, r(-6, 6)], [Math.PI, 0, 0]);
        g.add(new Mesh(icy.build(), this.iceMaterial));
        const glow = new Kit(site.seed + 3);
        for (let i = 0; i < 8; i++) glow.add(new OctahedronGeometry(0.4, 0), 0x9ae8ff, [r(-5, 5), y0 + r(0.5, 3), r(-5, 5)], [0, r(0, 3), 0.3], [0.6, 2.4, 0.6], 0.05);
        g.add(new Mesh(glow.build(), this.glowMaterial));
        water = { level: y0 + 0.35, r: 2.2, clean: true, mat: 'crystal', x: Math.cos(site.rot + Math.PI) * 3, z: Math.sin(site.rot + Math.PI) * 3, small: true };
        break;
      }
      case 'hotPools': {
        water = { ...this.#lake(site), clean: false, hot: true, mat: 'hot' };
        // White terraces of travertine round the pool and stepping down the slope from it.
        const white = [0xf0ece0, 0xe4dcc8, 0xf8f4ea];
        const b = LANDMARKS.hotPools.basin;
        for (let i = 0; i < 30; i++) {
          const a = (i / 30) * Math.PI * 2, d = b.r * 1.05;
          k.add(new BoxGeometry(3, 0.5, 1.2), white[i % 3], [Math.cos(a) * d, water.level + 0.1, Math.sin(a) * d], [0, -a, 0]);
        }
        for (let t = 0; t < 3; t++) {
          const [dx, gy, dz] = at(b.r * (1.5 + t * 0.6), r(-3, 3));
          k.add(new CylinderGeometry(3.5 - t * 0.5, 3.8 - t * 0.5, 0.6, 10), white[t], [dx, gy + 0.2, dz]);
        }
        steam = { r: b.r * 0.8, level: water.level };
        break;
      }
      case 'eagleSpire': {
        // A needle of rock 40 m high, stacked blocks narrowing up it, an eagles' nest of sticks on top.
        const cols = [0x8a7a6a, 0x7a6a5a, 0x9a8a78];
        let h = y0 - 2, w = 8;
        for (let i = 0; i < 12; i++) {
          const bh = r(3, 4.2);
          k.add(new BoxGeometry(w, bh, w * r(0.8, 1)), cols[i % 3], [r(-0.4, 0.4), h + bh / 2, r(-0.4, 0.4)], [0, r(0, 1.5), r(-0.05, 0.05)], [1, 1, 1], 0.07);
          h += bh * 0.95;
          w *= 0.93;
        }
        for (let i = 0; i < 14; i++) k.limb([r(-1.6, 1.6), h, r(-1.6, 1.6)], [r(-1.8, 1.8), h + 0.5, r(-1.8, 1.8)], 0.08, 0.06, 0x6a5038, 4);
        solid(0, 0, 4.4, h);
        for (let i = 0; i < 10; i++) rock(k, cols[i % 3], [r(-9, 9), y0, r(-9, 9)], r(0.8, 2)); // (fallen rock round its foot)
        break;
      }
      case 'greatSinkhole': {
        // The pit is the land itself (see landmarkSites.basinAt); round its lip, boulders and hanging vines; a pool at the bottom.
        const b = LANDMARKS.greatSinkhole.basin;
        for (let i = 0; i < 18; i++) {
          const a = (i / 18) * Math.PI * 2 + r(-0.1, 0.1), d = b.r * r(1.02, 1.15);
          rock(k, [0x7a766e, 0x6a665e, 0x8a867c][i % 3], [Math.cos(a) * d, this.#ground(site.x + Math.cos(a) * d, site.z + Math.sin(a) * d), Math.sin(a) * d], r(0.9, 2.2));
        }
        for (let i = 0; i < 22; i++) {
          const a = r(0, Math.PI * 2), d = b.r * 0.93, top = this.#ground(site.x + Math.cos(a) * b.r * 1.02, site.z + Math.sin(a) * b.r * 1.02);
          k.limb([Math.cos(a) * d, top, Math.sin(a) * d], [Math.cos(a) * d * 0.97, top - r(5, 14), Math.sin(a) * d * 0.97], 0.08, 0.05, 0x3e6a2a, 4);
        }
        water = { level: y0 + 1.2, r: b.r * 0.55, clean: false, mat: 'dark' };
        break;
      }
    }
    if (k.list.length) g.add(new Mesh(k.build(), this.material));
    for (const m of g.children) (m.castShadow = true), (m.receiveShadow = true);
    if (water) {
      water.mesh = this.#disc(g, water.r, water.level, this.waterMats[water.mat], water.x ?? 0, water.z ?? 0);
      water.mesh.castShadow = false;
      water.cx = site.x + (water.x ?? 0);
      water.cz = site.z + (water.z ?? 0);
    }
    if (falls) {
      // The falls: ribbons of white water streaming down, spray where they land.
      const tex = this.fallsTexture ??= (() => {
        const c = document.createElement('canvas');
        c.width = 32;
        c.height = 128;
        const x = c.getContext('2d');
        for (let i = 0; i < 40; i++) {
          x.fillStyle = `rgba(255,255,255,${0.25 + Math.random() * 0.6})`;
          x.fillRect(Math.random() * 32, Math.random() * 128, 2 + Math.random() * 4, 10 + Math.random() * 40);
        }
        const t = new CanvasTexture(c);
        t.wrapS = t.wrapT = RepeatWrapping;
        return t;
      })();
      this.fallsMat ??= new MeshBasicMaterial({ map: tex, color: 0xdff4ff, transparent: true, opacity: 0.85, depthWrite: false, side: DoubleSide });
      for (const f of falls) {
        const h = f.top - f.bottom;
        const m = new Mesh(new PlaneGeometry(3.2, h), this.fallsMat);
        m.position.set(f.x - site.x, f.bottom + h / 2, f.z - site.z);
        m.rotation.y = Math.atan2(-Math.cos(f.rot), -Math.sin(f.rot)); // (facing out over the pool)
        m.material.map.repeat.set(1, h / 8);
        g.add(m);
        const spray = new Sprite((this.sprayMat ??= new SpriteMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false })));
        spray.position.set(f.x - site.x, f.bottom + 1.2, f.z - site.z);
        spray.scale.set(6, 3, 1);
        g.add(spray);
      }
    }
    if (steam) {
      this.steamMat ??= new SpriteMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, depthWrite: false, blending: AdditiveBlending });
      steam.puffs = [];
      for (let i = 0; i < 10; i++) {
        const sp = new Sprite(this.steamMat);
        sp.userData = { a: (i / 10) * Math.PI * 2, d: Math.random() * steam.r, t: Math.random() * 6 };
        g.add(sp);
        steam.puffs.push(sp);
      }
    }
    this.scene.add(g);
    return { site, group: g, solids, water, steam, falls: !!falls };
  }

  // --- Each frame -----------------------------------------------------------------

  /** Builds those near (x, z), drops those gone far; steam and falls moving. Returns the sites built. */
  update(dt, x, z) {
    this.time += dt;
    this.wait -= dt;
    // (The squares round you not yet worked out: two a frame, so finding
    // where the landmarks are never stalls a frame for long.)
    const L = this.generator.landmarks;
    let todo = 2;
    for (const kind of Object.keys(LANDMARKS)) {
      const C = LANDMARKS[kind].cell;
      for (let k = Math.floor((z - 900) / C); k <= Math.floor((z + 900) / C) && todo > 0; k++) {
        for (let i = Math.floor((x - 900) / C); i <= Math.floor((x + 900) / C) && todo > 0; i++) if (!L.known(kind, i, k)) (L.site(kind, i, k), todo--);
      }
    }
    if (this.wait <= 0 && todo > 0) {
      this.wait = 1.5;
      const near = L.near(x, z, 900);
      const keep = new Set(near.map((s) => s.key));
      for (const [key, b] of this.built) if (!keep.has(key)) (this.scene.remove(b.group), this.built.delete(key));
      // (One built a time: a big one's a moment's work.)
      for (const s of near) if (!this.built.has(s.key)) { this.built.set(s.key, this.#build(s)); break; }
    }
    if (this.fallsMat) this.fallsMat.map.offset.y = (this.fallsMat.map.offset.y + dt * 1.6) % 1;
    for (const b of this.built.values()) {
      if (!b.steam) continue;
      for (const sp of b.steam.puffs) {
        const u = sp.userData;
        u.t += dt;
        const f = (u.t % 6) / 6;
        sp.position.set(Math.cos(u.a) * u.d, b.steam.level + 0.3 + f * 5, Math.sin(u.a) * u.d);
        sp.scale.setScalar(1.5 + f * 4);
        sp.material.opacity = 0.22;
      }
    }
    return this.built;
  }

  /** The top of what's solid at (x, z) (a rock's, a trunk's: walls to walk into, or tops to stand on), or -Infinity. */
  surfaceAt(x, z) {
    let top = -Infinity;
    for (const b of this.built.values()) {
      const s = b.site;
      if (Math.abs(s.x - x) > 40 || Math.abs(s.z - z) > 40) continue;
      for (const c of b.solids) if (Math.abs(c.x - x) < c.r && Math.hypot(c.x - x, c.z - z) < c.r) top = Math.max(top, c.top);
    }
    return top;
  }

  /** A landmark's water at (x, z), lying over `ground`: { level, clean, hot, landmark }, or null. */
  waterAt(x, z, ground) {
    for (const b of this.built.values()) {
      const w = b.water;
      if (!w || Math.abs(w.cx - x) > w.r || Math.abs(w.cz - z) > w.r) continue;
      if (Math.hypot(w.cx - x, w.cz - z) < w.r && ground < w.level) return { level: w.level, fx: 0, fz: 0, speed: 0, clean: w.clean, hot: !!w.hot, pond: !w.clean, landmark: b.site.kind };
    }
    return null;
  }

  /** The landmark you're at (within its reach), or null. */
  at(x, z) {
    let best = null, bd = Infinity;
    for (const b of this.built.values()) {
      const d = Math.hypot(b.site.x - x, b.site.z - z);
      const reach = LANDMARKS[b.site.kind].basin ? LANDMARKS[b.site.kind].basin.r + 20 : 40;
      if (d < reach && d < bd) (bd = d), (best = b.site);
    }
    return best;
  }
}
