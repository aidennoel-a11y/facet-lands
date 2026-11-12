import { BufferAttribute, BufferGeometry, Color, DoubleSide, DynamicDrawUsage, Group, InstancedMesh, Matrix4, MeshLambertMaterial, Quaternion, Vector3 } from 'three';
import { hash2 } from '../../noise/random.js';
import { addWind } from '../../render/wind.js';
import { GRASS_PUSHERS, grassPushers } from './GrassLayer.js';
import { placeUnderstory } from '../decorPlacement.js';

/** Collects triangles with a colour per vertex into a geometry. */
function build(tris) {
  const pos = [], col = [];
  for (const [a, b, c, ca, cb, cc] of tris) {
    pos.push(...a, ...b, ...c);
    col.push(...ca, ...cb, ...cc);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
  g.computeVertexNormals();
  return g;
}

const DARK = [0.55, 0.62, 0.5], MID = [0.85, 0.92, 0.8], LIGHT = [1.05, 1.1, 0.95];

/**
 * A broad-leaved plant (elephant ears, philodendrons): big, heart-shaped
 * leaves on long stalks fanning out and drooping from the middle, about a
 * metre and a half across.
 */
function leafy(seed, plain = false, far = false) {
  const tris = [];
  const n = 6;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + hash2(k, 1, seed) * 0.5;
    const ca = Math.cos(a), sa = Math.sin(a), px = -sa, pz = ca;
    const reach = 0.35 + 0.25 * hash2(k, 2, seed), up = 0.55 + 0.35 * hash2(k, 3, seed);
    const base = [ca * reach, up, sa * reach]; // where the stalk meets the leaf
    // The stalk: a slender four-sided stem, thick enough to see.
    const sw = 0.035;
    const around = [[px * sw, 0, pz * sw], [ca * sw, 0, sa * sw], [-px * sw, 0, -pz * sw], [-ca * sw, 0, -sa * sw]];
    // (Seen from further off, plain: the stalk one flat strip, not four sides.)
    if (plain) {
      const a0 = around[0], a1 = around[2], t0 = [base[0] + a0[0] * 0.5, base[1], base[2] + a0[2] * 0.5], t1 = [base[0] + a1[0] * 0.5, base[1], base[2] + a1[2] * 0.5];
      tris.push([a0, a1, t1, DARK, DARK, MID], [a0, t1, t0, DARK, MID, MID]);
    }
    for (let q = 0; q < (plain ? 0 : 4); q++) {
      const a0 = around[q], a1 = around[(q + 1) % 4];
      const t0 = [base[0] + a0[0] * 0.5, base[1], base[2] + a0[2] * 0.5], t1 = [base[0] + a1[0] * 0.5, base[1], base[2] + a1[2] * 0.5];
      tris.push([a0, a1, t1, DARK, DARK, MID], [a0, t1, t0, DARK, MID, MID]);
    }
    // The leaf: out and down from the stalk, widest near its base.
    const len = 0.55 + 0.3 * hash2(k, 4, seed), w = len * 0.42;
    const mid = [base[0] + ca * len * 0.45, base[1] - len * 0.12, base[2] + sa * len * 0.45];
    const tip = [base[0] + ca * len, base[1] - len * 0.45, base[2] + sa * len];
    const l = [mid[0] + px * w, mid[1] + 0.05, mid[2] + pz * w], r = [mid[0] - px * w, mid[1] + 0.05, mid[2] - pz * w];
    // (Far off: the leaf alone, two triangles of it, the same size and colours.)
    if (far) {
      tris.length -= 2;
      tris.push([base, l, tip, MID, LIGHT, LIGHT], [base, tip, r, MID, LIGHT, LIGHT]);
      continue;
    }
    tris.push([base, l, mid, MID, LIGHT, MID], [base, mid, r, MID, MID, LIGHT], [mid, l, tip, MID, LIGHT, LIGHT], [mid, tip, r, MID, LIGHT, LIGHT]);
  }
  return build(tris);
}

/**
 * A fern: a ring of fronds, each a strip of leaflets narrowing to its tip,
 * `n` of them `len` long, rising `rise` and drooping `droop` (a metre or
 * so across, by default: arching out and down). `w` how broad a frond is;
 * `strap`, a broad, smooth leaf (a bird's-nest fern's) rather than a
 * feathery one; `trunk`, standing on a short stump.
 */
function fern(seed, { n = 9, len = 0.6, rise = 0.55, droop = 0.6, w = 0.09, strap = false, trunk = 0 } = {}, plain = false, far = false) {
  const tris = [];
  if (trunk > 0) {
    // (The stump: a few rough sides, dark and shaggy.)
    for (let k = 0; k < 5; k++) {
      const a0 = (k / 5) * Math.PI * 2, a1 = ((k + 1) / 5) * Math.PI * 2, r0 = 0.09, r1 = 0.07;
      const b0 = [Math.cos(a0) * r0, 0, Math.sin(a0) * r0], b1 = [Math.cos(a1) * r0, 0, Math.sin(a1) * r0];
      const t0 = [Math.cos(a0) * r1, trunk, Math.sin(a0) * r1], t1 = [Math.cos(a1) * r1, trunk, Math.sin(a1) * r1];
      tris.push([b0, b1, t1, DARK, DARK, DARK], [b0, t1, t0, DARK, DARK, DARK]);
    }
  }
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + hash2(k, 5, seed) * 0.4;
    const ca = Math.cos(a), sa = Math.sin(a), px = -sa, pz = ca;
    const l = len * (0.75 + 0.5 * hash2(k, 6, seed));
    const pts = [0, 0.35, 0.7, 1].map((t) => [ca * l * t, trunk + 0.1 + rise * t - droop * t * t, sa * l * t]);
    // (Its stem, from the ground or the stump up to where the leaflets start, and on along the frond as a midrib.)
    const st = 0.022;
    // (Seen from further off, plain: the fronds alone, without the hair-thin stem and midrib or the little leaflets.)
    if (!plain) tris.push([[px * st, trunk, pz * st], [-px * st, trunk, -pz * st], [pts[0][0], pts[0][1], pts[0][2]], DARK, DARK, DARK]);
    for (let sg = 0; sg < (plain ? 0 : 2); sg++) {
      const p0 = pts[sg], p1 = pts[sg + 1], w0 = st * (1 - sg * 0.35), w1 = st * (0.65 - sg * 0.3);
      tris.push([[p0[0] + px * w0, p0[1] - 0.012, p0[2] + pz * w0], [p0[0] - px * w0, p0[1] - 0.012, p0[2] - pz * w0], [p1[0] - px * w1, p1[1] - 0.012, p1[2] - pz * w1], DARK, DARK, MID]);
      tris.push([[p0[0] + px * w0, p0[1] - 0.012, p0[2] + pz * w0], [p1[0] - px * w1, p1[1] - 0.012, p1[2] - pz * w1], [p1[0] + px * w1, p1[1] - 0.012, p1[2] + pz * w1], DARK, MID, MID]);
    }
    // (Far off: each frond one bent blade, the same length, rise and droop, its widest where the frond's is.)
    if (far) {
      const ww = w * (strap ? 0.95 : 1.15), m = pts[1], tip = pts[3];
      tris.push([pts[0], [m[0] + px * ww, m[1], m[2] + pz * ww], tip, DARK, MID, LIGHT], [pts[0], tip, [m[0] - px * ww, m[1], m[2] - pz * ww], DARK, LIGHT, MID]);
      continue;
    }
    for (let sg = 0; sg < 3; sg++) {
      const f = (sg + 0.5) / 3, ww = w * (strap ? 1.1 - 0.5 * f : Math.sin(Math.PI * (0.3 + 0.7 * f)));
      const p0 = pts[sg], p1 = pts[sg + 1];
      const l0 = [p0[0] + px * ww, p0[1], p0[2] + pz * ww], r0 = [p0[0] - px * ww, p0[1], p0[2] - pz * ww];
      tris.push([p0, l0, p1, DARK, MID, LIGHT], [p0, p1, r0, DARK, LIGHT, MID]);
      if (!strap && !plain) {
        // (Leaflets: little blades off each side of the frond.)
        const m = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2];
        for (const side of [1, -1]) tris.push([l0.map((v, i) => (v + p0[i]) / 2), [m[0] + px * ww * 2.2 * side, m[1] - 0.03, m[2] + pz * ww * 2.2 * side], m, MID, LIGHT, MID]);
      }
    }
  }
  return build(tris);
}

// (Kinds 0 and 1 the big-leaved plants, 2 the common fern, 3-6 the jungle's other ferns: see placeUnderstory.)
const PLANTS = [
  { shape: leafy(3), plain: leafy(3, true), far: leafy(3, true, true), colors: [0x3f7d2f, 0x4a8a34, 0x2f6a2a, 0x5a9a3a] },
  { shape: leafy(11), plain: leafy(11, true), far: leafy(11, true, true), colors: [0x356f2c, 0x4f8f3a, 0x3a7a30] },
  { shape: fern(7), plain: fern(7, {}, true), far: fern(7, {}, true, true), colors: [0x4a7f33, 0x5a8f3a, 0x3f7430, 0x6a9a44] },
  // (A shuttlecock fern: tall fronds standing up out of the middle in a vase.)
  { shape: fern(13, { n: 8, len: 0.45, rise: 1.25, droop: 0.35, w: 0.08 }), plain: fern(13, { n: 8, len: 0.45, rise: 1.25, droop: 0.35, w: 0.08 }, true), far: fern(13, { n: 8, len: 0.45, rise: 1.25, droop: 0.35, w: 0.08 }, true, true), colors: [0x5a9a3a, 0x4f8a30, 0x6aa848] },
  // (A bird's-nest fern: broad smooth bright straps in a rosette.)
  { shape: fern(19, { n: 10, len: 0.75, rise: 0.5, droop: 0.4, w: 0.13, strap: true }), plain: fern(19, { n: 10, len: 0.75, rise: 0.5, droop: 0.4, w: 0.13, strap: true }, true), far: fern(19, { n: 10, len: 0.75, rise: 0.5, droop: 0.4, w: 0.13, strap: true }, true, true), colors: [0x6aa83a, 0x7ab848, 0x5a9a30] },
  // (A low lacy fern: many fine fronds lying out flat, wide across.)
  { shape: fern(23, { n: 14, len: 0.85, rise: 0.25, droop: 0.3, w: 0.06 }), plain: fern(23, { n: 14, len: 0.85, rise: 0.25, droop: 0.3, w: 0.06 }, true), far: fern(23, { n: 14, len: 0.85, rise: 0.25, droop: 0.3, w: 0.06 }, true, true), colors: [0x3e6e2c, 0x4a7a34, 0x355f28] },
  // (A little tree fern: fronds arching out from the top of a shaggy stump.)
  { shape: fern(29, { n: 9, len: 0.8, rise: 0.4, droop: 0.65, w: 0.1, trunk: 0.55 }), plain: fern(29, { n: 9, len: 0.8, rise: 0.4, droop: 0.65, w: 0.1, trunk: 0.55 }, true), far: fern(29, { n: 9, len: 0.8, rise: 0.4, droop: 0.65, w: 0.1, trunk: 0.55 }, true, true), colors: [0x4a8a36, 0x3f7a2e, 0x55963c] },
];
const color = new Color();
const m4 = new Matrix4(), p = new Vector3(), q = new Quaternion(), tilt = new Quaternion(), s = new Vector3(), yAxis = new Vector3(0, 1, 0), up = new Vector3();

// Where the plants stand near you, by chunk (world x, z, size, ...): to hear them as you push through.
const plantSets = new Set();
/** How much of a plant you're in at (x, z): 0 none, 1 right in the middle of one. */
export function plantsAt(x, z) {
  let most = 0;
  for (const set of plantSets) {
    if (x < set.x0 - 2 || z < set.z0 - 2 || x > set.x0 + set.size + 2 || z > set.z0 + set.size + 2) continue;
    const a = set.list;
    for (let k = 0; k < a.length; k += 3) {
      const r = a[k + 2] * 0.75, dx = x - a[k], dz = z - a[k + 1];
      if (Math.abs(dx) > r || Math.abs(dz) > r) continue;
      most = Math.max(most, 1 - Math.hypot(dx, dz) / r);
    }
  }
  return most;
}

/**
 * Bent aside by whatever's pushing through (you, the bigger animals: the
 * grass's pushers), each leaf by how near it is; then springing back.
 */
function addPush(material) {
  const previous = material.onBeforeCompile, key = material.customProgramCacheKey?.() ?? '';
  material.onBeforeCompile = (shader, renderer) => {
    previous?.call(material, shader, renderer);
    shader.uniforms.uPushers = grassPushers;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nuniform vec4 uPushers[${GRASS_PUSHERS}];`)
      .replace(
        '#include <project_vertex>',
        /* glsl */ `{
          // (The whole plant leans away from you together, from its foot:
          // pushed by where its root is, not leaf by leaf, so nothing stretches.)
          vec3 wv = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          vec2 push = vec2(0.0);
          for (int i = 0; i < ${GRASS_PUSHERS}; i++) {
            vec4 q = uPushers[i];
            if (q.z <= 0.0) break;
            vec2 off = wv.xz - q.xy;
            float d = length(off);
            float f = 1.0 - smoothstep(q.z * 0.5, q.z * 1.6, d);
            if (f > 0.0) push += (off / max(d, 0.05)) * f;
          }
          float pushed = min(1.0, length(push));
          if (pushed > 0.0) {
            // (Its lean, as a turn about its foot: over and down, never longer.)
            vec3 local = inverse(mat3(instanceMatrix)) * vec3(push.x, 0.0, push.y);
            vec2 dir = length(local.xz) > 1e-4 ? normalize(local.xz) : vec2(0.0);
            float a = pushed * 0.5236, c = cos(a), sn = sin(a); // (30 degrees at the most)
            float hgt = max(transformed.y, 0.0), along = dot(transformed.xz, dir);
            vec2 side = transformed.xz - dir * along;
            float na = along * c + hgt * sn, ny = -along * sn + hgt * c;
            transformed.xz = side + dir * na;
            transformed.y = transformed.y < 0.0 ? transformed.y : ny;
          }
        }
        #include <project_vertex>`,
      );
  };
  material.customProgramCacheKey = () => key + '-pushed2';
  return material;
}

/**
 * The forest floor's plants: thick in the jungle (big-leaved plants and
 * ferns everywhere under the trees), and a few ferns in the pine woods. They sway a little in the wind. On the chunks
 * right around you.
 */
export function createUnderstoryLayer(config) {
  const material = addPush(addWind(new MeshLambertMaterial({ vertexColors: true, side: DoubleSide, flatShading: true }), { strength: 0.02, speed: 1.3 }));

  // Within some 35 m of you, each plant in full; past that, plain (the same
  // fronds and leaves, without the hair-thin stems and the little leaflets,
  // a pixel or two there): half the triangles or less, and a jungle floor
  // holds thousands of them.
  // (And past 85 m, plainer still: each frond one bent blade, each leaf two
  // triangles: a sixth of the triangles, where a whole plant's a dozen pixels.)
  const NEAR = 35, FAR = 85, live = new Set();
  let lastX = Infinity, lastZ = Infinity, changed = true;
  // Every near chunk's plants drawn together: for each kind, one mesh in
  // full, one plain, one far (see sort), shared by all the chunks: three
  // draws a kind, not three a kind for every chunk. Their instances in the
  // world's own frame.
  const all = new Group();
  all.name = 'understory';
  const shared = PLANTS.map((pl) => {
    const make = (shape) => {
      const mesh = new InstancedMesh(shape, material, 64);
      mesh.count = 0;
      mesh.visible = false;
      mesh.frustumCulled = false; // (spread over the chunks all round you)
      mesh.receiveShadow = true;
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      all.add(mesh);
      return mesh;
    };
    // (The plants right round you cast their shadows, basic ones: their
    // shapes as they are, not swaying. Further off they'd be specks.)
    const full = make(pl.shape);
    full.castShadow = true;
    return { full, plain: make(pl.plain), far: make(pl.far) };
  });
  // (Grown, when there are more plants than room: its buffers made afresh.)
  const room = (k, which, need) => {
    const mesh = shared[k][which];
    if (mesh.instanceMatrix.count >= need) return mesh;
    const size = Math.max(need, mesh.instanceMatrix.count * 2);
    const fresh = new InstancedMesh(mesh.geometry, material, size);
    fresh.frustumCulled = false;
    fresh.receiveShadow = true;
    fresh.castShadow = which === 'full';
    fresh.instanceMatrix.setUsage(DynamicDrawUsage);
    fresh.setColorAt(0, white);
    all.remove(mesh);
    mesh.dispose();
    all.add(fresh);
    return (shared[k][which] = fresh);
  };
  const white = new Color(1, 1, 1);
  const sort = (ex, ez) => {
    const counts = shared.map(() => ({ full: 0, plain: 0, far: 0 }));
    // (How many of each first, so there's room.)
    for (const group of live) for (const k of group.userData.kinds) {
      const c = counts[k.kind];
      for (const it of k.items) {
        const d2 = (it[2] - ex) ** 2 + (it[3] - ez) ** 2;
        it[4] = d2 < NEAR * NEAR ? 'full' : d2 < FAR * FAR ? 'plain' : 'far';
        c[it[4]]++;
      }
    }
    shared.forEach((_, k) => {
      for (const w of ['full', 'plain', 'far']) {
        const mesh = room(k, w, counts[k][w]);
        mesh.count = 0;
      }
    });
    for (const group of live) for (const k of group.userData.kinds) {
      const S = shared[k.kind];
      for (const [m, c, , , w] of k.items) {
        const mesh = S[w], n = mesh.count++;
        mesh.setMatrixAt(n, m);
        mesh.setColorAt(n, c);
      }
    }
    for (const S of shared) for (const w of ['full', 'plain', 'far']) {
      const mesh = S[w];
      mesh.visible = mesh.count > 0;
      if (!mesh.visible) continue;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  };

  return {
    name: 'understory',
    material,

    reuseKey: ({ lod }) => (lod > 0 ? 'none' : 'near'),
    tilesFor: () => all,
    get tileGroup() {
      return all;
    },

    build({ cx, cz, lod, generator, groundHeightAt, prepared }) {
      if (lod > 0) return null;
      // (Where they grow: worked out by a chunk worker; here only if it wasn't.)
      const data = prepared && prepared.understory !== undefined ? prepared.understory : placeUnderstory(generator, config, cx, cz, groundHeightAt);
      if (!data) return null;
      const placed = PLANTS.map(() => []);
      const size = config.chunkSize, x0 = cx * size, z0 = cz * size, where = [];
      // (The lie of the ground under each: it leans with the slope, a little less than the slope.)
      const lean = (x, z) => {
        const e = 0.6, c = (v) => Math.min(size - 0.01, Math.max(0, v));
        const xa = c(x - e), xb = c(x + e), za = c(z - e), zb = c(z + e);
        const hx = groundHeightAt(xb, z) - groundHeightAt(xa, z), hz = groundHeightAt(x, zb) - groundHeightAt(x, za);
        return Number.isFinite(hx) && Number.isFinite(hz) && xb > xa && zb > za ? [hx / (xb - xa), hz / (zb - za)] : [0, 0];
      };
      for (let k = 0; k < data.length; k += 7) {
        const pl = PLANTS[data[k]];
        const [gx, gz] = lean(data[k + 1], data[k + 3]);
        placed[data[k]].push([data[k + 1], data[k + 2], data[k + 3], data[k + 4], data[k + 5], pl.colors[Math.floor(data[k + 6] * pl.colors.length)], gx, gz]);
        where.push(x0 + data[k + 1], z0 + data[k + 3], data[k + 4]);
      }
      if (!placed.some((l) => l.length)) return null;
      // (Drawn with every near chunk's, in the shared meshes: see sort. Here,
      // each plant's world transform and colour, by kind.)
      const root = new Group(), kinds = [];
      placed.forEach((list, k) => {
        if (!list.length) return;
        const items = list.map(([x, y, z, sc, turn, c, gx, gz]) => {
          // (Sunk a little on a slope, so its downhill side doesn't stand off the ground.)
          p.set(x + x0, y - 0.12 * Math.min(1, Math.hypot(gx, gz)) * sc, z + z0);
          up.set(-gx * 0.7, 1, -gz * 0.7).normalize();
          tilt.setFromUnitVectors(yAxis, up);
          q.setFromAxisAngle(yAxis, turn * Math.PI * 2).premultiply(tilt);
          s.set(sc, sc * (0.85 + 0.3 * turn), sc);
          return [m4.compose(p, q, s).clone(), new Color().setHex(c), x + x0, z + z0, 'full'];
        });
        kinds.push({ kind: k, items });
      });
      root.name = 'understory';
      root.userData.plants = { x0, z0, size, list: where };
      root.userData.kinds = kinds;
      plantSets.add(root.userData.plants);
      live.add(root);
      changed = true;
      return root;
    },

    dispose(group) {
      plantSets.delete(group.userData.plants);
      if (live.delete(group)) changed = true;
    },

    /** Sorts the near chunks' plants into full and plain round `eye` (when you've moved a few metres). */
    refresh(eye) {
      const moved = Math.hypot(eye.x - lastX, eye.z - lastZ) >= 4;
      if (!moved && !changed) return;
      (lastX = eye.x), (lastZ = eye.z), (changed = false);
      sort(eye.x, eye.z);
    },
  };
}
