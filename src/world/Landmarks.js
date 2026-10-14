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


// (A shape's corners pushed in and out a little, the same for every face
// that shares one: rock and ice and bark, not boxes.)
function jitter(geo, amount, seed) {
  const g = geo.index ? geo.toNonIndexed() : geo, pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const h = Math.sin(Math.round(x * 50) * 12.9898 + Math.round(y * 50) * 78.233 + Math.round(z * 50) * 37.719 + seed) * 43758.5453;
    const f = 1 + amount * ((h - Math.floor(h)) * 2 - 1);
    pos.setXYZ(i, x * f, y * f, z * f);
  }
  return g;
}

/** A rounded lump (a rock, a clump of leaves, a mass of ice): `size` m, squashed by `scale`. */
function blob(k, col, at, size, scale = [1, 1, 1], rough = 0.2) {
  return k.add(jitter(new IcosahedronGeometry(size, 1), rough, at[0] * 3.1 + at[2] * 1.7), col, at, [0, (at[0] * 7 + at[2] * 3) % 6.28, 0], scale, 0.1);
}

/** A crystal: a six-sided prism with a pointed tip, from its foot `at`, tilted. */
function crystal(k, col, at, len, rad, tilt = [0, 0, 0]) {
  const geo = mergeGeometries([new CylinderGeometry(rad, rad, len, 6).translate(0, len / 2, 0).toNonIndexed(), new ConeGeometry(rad, rad * 2.2, 6).translate(0, len + rad * 1.1, 0).toNonIndexed()]);
  return k.add(geo, col, at, tilt, [1, 1, 1], 0.06);
}


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
    if (site.kind === 'twinFalls' || site.kind === 'hotPools' || site.kind === 'glacierCave') {
      let best = -Infinity, up = 0;
      for (let n = 0; n < 16; n++) {
        const a = (n / 16) * Math.PI * 2, h = this.#ground(site.x + Math.cos(a) * 24, site.z + Math.sin(a) * 24);
        if (h > best) (best = h), (up = a);
      }
      site = { ...site, rot: up };
    }
    const g = new Group(), solids = [], R = mulberry32(site.seed), r = (a, b) => a + (b - a) * R();
    const pick = (list) => list[Math.floor(R() * list.length)];
    const y0 = this.#ground(site.x, site.z);
    g.position.set(site.x, 0, site.z);
    const local = (u, v) => [Math.cos(site.rot) * u - Math.sin(site.rot) * v, Math.sin(site.rot) * u + Math.cos(site.rot) * v];
    const gy = (dx, dz) => this.#ground(site.x + dx, site.z + dz);
    const at = (u, v) => {
      const [dx, dz] = local(u, v);
      return [dx, gy(dx, dz), dz];
    };
    const solid = (dx, dz, rad, top) => solids.push({ x: site.x + dx, z: site.z + dz, r: rad, top });
    const waters = [];
    let steam = null, falls = null;
    const k = new Kit(site.seed), glow = new Kit(site.seed + 1), icy = new Kit(site.seed + 2);
    // (Grass tufts and ferns, the little green round a place that makes it sit in the land.)
    const tufts = (n, rad, cols = [0x5a8a3a, 0x4a7a32, 0x6a9a44]) => {
      for (let i = 0; i < n; i++) {
        const a = r(0, Math.PI * 2), d = r(0.3, 1) * rad, x = Math.cos(a) * d, z = Math.sin(a) * d, y = gy(x, z);
        for (let j = 0; j < 4; j++) k.add(new ConeGeometry(0.06, r(0.4, 0.9), 3), pick(cols), [x + r(-0.25, 0.25), y + 0.2, z + r(-0.25, 0.25)], [r(-0.4, 0.4), r(0, 3), r(-0.4, 0.4)]);
      }
    };
    const fern = (x, y, z, size = 1, col = 0x4a7a32) => {
      for (let j = 0; j < 6; j++) {
        const a = (j / 6) * Math.PI * 2;
        k.add(new BoxGeometry(0.22 * size, 0.03, 0.9 * size), col, [x + Math.cos(a) * 0.35 * size, y + 0.3 * size, z + Math.sin(a) * 0.35 * size], [0.5, -a + Math.PI / 2, 0]);
      }
    };
    switch (site.kind) {
      case 'elderTree': {
        // A vast old oak, centuries old: a fluted, leaning trunk swelling at
        // its foot into buttress roots that crawl out over the ground; bark
        // in deep ridges, a hollow in its side, moss on its north face; great
        // crooked boughs and a crown of a hundred clumps of leaves; ferns and
        // mushrooms and fallen leaves round its foot.
        const bark = [0x4e3c2a, 0x5a4632, 0x46362a], moss = [0x4a6a34, 0x56783a], leaf = [0x2e5a24, 0x3a6a2a, 0x467a32, 0x2a4e20, 0x52843a];
        const S = 1.5; // (everything half again as big as it's laid out)
        const P = (x, y, z) => [x * S, y0 - 0.6 + y * S, z * S];
        // The trunk: five lengths, each leaning a little and narrowing.
        let px = 0, py = -0.5, pz = 0, rad = 3.4;
        const spine = [];
        for (let i = 0; i < 5; i++) {
          const nx = px + r(-0.5, 0.5), ny = py + 3.6, nz = pz + r(-0.5, 0.5), nr = rad * 0.86;
          k.limb(P(px, py, pz), P(nx, ny, nz), rad * S, nr * S, bark[i % 3], 10);
          spine.push([nx, ny, nz, nr]);
          (px = nx), (py = ny), (pz = nz), (rad = nr);
        }
        // Bark ridges up the trunk.
        for (let i = 0; i < 18; i++) {
          const a = (i / 18) * Math.PI * 2, h = r(5, 12);
          k.add(new BoxGeometry(0.35 * S, h * S, 0.4 * S), bark[i % 3], P(Math.cos(a) * 3.0, h / 2 - 0.2, Math.sin(a) * 3.0), [0, -a, r(-0.06, 0.06)]);
        }
        // The hollow, and moss on the trunk's shady side.
        k.add(new BoxGeometry(1.4 * S, 2.2 * S, 0.6 * S), 0x1a1410, P(Math.cos(0.6) * 3.0, 3.2, Math.sin(0.6) * 3.0), [0, -0.6 + Math.PI / 2, 0]);
        for (let i = 0; i < 10; i++) k.add(new BoxGeometry(r(0.6, 1.4) * S, r(0.8, 2) * S, 0.25 * S), pick(moss), P(Math.cos(-1.6 + r(-0.7, 0.7)) * 3.15, r(0.3, 6), Math.sin(-1.6 + r(-0.7, 0.7)) * 3.15), [0, r(0, 3), 0]);
        // Buttress roots, two lengths each, down into the ground.
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * Math.PI * 2 + r(-0.2, 0.2), o1 = r(4, 5.5), o2 = o1 + r(2, 4);
          k.limb(P(Math.cos(a) * 1.8, 2.6, Math.sin(a) * 1.8), P(Math.cos(a) * o1, 0.2, Math.sin(a) * o1), 1.25 * S, 0.7 * S, bark[i % 3], 6);
          k.limb(P(Math.cos(a) * o1, 0.2, Math.sin(a) * o1), P(Math.cos(a + r(-0.2, 0.2)) * o2, -0.6, Math.sin(a + r(-0.2, 0.2)) * o2), 0.7 * S, 0.25 * S, i % 3 ? bark[1] : moss[0], 5);
        }
        // Great boughs, crooked, each splitting into two or three, leaves at their ends.
        const tips = [];
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2 + r(-0.3, 0.3), from = spine[Math.floor(r(2, 4.99))];
          const mid = [from[0] + Math.cos(a) * r(4, 6), from[1] + r(2, 4), from[2] + Math.sin(a) * r(4, 6)];
          k.limb(P(from[0], from[1], from[2]), P(...mid), 1.3 * S, 0.8 * S, bark[i % 3], 7);
          for (let j = 0; j < 3; j++) {
            const b = a + r(-0.7, 0.7), end = [mid[0] + Math.cos(b) * r(3, 6), mid[1] + r(1, 4), mid[2] + Math.sin(b) * r(3, 6)];
            k.limb(P(...mid), P(...end), 0.75 * S, 0.3 * S, bark[(i + j) % 3], 5);
            tips.push(end);
          }
        }
        tips.push([px, py + 3, pz]);
        // The crown: clumps of leaves round every bough's end, in many greens, heavier and darker below.
        for (const [tx, ty, tz] of tips) {
          for (let j = 0; j < 5; j++) blob(k, pick(leaf), P(tx + r(-3, 3), ty + r(-1.5, 2.5), tz + r(-3, 3)), r(2.2, 3.6) * S, [1, r(0.6, 0.85), 1], 0.3);
        }
        for (let j = 0; j < 12; j++) blob(k, leaf[3], P(r(-9, 9), r(13, 16), r(-9, 9)), r(2.5, 3.5) * S, [1, 0.5, 1], 0.25); // (the shaded underside)
        // Round its foot: ferns, mushrooms, fallen leaves and acorns.
        for (let i = 0; i < 14; i++) {
          const a = r(0, Math.PI * 2), d = r(6, 13) * S, x = Math.cos(a) * d, z = Math.sin(a) * d;
          fern(x, gy(x, z), z, r(0.9, 1.5));
        }
        for (let i = 0; i < 12; i++) {
          const a = r(0, Math.PI * 2), d = r(5, 9) * S, x = Math.cos(a) * d, z = Math.sin(a) * d, y = gy(x, z);
          k.add(new CylinderGeometry(0.05, 0.06, 0.25, 5), 0xe8dcc0, [x, y + 0.12, z]).add(new CylinderGeometry(0.22, 0.05, 0.12, 7), pick([0xb8502a, 0xc8a060, 0x8a5a3a]), [x, y + 0.28, z]);
        }
        for (let i = 0; i < 60; i++) {
          const a = r(0, Math.PI * 2), d = r(4, 16) * S, x = Math.cos(a) * d, z = Math.sin(a) * d;
          k.add(new BoxGeometry(0.35, 0.02, 0.25), pick([0x8a6a2a, 0x6a7a2a, 0xa07a3a]), [x, gy(x, z) + 0.04, z], [0, r(0, 3), 0], [1, 1, 1], 0.15);
        }
        tufts(20, 18 * S);
        solid(0, 0, 3.4 * S, y0 + 40);
        break;
      }
      case 'stoneArch': {
        // A great arch of banded sandstone, weathered round: two massive
        // legs on a rubble apron, the span thinning to its crown, streaked
        // dark with desert varnish; a hoodoo standing off to one side,
        // fallen blocks and pebbles round about, a juniper clinging on.
        const band = [0xb4603a, 0xc87a4a, 0x9a4a30, 0xd09060, 0xa85a38], varnish = 0x5a3424;
        const half = 13, rise = 17;
        for (const sd of [-1, 1]) {
          const [lx, ly, lz] = at(sd * half, 0);
          // (A leg: rounded blocks, each layer its own band of colour, wider at the foot.)
          for (let i = 0; i < 9; i++) {
            const w = 7.2 - i * 0.35;
            for (let j = 0; j < 3; j++) blob(k, band[(i + j) % 5], [lx + local(r(-1, 1), r(-1, 1))[0], ly + i * 2.1 - 0.6, lz + local(r(-1, 1), r(-1, 1))[1]], w * 0.42, [1.25, 0.55, 1], 0.18);
            if (i % 3 === 1) k.add(new BoxGeometry(0.4, 1.8, 0.2), varnish, [lx + local(sd * -w * 0.45, 0)[0], ly + i * 2.1, lz + local(sd * -w * 0.45, 0)[1]], [0, site.rot, 0]);
          }
          solid(lx, lz, 3.6, ly + rise);
          // (Its apron of fallen rubble.)
          for (let i = 0; i < 10; i++) blob(k, pick(band), [lx + r(-6, 6), ly + 0.2, lz + r(-6, 6)], r(0.4, 1.4), [1, 0.7, 1], 0.3);
        }
        const [, ya] = at(-half, 0), [, yb] = at(half, 0), base = Math.max(ya, yb);
        // The span: overlapping rounded blocks along the curve, thickest at its feet, thin at the crown.
        for (let i = 0; i <= 26; i++) {
          const t = i / 26, a = Math.PI * t, u = -Math.cos(a) * half, thick = 2.2 + 1.8 * Math.abs(Math.cos(a));
          const [dx, dz] = local(u, 0);
          blob(k, band[i % 5], [dx, base + Math.sin(a) * rise + 1.5, dz], thick, [1.1, 0.8, 1.35], 0.15);
        }
        // A hoodoo off to one side: stacked, a capstone on top.
        const [hx, hy, hz] = at(r(-6, 6), 18);
        for (let i = 0; i < 5; i++) blob(k, band[i % 5], [hx, hy + i * 1.6, hz], 1.6 - i * 0.12, [1, 0.7, 1], 0.2);
        blob(k, 0x8a7a6a, [hx, hy + 8.2, hz], 2.2, [1.2, 0.5, 1.2], 0.15);
        solid(hx, hz, 1.6, hy + 8.5);
        // A gnarled juniper, and boulders and pebbles about.
        const [jx, jy, jz] = at(-half - 6, -6);
        k.limb([jx, jy, jz], [jx + 0.8, jy + 2.2, jz + 0.4], 0.25, 0.12, 0x6a5040, 5);
        for (let j = 0; j < 4; j++) blob(k, 0x4a5a3a, [jx + r(-1, 1.6), jy + r(2, 3.2), jz + r(-1, 1.4)], r(0.7, 1.1), [1, 0.7, 1], 0.3);
        for (let i = 0; i < 26; i++) {
          const [x, y, z] = at(r(-24, 24), r(-16, 16));
          blob(k, pick(band), [x, y + 0.1, z], r(0.2, 0.9), [1, 0.6, 1], 0.3);
        }
        break;
      }
      case 'crystalLake': {
        // A clear lake in a high bowl, its shore of grey boulders and
        // clusters of great crystals, violet and ice-blue and white, some
        // standing out in the shallows; reeds in its bays.
        const lake = this.#lake(site);
        waters.push({ ...lake, clean: true, mat: 'crystal' });
        const B = LANDMARKS.crystalLake.basin.r;
        const cluster = (x, z, size) => {
          const y = gy(x, z), col = pick([[0x9ae8ff, 0xc8f4ff], [0xc8a0ff, 0xe0c8ff], [0xf0f4ff, 0xc8e0ff]]);
          for (let j = 0; j < 9; j++) crystal(glow, col[j % 2], [x + r(-0.8, 0.8) * size, Math.max(y, lake.level - 1) - 0.2, z + r(-0.8, 0.8) * size], r(1.2, 3.6) * size, r(0.18, 0.4) * size, [r(-0.5, 0.5), 0, r(-0.5, 0.5)]);
          blob(k, 0x7a7a80, [x, Math.max(y, lake.level - 1), z], 0.9 * size, [1.3, 0.5, 1.3], 0.25);
        };
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2 + r(-0.15, 0.15), d = B * r(0.88, 1.2);
          cluster(Math.cos(a) * d, Math.sin(a) * d, r(0.8, 1.6));
        }
        for (let i = 0; i < 3; i++) {
          const a = r(0, Math.PI * 2), d = B * r(0.3, 0.6);
          cluster(Math.cos(a) * d, Math.sin(a) * d, r(1.3, 2)); // (out in the water)
        }
        for (let i = 0; i < 30; i++) {
          const a = r(0, Math.PI * 2), d = B * r(1.0, 1.35), x = Math.cos(a) * d, z = Math.sin(a) * d;
          blob(k, pick([0x7a7a78, 0x8a8a86, 0x6a6c6a]), [x, gy(x, z), z], r(0.6, 2), [1, 0.6, 1], 0.3);
        }
        for (let i = 0; i < 10; i++) {
          const a = r(0, Math.PI * 2), d = B * r(0.9, 1.0), x = Math.cos(a) * d, z = Math.sin(a) * d;
          for (let j = 0; j < 7; j++) k.add(new CylinderGeometry(0.03, 0.04, r(1.2, 2.2), 3), pick([0x6a8a3a, 0x8a9a4a]), [x + r(-0.8, 0.8), lake.level + 0.6, z + r(-0.8, 0.8)], [r(-0.15, 0.15), 0, r(-0.15, 0.15)]);
        }
        tufts(18, B * 1.4);
        break;
      }
      case 'twinFalls': {
        // A cliff of layered rock across the uphill side of a cold pool,
        // ledges and an overhang, moss and ferns in its cracks; a stream
        // over its lip split by a rock into two falls, white with foam where
        // they land; mossy boulders in the pool, spray hanging over it.
        const b = LANDMARKS.twinFalls.basin;
        const lake = this.#lake(site);
        waters.push({ ...lake, clean: true, mat: 'clear' });
        const behind = this.#ground(site.x + Math.cos(site.rot) * b.r * 1.7, site.z + Math.sin(site.rot) * b.r * 1.7);
        const top = Math.max(lake.level + 13, behind + 1);
        const strata = [0x6a6862, 0x7a7670, 0x5e5c58, 0x84807a, 0x6e6a60];
        // The cliff: rows of rock, each layer stepping a little in or out.
        for (let v = -18; v <= 18; v += 2.4) {
          const curve = (v / 18) ** 2 * 5;
          for (let h = lake.level - 2; h < top; h += 1.6) {
            const layer = Math.floor((h - lake.level) / 1.6), out = (layer % 3) * 0.5 + r(-0.3, 0.3) - curve;
            const [dx, dz] = local(b.r * 1.05 - out, v);
            blob(k, strata[(layer + 5) % 5], [dx, h, dz], 1.5, [1.6, 0.7, 1.4], 0.15);
          }
          const [sx, sz] = local(b.r * 1.05 - curve, v);
          solid(sx, sz, 2.6, top);
        }
        // (The overhang at the top, and moss and ferns on the ledges.)
        for (let v = -14; v <= 14; v += 3) {
          const [dx, dz] = local(b.r * 0.9, v);
          blob(k, strata[1], [dx, top - 0.5, dz], 2, [1.4, 0.5, 1.4], 0.15);
          if (R() < 0.6) {
            const [fx, fz] = local(b.r * 0.95, v + 1.2);
            fern(fx, lake.level + r(3, 10), fz, r(0.8, 1.3));
          }
          if (R() < 0.7) k.add(new BoxGeometry(2, 0.3, 1.2), pick([0x4a6a34, 0x56783a]), [dx, lake.level + r(2, 11), dz], [0, -site.rot, 0]);
        }
        // The stream above, and the rock that splits it.
        for (const v of [-4.5, 4.5]) {
          const [cx, cz] = local(b.r * 1.3, v);
          const m = new Mesh(new PlaneGeometry(3.4, 8), this.waterMats.clear);
          m.rotation.set(-Math.PI / 2, 0, -site.rot);
          m.position.set(cx, top + 0.05, cz);
          g.add(m);
        }
        const [rx, rz] = local(b.r * 1.1, 0);
        blob(k, strata[2], [rx, top + 0.5, rz], 2.2, [1, 0.8, 1.6], 0.2);
        falls = [];
        for (const v of [-4.5, 4.5]) {
          const [fx, fz] = local(b.r * 0.92, v);
          falls.push({ x: site.x + fx, z: site.z + fz, top: top + 0.1, bottom: lake.level, rot: site.rot });
        }
        // Boulders in the pool, mossy on top.
        for (let i = 0; i < 9; i++) {
          const a = r(0, Math.PI * 2), d = b.r * r(0.2, 0.8), x = Math.cos(a) * d, z = Math.sin(a) * d, sz = r(0.6, 1.6);
          blob(k, strata[i % 5], [x, lake.level - 0.3, z], sz, [1, 0.7, 1], 0.25);
          k.add(new BoxGeometry(sz * 1.1, 0.12, sz * 1.1), 0x4a6a34, [x, lake.level - 0.3 + sz * 0.6, z], [0, r(0, 3), 0]);
        }
        tufts(16, b.r * 1.8);
        break;
      }
      case 'standingStones': {
        // A ring of tall rough stones on the crown of a hill, each tapering
        // and leaning a little, blotched with lichen; a trilithon (two
        // uprights, a lintel across) facing the rising sun; an altar slab
        // on two stones at the heart; one stone fallen and broken; a worn
        // ring in the turf; a cairn.
        const grey = [0x8a8a84, 0x7a7c78, 0x9a9890, 0x6e706c], lichen = [0xc8b84a, 0x9aa848, 0xd8d0a0];
        const stone = (x, z, h, w, lean, spin) => {
          const y = gy(x, z);
          const geo = jitter(new CylinderGeometry(w * 0.32, w * 0.5, h, 5, 3), 0.12, site.seed + Math.round(x * 7 + z * 13));
          k.add(geo, pick(grey), [x, y + h / 2 - 0.5, z], [lean, spin, r(-0.06, 0.06)], [1, 1, 0.65]);
          for (let j = 0; j < 4; j++) k.add(new CircleGeometry(r(0.15, 0.35), 6), pick(lichen), [x + Math.cos(spin) * w * 0.33, y + r(0.4, h - 1), z - Math.sin(spin) * w * 0.33], [0, spin + Math.PI / 2, 0]);
          solid(x, z, w * 0.45, y + h);
        };
        for (let i = 0; i < 13; i++) {
          const a = (i / 13) * Math.PI * 2, x = Math.cos(a) * 11, z = Math.sin(a) * 11;
          if (i === 4 || i === 5) continue; // (the trilithon stands there)
          if (i === 9) {
            // (Fallen, and broken in two.)
            const y = gy(x, z);
            k.add(jitter(new CylinderGeometry(0.5, 0.65, 2.4, 5, 2), 0.1, 3), grey[1], [x, y + 0.3, z], [Math.PI / 2, 0, a + 0.3]);
            k.add(jitter(new CylinderGeometry(0.4, 0.5, 1.8, 5, 2), 0.1, 4), grey[2], [x + Math.cos(a + 1.9) * 2.3, y + 0.25, z + Math.sin(a + 1.9) * 2.3], [Math.PI / 2, 0, a + 0.1]);
            continue;
          }
          stone(x, z, r(3.6, 5.2), r(1.4, 1.9), r(-0.08, 0.08), -a + Math.PI / 2);
        }
        // The trilithon.
        const ta = (4.5 / 13) * Math.PI * 2, tx = Math.cos(ta) * 11, tz = Math.sin(ta) * 11;
        const ux = -Math.sin(ta) * 1.6, uz = Math.cos(ta) * 1.6;
        stone(tx + ux, tz + uz, 5.6, 1.7, 0, -ta + Math.PI / 2);
        stone(tx - ux, tz - uz, 5.6, 1.7, 0, -ta + Math.PI / 2);
        k.add(jitter(new BoxGeometry(5.2, 1.1, 1.3), 0.08, 9), grey[0], [tx, gy(tx, tz) + 5.6, tz], [0, -ta + Math.PI / 2, 0]);
        // The altar.
        for (const s2 of [-1, 1]) k.add(jitter(new BoxGeometry(0.8, 0.9, 0.8), 0.06, 11 + s2), grey[3], [s2 * 1.1, y0 + 0.35, 0]);
        k.add(jitter(new BoxGeometry(3.4, 0.4, 1.6), 0.06, 13), grey[2], [0, y0 + 0.95, 0], [0, 0.3, 0]);
        solid(0, 0, 1.6, y0 + 1.15);
        // The worn ring of the turf, and a cairn outside it.
        for (let i = 0; i < 40; i++) {
          const a = (i / 40) * Math.PI * 2, x = Math.cos(a) * 13.5, z = Math.sin(a) * 13.5;
          k.add(new CircleGeometry(1.3, 6), 0x8a7a54, [x, gy(x, z) + 0.05, z], [-Math.PI / 2, 0, 0], [1, 1, 1], 0.2);
        }
        const [cx, cy, cz] = at(19, 5);
        for (let i = 0; i < 9; i++) blob(k, pick(grey), [cx + r(-0.6, 0.6), cy + 0.3 + Math.floor(i / 3) * 0.55, cz + r(-0.6, 0.6)], 0.5 - Math.floor(i / 3) * 0.1, [1, 0.6, 1], 0.2);
        tufts(30, 22, [0x6a8a3a, 0x8a9a4a, 0x7a9440]);
        break;
      }
      case 'sunkenForest': {
        // Still dark water over a drowned forest: grey dead trunks standing
        // in it, their roots flared at the waterline, tops snapped off, bare
        // branches, beards of moss hanging; lily pads, floating logs,
        // stumps showing; mist lying low over it.
        const lake = this.#lake(site);
        waters.push({ ...lake, clean: false, mat: 'dark' });
        const B = LANDMARKS.sunkenForest.basin.r;
        const dead = [0x8a8478, 0x6e685e, 0x9a9488, 0x7a7468];
        for (let i = 0; i < 34; i++) {
          const a = r(0, Math.PI * 2), d = Math.sqrt(R()) * B * 0.92, x = Math.cos(a) * d, z = Math.sin(a) * d, foot = Math.min(gy(x, z), lake.level) - 0.4;
          const h = r(4, 14), lean = [r(-0.8, 0.8), r(-0.8, 0.8)], col = pick(dead), rad = r(0.3, 0.6);
          if (R() < 0.18) {
            // (A stump, just showing.)
            k.limb([x, foot, z], [x, lake.level + r(0.3, 1.2), z], rad * 1.2, rad, col, 6);
            continue;
          }
          k.limb([x, foot, z], [x + lean[0], lake.level + h, z + lean[1]], rad, rad * 0.25, col, 6);
          for (let j = 0; j < 4; j++) {
            const b = r(0, Math.PI * 2);
            k.limb([x + Math.cos(b) * rad, lake.level + 0.2, z + Math.sin(b) * rad], [x + Math.cos(b) * rad * 3, lake.level - 0.3, z + Math.sin(b) * rad * 3], rad * 0.4, rad * 0.15, col, 4); // (roots at the waterline)
          }
          for (let j = 0; j < (h > 8 ? 3 : 1); j++) {
            const by = lake.level + h * r(0.45, 0.9), b = r(0, Math.PI * 2), len = r(1.2, 3);
            k.limb([x + lean[0] * (by - lake.level) / h, by, z + lean[1] * (by - lake.level) / h], [x + Math.cos(b) * len, by + r(0.4, 1.6), z + Math.sin(b) * len], 0.12, 0.04, col, 4);
            if (R() < 0.5) k.add(new BoxGeometry(0.05, r(0.6, 1.4), 0.3), 0x6a7a4a, [x + Math.cos(b) * len * 0.6, by - 0.3, z + Math.sin(b) * len * 0.6], [0, b, 0]); // (moss hanging)
          }
          solid(x, z, rad + 0.1, lake.level + h);
        }
        for (let i = 0; i < 40; i++) {
          const a = r(0, Math.PI * 2), d = Math.sqrt(R()) * B * 0.9;
          k.add(new CircleGeometry(r(0.35, 0.7), 7, 0.3, Math.PI * 1.8), pick([0x4a7a3a, 0x3a6a30, 0x5a8a44]), [Math.cos(a) * d, lake.level + 0.03, Math.sin(a) * d], [-Math.PI / 2, 0, r(0, 6)]);
          if (R() < 0.15) k.add(new IcosahedronGeometry(0.12, 0), 0xf0e8f0, [Math.cos(a) * d, lake.level + 0.1, Math.sin(a) * d]); // (a water lily)
        }
        for (let i = 0; i < 5; i++) {
          const a = r(0, Math.PI * 2), d = r(0.2, 0.8) * B, x = Math.cos(a) * d, z = Math.sin(a) * d, b = r(0, Math.PI);
          k.limb([x, lake.level, z], [x + Math.cos(b) * r(4, 8), lake.level + 0.05, z + Math.sin(b) * r(4, 8)], 0.4, 0.3, pick(dead), 6);
        }
        steam = { r: B * 0.8, level: lake.level, mist: true };
        break;
      }
      case 'petrifiedLog': {
        // A giant tree that fell and turned to stone, half sunk in the
        // flats: broken into lengths, its bark still showing in ridges of
        // rust and ochre stone, the breaks showing its rings in bands of
        // agate; its root-ball at one end; chips and agates all round.
        const cols = [0xa87a50, 0x8a5a3e, 0xc0a080, 0x7a6a6a, 0xb06a4a, 0x9a6a5a];
        const L = 34, n = 7;
        let rad = 1.9;
        for (let i = 0; i < n; i++) {
          const u0 = -L / 2 + (i * L) / n + r(0, 0.4), u1 = u0 + L / n - r(0.5, 1.2);
          const [ax, ay, az] = at(u0, r(-0.4, 0.4)), [bx, by, bz] = at(u1, r(-0.4, 0.4));
          const base = (ay + by) / 2 + rad * 0.45, nr = rad * 0.94;
          k.limb([ax, base, az], [bx, base + (by - ay) * 0.3, bz], rad, nr, cols[i % 6], 11);
          // (Bark ridges along it.)
          for (let j = 0; j < 8; j++) {
            const a = (j / 8) * Math.PI * 2, oy = Math.sin(a) * rad, ov = Math.cos(a) * rad;
            if (oy < -rad * 0.4) continue;
            const [ox, oz] = local(0, ov);
            k.limb([ax + ox, base + oy, az + oz], [bx + ox, base + oy + (by - ay) * 0.3, bz + oz], 0.16, 0.14, cols[(i + j + 1) % 6], 4);
          }
          // (The rings at the break, as bands of colour.)
          for (let j = 0; j < 4; j++) {
            const disc = new CylinderGeometry(rad * (1 - j * 0.22), rad * (1 - j * 0.22), 0.06, 11).rotateZ(Math.PI / 2).rotateY(-site.rot);
            k.add(disc, [0xd8c0a0, 0xc87a5a, 0xe8d8c0, 0x9a6a8a][j], [ax - Math.cos(site.rot) * (0.02 + j * 0.02), base, az - Math.sin(site.rot) * (0.02 + j * 0.02)]);
          }
          for (let t = 0; t <= 1; t += 0.34) solid(ax + (bx - ax) * t, az + (bz - az) * t, rad, base + rad * 0.9);
          rad = nr;
        }
        // The root-ball, turned to stone too.
        const [rx, ry, rz] = at(-L / 2 - 1.5, 0);
        for (let j = 0; j < 9; j++) {
          const a = (j / 9) * Math.PI * 2;
          k.limb([rx, ry + 1.4, rz], [rx + Math.cos(a) * 0.4 - Math.cos(site.rot) * 2, ry + 1.4 + Math.sin(a) * r(2, 3.4), rz + Math.sin(a) * 0.4 - Math.sin(site.rot) * 2], 0.5, 0.15, pick(cols), 5);
        }
        blob(k, cols[1], [rx, ry + 1.2, rz], 2, [0.7, 1, 1], 0.2);
        // Chips and agates weathered out of it.
        for (let i = 0; i < 50; i++) {
          const [x, y, z] = at(r(-L / 2 - 4, L / 2 + 4), r(-6, 6));
          blob(k, pick(cols), [x, y + 0.05, z], r(0.12, 0.45), [1, 0.5, 1], 0.3);
        }
        for (let i = 0; i < 12; i++) {
          const [x, y, z] = at(r(-L / 2, L / 2), r(-5, 5));
          glow.add(new OctahedronGeometry(r(0.1, 0.2), 0), pick([0xe08a6a, 0xc8a0e0, 0x9ad8c8]), [x, y + 0.12, z]);
        }
        break;
      }
      case 'boneField': {
        // The bleached skeleton of something enormous, half buried in the
        // sand: a spine of great vertebrae with their spines up, the ribs
        // arching over, its skull with dark sockets and a row of teeth, two
        // curving tusks; leg bones scattered; smaller skeletons about; and
        // the camp of the hunters who found it: a hide tent, a fire ring,
        // spears stood in the sand, a drying rack.
        const bone = [0xe8e0cc, 0xd8ceb6, 0xf0e8d6, 0xc8bea4];
        const N = 18, len = 26;
        const spine = [];
        for (let i = 0; i < N; i++) {
          const u = -len / 2 + (i / (N - 1)) * len, [dx, y, dz] = at(u, 0), lift = 3.4 * Math.sin(((i + 1) / (N + 1)) * Math.PI);
          const sy = y + 0.4 + lift * 0.5;
          spine.push([dx, sy, dz, lift]);
          k.add(jitter(new BoxGeometry(1.0, 0.9, 1.1), 0.06, i), bone[i % 4], [dx, sy, dz], [0, -site.rot, 0]);
          k.add(new ConeGeometry(0.22, 1.2 + lift * 0.3, 4), bone[(i + 1) % 4], [dx, sy + 0.9 + lift * 0.15, dz], [0, 0, 0]);
          if (i > 2 && i < N - 4) {
            for (const sd of [-1, 1]) {
              // (A rib: five lengths, arching out and over and down into the sand.)
              let [px, py, pz] = [dx, sy, dz];
              const span = 2.2 + lift * 0.7;
              for (let j = 1; j <= 5; j++) {
                const t = j / 5, out = Math.sin(t * Math.PI * 0.62) * span, down = (1 - Math.cos(t * Math.PI * 0.95)) * (sy - y + 0.6);
                const [ox, oz] = local(r(-0.1, 0.1), sd * out);
                const ny = sy + 0.8 * Math.sin(t * Math.PI) - down;
                k.limb([px, py, pz], [dx + ox, ny, dz + oz], 0.2 - j * 0.02, 0.18 - j * 0.02, bone[j % 4], 5);
                [px, py, pz] = [dx + ox, ny, dz + oz];
              }
            }
          }
        }
        // The skull.
        const [hx, hy, hz] = at(len / 2 + 2.6, 0);
        k.add(jitter(new BoxGeometry(3.4, 2.4, 4.6), 0.1, 31), bone[0], [hx, hy + 1.2, hz], [0.08, -site.rot, 0]);
        k.add(jitter(new BoxGeometry(2.6, 0.7, 3.8), 0.08, 32), bone[3], [hx, hy + 0.1, hz], [0.25, -site.rot, 0]); // (the jaw, dropped open)
        for (const sd of [-1, 1]) {
          const [ex, ez] = local(0.6, sd * 1.2);
          k.add(new BoxGeometry(0.9, 0.8, 0.9), 0x1e1a14, [hx + ex, hy + 1.7, hz + ez], [0, -site.rot, 0]); // (the eye sockets)
          // (A tusk, curving up and out.)
          let [tx, ty, tz] = [hx + local(1.8, sd * 0.9)[0], hy + 0.6, hz + local(1.8, sd * 0.9)[1]];
          for (let j = 1; j <= 5; j++) {
            const [nx, nz] = local(1.8 + j * 0.9, sd * (0.9 + j * 0.35));
            const ny = hy + 0.6 - j * 0.15 + j * j * 0.12;
            k.limb([tx, ty, tz], [hx + nx, ny, hz + nz], 0.32 - j * 0.04, 0.28 - j * 0.04, 0xf4ecd8, 6);
            [tx, ty, tz] = [hx + nx, ny, hz + nz];
          }
        }
        for (let j = 0; j < 8; j++) {
          const [ox, oz] = local(2.2, -1 + j * 0.28);
          k.add(new ConeGeometry(0.1, 0.4, 4), 0xf4ecd8, [hx + ox, hy - 0.2, hz + oz], [Math.PI, 0, 0]); // (teeth)
        }
        solid(hx, hz, 2.5, hy + 2.4);
        // Leg bones, scattered where they fell.
        for (let i = 0; i < 6; i++) {
          const [x, y, z] = at(r(-len / 2, len / 2), pick([-1, 1]) * r(5, 9)), a = r(0, Math.PI);
          const ex = x + Math.cos(a) * r(3, 5), ez = z + Math.sin(a) * r(3, 5);
          k.limb([x, y + 0.3, z], [ex, gy(ex, ez) + 0.3, ez], 0.35, 0.28, pick(bone), 6);
          blob(k, pick(bone), [x, y + 0.35, z], 0.6, [1, 0.8, 1], 0.1);
          blob(k, pick(bone), [ex, gy(ex, ez) + 0.35, ez], 0.55, [1, 0.8, 1], 0.1);
        }
        // Smaller skeletons about: an antelope's skull and horns, a scatter of bones.
        for (let i = 0; i < 4; i++) {
          const [x, y, z] = at(r(-22, 22), r(-16, 16));
          k.add(new BoxGeometry(0.4, 0.3, 0.6), bone[0], [x, y + 0.15, z], [0, r(0, 3), 0]);
          for (const sd of [-1, 1]) k.limb([x + sd * 0.12, y + 0.3, z], [x + sd * 0.4, y + 1.0, z - 0.3], 0.05, 0.03, 0x3a3028, 4);
          for (let j = 0; j < 5; j++) k.add(new CylinderGeometry(0.05, 0.05, r(0.4, 0.9), 4), pick(bone), [x + r(-1.5, 1.5), y + 0.05, z + r(-1.5, 1.5)], [Math.PI / 2, r(0, 3), 0]);
        }
        // The hunters' camp.
        const [cx, cy, cz] = at(-6, 12);
        for (let i = 0; i < 9; i++) blob(k, 0x6a6662, [cx + Math.cos(i * 0.7) * 1.0, cy + 0.1, cz + Math.sin(i * 0.7) * 1.0], 0.28, [1, 0.7, 1], 0.2);
        k.add(new CircleGeometry(0.75, 8), 0x1e1a18, [cx, cy + 0.04, cz], [-Math.PI / 2, 0, 0]);
        for (let i = 0; i < 4; i++) k.limb([cx + r(-0.4, 0.4), cy + 0.05, cz + r(-0.4, 0.4)], [cx + r(-0.5, 0.5), cy + 0.15, cz + r(-0.5, 0.5)], 0.07, 0.06, 0x2a2018, 4);
        const [tx, ty, tz] = at(-9, 15);
        k.add(new ConeGeometry(2, 3, 7, 1, true), 0x9a7a52, [tx, ty + 1.5, tz], [0, 0, 0], [1, 1, 1], 0.1);
        for (let i = 0; i < 5; i++) k.limb([tx + Math.cos(i * 1.25) * 1.9, ty, tz + Math.sin(i * 1.25) * 1.9], [tx, ty + 3.4, tz], 0.05, 0.04, 0x6a5038, 4);
        solid(tx, tz, 1.9, ty + 3);
        for (let i = 0; i < 3; i++) {
          const [sx, sy, sz] = at(-3 + i * 0.8, 9.5);
          k.limb([sx, sy - 0.3, sz], [sx + 0.2, sy + 2.2, sz], 0.04, 0.03, 0x6a5038, 4).add(new ConeGeometry(0.07, 0.3, 4), 0x3e4250, [sx + 0.2, sy + 2.35, sz]);
        }
        const [dx, dy, dz] = at(-2, 15);
        for (const sd of [-1, 1]) k.limb([dx + sd, dy, dz], [dx + sd, dy + 1.6, dz], 0.05, 0.05, 0x6a5038, 4);
        k.limb([dx - 1, dy + 1.5, dz], [dx + 1, dy + 1.5, dz], 0.04, 0.04, 0x6a5038, 4);
        for (let i = 0; i < 4; i++) k.add(new BoxGeometry(0.15, 0.5, 0.04), 0x7a3a2a, [dx - 0.7 + i * 0.45, dy + 1.2, dz]);
        tufts(10, 25, [0xa89a5a, 0xb8a868, 0x8a8a4a]);
        break;
      }
      case 'glacierCave': {
        // The snout of a little glacier on a mountainside: a wall of old
        // blue ice, cracked and seamed, snow lying on top of it, a great
        // arched mouth in it with icicles hanging from its lip; inside, a
        // blue grotto, crystals in its walls, a frozen pool; blocks of ice
        // calved off in front, a meltwater pool at its foot.
        const ice = [0xa8d8f0, 0x88c4e8, 0xc8e8f8, 0x6aa8d8, 0x5a98c8], snow = 0xf4f8fc;
        const cx = Math.cos(site.rot), cz = Math.sin(site.rot);
        // The ice wall: a horseshoe of great masses round the grotto, open downhill.
        for (let i = 0; i < 26; i++) {
          const a = (i / 26) * Math.PI * 2;
          const off = Math.abs(Math.atan2(Math.sin(a - site.rot - Math.PI), Math.cos(a - site.rot - Math.PI)));
          if (off < 0.42) continue; // (the mouth, facing downhill)
          const d = r(8, 9.5), x = Math.cos(a) * d, z = Math.sin(a) * d, y = gy(x, z), h = r(7, 10);
          blob(icy, pick(ice), [x, y + h * 0.45, z], 3, [1, h / 6, 1], 0.12);
          blob(icy, snow, [x, y + h * 0.9, z], 2.6, [1.1, 0.35, 1.1], 0.06);
          solid(x, z, 2.2, y + h);
        }
        // The roof over the grotto, its arch over the mouth, icicles along the lip.
        blob(icy, ice[1], [cx * 2, y0 + 8.5, cz * 2], 9.5, [1, 0.32, 1], 0.1);
        blob(icy, snow, [cx * 2, y0 + 10.2, cz * 2], 9, [1.05, 0.22, 1.05], 0.05);
        for (let i = 0; i < 26; i++) {
          const v = r(-4, 4), [lx, lz] = [-cx * 7.5 - Math.sin(site.rot) * v, -cz * 7.5 + Math.cos(site.rot) * v];
          icy.add(new ConeGeometry(r(0.12, 0.3), r(0.8, 2.6), 5), ice[2], [lx, y0 + 6.2, lz], [Math.PI, 0, 0]);
        }
        for (let i = 0; i < 24; i++) icy.add(new ConeGeometry(r(0.1, 0.25), r(0.6, 2), 5), ice[0], [r(-6, 6), y0 + 6, r(-6, 6)], [Math.PI, 0, 0]);
        // Seams and cracks in the ice.
        for (let i = 0; i < 14; i++) {
          const a = site.rot + r(-2, 2), x = Math.cos(a) * 9.6, z = Math.sin(a) * 9.6;
          icy.add(new BoxGeometry(0.15, r(2, 5), 0.6), ice[4], [x, gy(x, z) + r(2, 5), z], [0, -a, r(-0.3, 0.3)]);
        }
        // Inside: crystals, and a frozen pool.
        for (let i = 0; i < 10; i++) {
          const a = r(0, Math.PI * 2), d = r(4, 7);
          crystal(glow, pick([0x9ae8ff, 0xc8f4ff]), [Math.cos(a) * d, y0 + r(0.2, 3), Math.sin(a) * d], r(0.8, 1.8), r(0.15, 0.3), [r(-0.8, 0.8), 0, r(-0.8, 0.8)]);
        }
        icy.add(new CylinderGeometry(3, 3, 0.15, 12), 0xc8ecff, [cx * 1.5, y0 + 0.12, cz * 1.5]);
        // Calved blocks in front, and the meltwater pool at its foot.
        for (let i = 0; i < 8; i++) {
          const [x, y, z] = at(-r(11, 18), r(-8, 8));
          blob(icy, pick(ice), [x, y + 0.5, z], r(0.8, 1.8), [1, 0.8, 1], 0.15);
        }
        const [mx, my, mz] = at(-13, 0);
        waters.push({ level: my + 0.25, r: 3, clean: true, mat: 'crystal', x: mx, z: mz, small: true });
        // Snow lying round about.
        for (let i = 0; i < 26; i++) {
          const a = r(0, Math.PI * 2), d = r(9, 20), x = Math.cos(a) * d, z = Math.sin(a) * d;
          k.add(new CircleGeometry(r(1.2, 3), 7), snow, [x, gy(x, z) + 0.06, z], [-Math.PI / 2, 0, 0], [1, 1, 1], 0.04);
        }
        break;
      }
      case 'hotPools': {
        // Steaming pools on terraces of white travertine stepping down a
        // slope: the great pool at the top, and below it pool after pool,
        // each held in a scalloped rim of stone, the rims stained cream and
        // orange where the water spills over; mineral crust all round; the
        // water milky turquoise; steam rising.
        const lake = this.#lake(site);
        waters.push({ ...lake, clean: false, hot: true, mat: 'hot' });
        const white = [0xf0ece0, 0xe4dcc8, 0xf8f4ea, 0xe8d8b8], stain = [0xd89a5a, 0xc8803a, 0xe0b880];
        const B = LANDMARKS.hotPools.basin.r;
        // The great pool's rim.
        for (let i = 0; i < 44; i++) {
          const a = (i / 44) * Math.PI * 2, d = B * 1.02;
          k.add(new BoxGeometry(2.2, 0.6, 1.0), i % 6 === 0 ? pick(stain) : pick(white), [Math.cos(a) * d, lake.level + 0.15, Math.sin(a) * d], [0, -a, 0]);
        }
        // Terraces stepping down the slope (away from the uphill side): each a little pool in its scalloped rim.
        let level = lake.level;
        for (let t = 0; t < 6; t++) {
          const u = -(B + 4 + t * 5.5), v = r(-4, 4) + Math.sin(t * 1.7) * 3;
          const [tx, ty, tz] = at(u, v);
          level = Math.min(level - 0.7, ty + 0.5);
          const rad = r(3, 4.5);
          for (let i = 0; i < 18; i++) {
            const a = (i / 18) * Math.PI * 2, scal = 1 + 0.12 * Math.sin(a * 6);
            k.add(new BoxGeometry(1.5, 0.5, 0.6), i % 4 === 0 ? pick(stain) : pick(white), [tx + Math.cos(a) * rad * scal, level - 0.05, tz + Math.sin(a) * rad * scal], [0, -a, 0]);
          }
          k.add(new CylinderGeometry(rad * 1.15, rad * 1.35, Math.max(0.6, level - ty + 0.6), 14), pick(white), [tx, (level + ty) / 2 - 0.35, tz]);
          waters.push({ level: level + 0.05, r: rad * 0.95, clean: false, hot: true, mat: 'hot', x: tx, z: tz, small: true });
          // (Its overflow, a sheet of stain down the front of its rim.)
          k.add(new BoxGeometry(2, Math.max(0.5, level - ty + 0.4), 0.15), pick(stain), [tx + local(-rad, 0)[0], (level + ty) / 2 - 0.2, tz + local(-rad, 0)[1]], [0, -site.rot + Math.PI / 2, 0]);
        }
        // Mineral crust all round.
        for (let i = 0; i < 40; i++) {
          const a = r(0, Math.PI * 2), d = r(B * 1.05, B * 2.2), x = Math.cos(a) * d, z = Math.sin(a) * d;
          k.add(new CircleGeometry(r(1, 2.6), 7), pick([...white, ...stain]), [x, gy(x, z) + 0.05, z], [-Math.PI / 2, 0, 0], [1, 1, 1], 0.1);
        }
        steam = { r: B * 0.85, level: lake.level };
        break;
      }
      case 'eagleSpire': {
        // A lone needle of weathered rock some 40 m high on a knoll: rounded
        // blocks stacked and leaning, narrowing up it, cracked, ledges with
        // grass and a stunted pine or two on them; the eagles' great nest of
        // sticks on its top, two eggs in it, one eagle sat by; a scree of
        // fallen rock round its foot.
        const cols = [0x8a7a6a, 0x7a6a5a, 0x9a8a78, 0x6e6052];
        let h = y0 - 2, w = 9, ox = 0, oz = 0;
        for (let i = 0; i < 16; i++) {
          const bh = r(2.6, 3.4);
          ox += r(-0.35, 0.35);
          oz += r(-0.35, 0.35);
          blob(k, cols[i % 4], [ox, h + bh / 2, oz], w * 0.5, [1, bh / (w * 0.5) * 0.6, r(0.8, 1)], 0.16);
          if (i % 3 === 1) {
            // (A ledge, with grass on it; on some, a stunted pine.)
            const a = r(0, Math.PI * 2), lx = ox + Math.cos(a) * w * 0.5, lz = oz + Math.sin(a) * w * 0.5;
            k.add(new BoxGeometry(1.6, 0.25, 1.2), 0x5a7a3a, [lx, h + bh, lz], [0, -a, 0]);
            if (R() < 0.5) k.limb([lx, h + bh, lz], [lx + Math.cos(a) * 0.6, h + bh + 1.4, lz + Math.sin(a) * 0.6], 0.08, 0.05, 0x5a4030, 4).add(new ConeGeometry(0.6, 1.2, 6), 0x2e5030, [lx + Math.cos(a) * 0.6, h + bh + 1.6, lz + Math.sin(a) * 0.6]);
          }
          if (i % 4 === 2) k.add(new BoxGeometry(0.2, bh * 0.9, 0.5), 0x3a322a, [ox + w * 0.48, h + bh / 2, oz], [0, r(0, 3), 0]); // (a crack)
          h += bh * 0.92;
          w *= 0.9;
        }
        // The nest, the eggs, the eagle.
        for (let i = 0; i < 26; i++) {
          const a = r(0, Math.PI * 2), rr = r(1.2, 2);
          k.limb([ox + Math.cos(a) * rr, h + r(0, 0.4), oz + Math.sin(a) * rr], [ox + Math.cos(a + 1.4) * rr, h + r(0, 0.5), oz + Math.sin(a + 1.4) * rr], 0.07, 0.05, pick([0x6a5038, 0x5a4030, 0x7a6048]), 4);
        }
        k.add(new CylinderGeometry(1.3, 1.1, 0.3, 9), 0x4a3a28, [ox, h + 0.15, oz]);
        for (const sd of [-0.3, 0.3]) k.add(new IcosahedronGeometry(0.16, 1), 0xe8e0d0, [ox + sd, h + 0.4, oz], [0, 0, 0], [0.85, 1.1, 0.85]);
        const [ex, ez] = [ox + 1.6, oz - 0.4];
        k.add(new IcosahedronGeometry(0.35, 1), 0x4a3424, [ex, h + 0.9, ez], [0.3, 0, 0], [0.8, 1.2, 0.9]).add(new IcosahedronGeometry(0.2, 1), 0xf4f0e8, [ex, h + 1.45, ez + 0.1]).add(new ConeGeometry(0.06, 0.18, 4), 0xe8b030, [ex, h + 1.42, ez + 0.32], [Math.PI / 2, 0, 0]);
        solid(0, 0, 4.6, h);
        // Scree round its foot.
        for (let i = 0; i < 40; i++) {
          const a = r(0, Math.PI * 2), d = r(4.5, 13), x = Math.cos(a) * d, z = Math.sin(a) * d;
          blob(k, pick(cols), [x, gy(x, z) + 0.1, z], r(0.25, 1.4), [1, 0.6, 1], 0.3);
        }
        for (let i = 0; i < 16; i++) {
          const a = r(0, Math.PI * 2), d = r(3, 10), x = Math.cos(a) * d, z = Math.sin(a) * d;
          k.add(new BoxGeometry(0.04, 0.01, r(0.3, 0.6)), 0x3a3028, [x, gy(x, z) + 0.03, z], [0, r(0, 3), 0]); // (feathers fallen from the nest)
        }
        break;
      }
      case 'greatSinkhole': {
        // A great round pit where the limestone gave way: its lip of broken
        // rock, its walls banded in layers of grey and cream with ledges
        // all the way down, ferns and vines hanging down them; a thin fall
        // of water from a spring off one side; at the bottom, trees fallen
        // in, mossy boulders, a dark pool.
        const b = LANDMARKS.greatSinkhole.basin;
        const lime = [0x9a968c, 0x8a867c, 0xb0aa9a, 0x7a766e, 0xc8c0aa];
        const floor = y0;
        // The walls: rings of rock down the inside of the pit.
        for (let i = 0; i < 36; i++) {
          const a = (i / 36) * Math.PI * 2, top = gy(Math.cos(a) * b.r * 1.02, Math.sin(a) * b.r * 1.02);
          for (let hgt = floor + 1; hgt < top - 1; hgt += 2.6) {
            const d = b.r * (0.86 + 0.06 * ((hgt - floor) / Math.max(1, top - floor))) + r(-0.4, 0.4);
            blob(k, lime[Math.floor((hgt - floor) / 2.6) % 5], [Math.cos(a) * d, hgt, Math.sin(a) * d], 1.8, [1.2, 0.75, 1.2], 0.15);
          }
          // (Ferns on its ledges; vines hanging down.)
          if (i % 2 === 0) {
            const hgt = r(floor + 3, top - 2), d = b.r * 0.82;
            fern(Math.cos(a) * d, hgt, Math.sin(a) * d, r(0.7, 1.2));
          }
          if (i % 3 === 0) k.limb([Math.cos(a) * b.r * 0.95, top, Math.sin(a) * b.r * 0.95], [Math.cos(a) * b.r * 0.85, top - r(6, 16), Math.sin(a) * b.r * 0.85], 0.07, 0.04, pick([0x3e6a2a, 0x4a7a32]), 4);
        }
        // The broken lip.
        for (let i = 0; i < 28; i++) {
          const a = (i / 28) * Math.PI * 2 + r(-0.08, 0.08), d = b.r * r(1.0, 1.12), x = Math.cos(a) * d, z = Math.sin(a) * d;
          blob(k, pick(lime), [x, gy(x, z), z], r(0.8, 2.2), [1, 0.6, 1], 0.25);
        }
        // A spring's thin fall down one side.
        const fa = site.rot, ftop = gy(Math.cos(fa) * b.r * 1.02, Math.sin(fa) * b.r * 1.02);
        falls = [{ x: site.x + Math.cos(fa) * b.r * 0.84, z: site.z + Math.sin(fa) * b.r * 0.84, top: ftop, bottom: floor + 1.2, rot: fa, width: 1.4 }];
        // At the bottom: trees fallen in, boulders, the pool.
        for (let i = 0; i < 4; i++) {
          const a = r(0, Math.PI * 2), x = Math.cos(a) * b.r * 0.5, z = Math.sin(a) * b.r * 0.5, b2 = a + r(1, 2);
          k.limb([x, floor + 1, z], [x + Math.cos(b2) * 9, floor + r(3, 9), z + Math.sin(b2) * 9], 0.4, 0.2, 0x5a4632, 6);
        }
        for (let i = 0; i < 14; i++) {
          const a = r(0, Math.PI * 2), d = r(0.3, 0.75) * b.r, x = Math.cos(a) * d, z = Math.sin(a) * d, sz = r(0.6, 2);
          blob(k, pick(lime), [x, floor + 0.5, z], sz, [1, 0.7, 1], 0.25);
          k.add(new BoxGeometry(sz * 1.1, 0.12, sz * 1.1), 0x4a6a34, [x, floor + 0.5 + sz * 0.62, z], [0, r(0, 3), 0]);
        }
        waters.push({ level: floor + 1.2, r: b.r * 0.55, clean: false, mat: 'dark' });
        break;
      }
    }
    if (k.list.length) g.add(new Mesh(k.build(), this.material));
    if (icy.list.length) g.add(new Mesh(icy.build(), this.iceMaterial));
    if (glow.list.length) g.add(new Mesh(glow.build(), this.glowMaterial));
    for (const m of g.children) (m.castShadow = true), (m.receiveShadow = true);
    for (const w of waters) {
      // (Positions given relative to the site; the ones from at() and local() are already.)
      w.mesh = this.#disc(g, w.r, w.level, this.waterMats[w.mat], w.x ?? 0, w.z ?? 0);
      w.mesh.castShadow = false;
      w.cx = site.x + (w.x ?? 0);
      w.cz = site.z + (w.z ?? 0);
    }
    if (falls) {
      // The falls: ribbons of white water streaming down, spray and foam where they land.
      const tex = this.fallsTexture ??= (() => {
        const c = document.createElement('canvas');
        c.width = 32;
        c.height = 128;
        const x = c.getContext('2d');
        x.fillStyle = 'rgba(200,230,255,0.35)';
        x.fillRect(0, 0, 32, 128);
        for (let i = 0; i < 60; i++) {
          x.fillStyle = `rgba(255,255,255,${0.3 + Math.random() * 0.6})`;
          x.fillRect(Math.random() * 32, Math.random() * 128, 1 + Math.random() * 4, 10 + Math.random() * 40);
        }
        const t = new CanvasTexture(c);
        t.wrapS = t.wrapT = RepeatWrapping;
        return t;
      })();
      this.fallsMat ??= new MeshBasicMaterial({ map: tex, color: 0xeef8ff, transparent: true, opacity: 0.9, depthWrite: false, side: DoubleSide });
      this.sprayMat ??= new SpriteMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false });
      for (const f of falls) {
        const h = f.top - f.bottom;
        const m = new Mesh(new PlaneGeometry(f.width ?? 3.4, h), this.fallsMat);
        m.position.set(f.x - site.x, f.bottom + h / 2, f.z - site.z);
        m.rotation.y = Math.atan2(-Math.cos(f.rot), -Math.sin(f.rot)); // (facing out over the pool)
        g.add(m);
        for (let i = 0; i < 4; i++) {
          const spray = new Sprite(this.sprayMat);
          spray.position.set(f.x - site.x + r(-1.2, 1.2), f.bottom + r(0.5, 2), f.z - site.z + r(-1.2, 1.2));
          spray.scale.set(r(3, 6), r(2, 3.5), 1);
          g.add(spray);
        }
        const foam = new Mesh(new CircleGeometry((f.width ?? 3.4) * 0.9, 12).rotateX(-Math.PI / 2), (this.foamMat ??= new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false })));
        foam.position.set(f.x - site.x, f.bottom + 0.06, f.z - site.z);
        g.add(foam);
      }
    }
    if (steam) {
      this.steamMat ??= new SpriteMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, depthWrite: false, blending: AdditiveBlending });
      this.mistMat ??= new SpriteMaterial({ color: 0xd8e0e0, transparent: true, opacity: 0.14, depthWrite: false });
      steam.puffs = [];
      for (let i = 0; i < (steam.mist ? 16 : 12); i++) {
        const sp = new Sprite(steam.mist ? this.mistMat : this.steamMat);
        sp.userData = { a: (i / 12) * Math.PI * 2 + Math.random(), d: Math.random() * steam.r, t: Math.random() * 6 };
        g.add(sp);
        steam.puffs.push(sp);
      }
    }
    this.scene.add(g);
    return { site, group: g, solids, waters, steam, falls: !!falls };
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
        if (b.steam.mist) {
          // (Mist lying over still water: drifting, never rising far.)
          sp.position.set(Math.cos(u.a + u.t * 0.03) * u.d, b.steam.level + 0.8 + Math.sin(u.t * 0.4) * 0.3, Math.sin(u.a + u.t * 0.03) * u.d);
          sp.scale.set(14, 3, 1);
        } else {
          sp.position.set(Math.cos(u.a) * u.d, b.steam.level + 0.3 + f * 5, Math.sin(u.a) * u.d);
          sp.scale.setScalar(1.5 + f * 4);
        }
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
      for (const w of b.waters) {
        if (Math.abs(w.cx - x) > w.r || Math.abs(w.cz - z) > w.r) continue;
        if (Math.hypot(w.cx - x, w.cz - z) < w.r && ground < w.level) return { level: w.level, fx: 0, fz: 0, speed: 0, clean: w.clean, hot: !!w.hot, pond: !w.clean, landmark: b.site.kind };
      }
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
