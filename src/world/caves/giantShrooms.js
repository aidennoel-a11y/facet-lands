import { BufferAttribute, BufferGeometry, Color, CylinderGeometry, IcosahedronGeometry, LatheGeometry, Vector2 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * The giant mushrooms of the mushroom forests, each of a few kinds:
 *  - a dome: a pale stem flaring at the foot, a broad domed cap;
 *  - one leaning over, its stem curving, its cap tipped;
 *  - a toadstool: a fat white stem and a round red cap spotted white;
 *  - a parasol: tall and slender, a wide flat cap, scaled;
 *  - a cluster: three from one foot, leaning out.
 * Caps come in browns, violets, sea-greens that glow, tans, rust reds.
 * Built once to a height of 1 (drawn scaled), with the cave rock's
 * attributes (see CaveLayer); and in pieces, for one cut down to fall apart in.
 */
export const SHROOM_KINDS = ['dome', 'lean', 'toadstool', 'parasol', 'cluster'];
export const SHROOM_CAPS = [
  [0x9a5a34, 0xc08a5a, null],
  [0x7a4a6a, 0xa86a94, [0.16, 0.05, 0.2]],
  [0x2e7a7a, 0x5ac8c0, [0.04, 0.26, 0.24]],
  [0xb8925a, 0xe0c890, null],
  [0x8a2e26, 0xd8a890, null],
];
const TOAD = [0xb81e14, 0xe8382a, null];
const PARASOL = [0x9a7a56, 0xd8c4a0, null];

/** What a giant mushroom (by its seed `s`, 0..1) is: { kind (index), cap ([dark, light, glow]), capIndex, ratio (cap radius to height) }. */
export function shroomOf(s) {
  const kind = s < 0.36 ? 0 : s < 0.58 ? 1 : s < 0.71 ? 2 : s < 0.85 ? 3 : 4;
  const capIndex = kind === 2 ? -1 : kind === 3 ? -2 : Math.floor(s * 991) % SHROOM_CAPS.length;
  const cap = kind === 2 ? TOAD : kind === 3 ? PARASOL : SHROOM_CAPS[capIndex];
  const ratio = [0.42, 0.38, 0.62, 0.58, 0.3][kind];
  return { kind, cap, capIndex, ratio, glows: !!cap[2] };
}
/** How tall one grows, from its seed and the room over it. */
export function shroomHeight(kind, s, room) {
  const h = [3 + s * 9, 3.5 + s * 8, 1.6 + s * 3, 6 + s * 8, 2.5 + s * 5][kind];
  return Math.min(room * (kind === 3 ? 0.85 : 0.75), h);
}

const tint = new Color();
// (Colours each face, and gives it the cave's own attributes: no daylight, its glow.)
function finish(g, colourAt, glow) {
  g = g.index ? g.toNonIndexed() : g;
  g.deleteAttribute('uv');
  const pos = g.attributes.position, n = pos.count;
  const col = new Float32Array(n * 3), gl = new Float32Array(n * 3);
  for (let v = 0; v < n; v += 3) {
    colourAt(tint, (pos.getY(v) + pos.getY(v + 1) + pos.getY(v + 2)) / 3, v);
    for (let k = 0; k < 3; k++) {
      col.set([tint.r, tint.g, tint.b], (v + k) * 3);
      if (glow) gl.set(glow, (v + k) * 3);
    }
  }
  g.setAttribute('color', new BufferAttribute(col, 3));
  g.setAttribute('glow', new BufferAttribute(gl, 3));
  g.setAttribute('skyLight', new BufferAttribute(new Float32Array(n).fill(0.03), 1));
  return g;
}
const hash = (a, b) => {
  const t = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return t - Math.floor(t);
};

// One stem: from its foot (flaring) up to `top`, bending over by `bend` (sideways, at the top).
function stem(radius, top, bend, foot = 0.9) {
  const pts = [];
  for (let k = 0; k <= 8; k++) {
    const t = k / 8;
    pts.push(new Vector2(radius * (1 + foot * Math.pow(1 - t, 3)) * (1 + 0.05 * Math.sin(t * 13)), t * top));
  }
  const g = new LatheGeometry(pts, 8);
  if (bend) {
    const p = g.attributes.position;
    for (let v = 0; v < p.count; v++) {
      const t = p.getY(v) / top;
      p.setX(v, p.getX(v) + bend * t * t);
    }
  }
  return g;
}
// One cap: a dome (`flat` 0) to a flat disc (1), `r` across, its rim at y = 0, gills under it.
function cap(r, depth, round) {
  const pts = [];
  for (let k = 0; k <= 7; k++) {
    const a = (k / 7) * (Math.PI / 2);
    pts.push(new Vector2(Math.max(0.01, r * Math.cos(a)), depth * Math.pow(Math.sin(a), round)));
  }
  const top = new LatheGeometry(pts, 12); // (rim up to the crown: its faces outward, seen from above)
  const gills = new CylinderGeometry(r * 0.96, r * 0.2, depth * 0.25, 12, 1);
  gills.translate(0, -depth * 0.12, 0);
  return [top, gills];
}

/** The parts of a mushroom of `kind` with cap colours `capColours`, height 1: [{ geometry, part: 'stem' | 'cap' | 'gills' | 'spot' }]. */
function parts(kind, [dark, light, glow]) {
  const out = [];
  const add = (g, part, x = 0, y = 0, z = 0, rz = 0) => {
    if (rz) g.rotateZ(rz);
    g.translate(x, y, z);
    out.push({ geometry: g, part });
  };
  const capAt = (r, depth, round, x, y, rz = 0) => {
    const [top, gills] = cap(r, depth, round);
    add(top, 'cap', x, y, 0, rz);
    add(gills, 'gills', x, y, 0, rz);
  };
  if (kind === 0) {
    add(stem(0.065, 1, 0), 'stem');
    capAt(0.42, 0.18, 0.8, 0, 0.97);
  } else if (kind === 1) {
    // (Leaning: the stem bowed over, the cap tipped with it.)
    add(stem(0.06, 1, 0.32), 'stem');
    capAt(0.38, 0.16, 0.8, 0.32, 0.95, -0.38);
  } else if (kind === 2) {
    // A toadstool: a fat white stem, a round red cap, white spots on it.
    add(stem(0.16, 0.62, 0, 0.35), 'stem');
    capAt(0.62, 0.42, 0.55, 0, 0.55);
    for (let k = 0; k < 9; k++) {
      const a = k * 2.39, up = 0.25 + (k % 3) * 0.22, rr = 0.62 * Math.cos(up * 1.2) * 0.98;
      const spot = new IcosahedronGeometry(0.07 + (k % 2) * 0.03, 0);
      spot.scale(1, 0.35, 1);
      add(spot, 'spot', Math.cos(a) * rr, 0.55 + 0.42 * Math.sin(up * 1.2) * 0.98, Math.sin(a) * rr);
    }
  } else if (kind === 3) {
    // A parasol: slender, a wide flat cap with scales on it.
    add(stem(0.035, 1, 0, 0.6), 'stem');
    capAt(0.58, 0.1, 1.6, 0, 0.99);
    for (let k = 0; k < 10; k++) {
      const a = k * 2.39, rr = 0.15 + (k % 4) * 0.1, sc = new IcosahedronGeometry(0.045, 0);
      sc.scale(1.3, 0.3, 1);
      add(sc, 'spot', Math.cos(a) * rr, 1.06 + 0.03, Math.sin(a) * rr);
    }
  } else {
    // A cluster: three from one foot, leaning out, the middle one tallest.
    for (const [lean, h, r, side] of [[0, 1, 0.3, 0], [0.42, 0.72, 0.24, 1], [0.38, 0.6, 0.22, -1]]) {
      const g = stem(0.05, h, 0, 0.5);
      g.rotateZ(-lean * side);
      add(g, 'stem');
      const tipX = Math.sin(lean * side) * h, tipY = Math.cos(lean * side) * h;
      capAt(r, 0.12, 0.8, tipX, tipY - 0.02, -lean * side);
    }
  }
  const lightColour = new Color(light);
  return out.map(({ geometry, part }, k) => ({
    part,
    geometry: finish(geometry, (c, y, v) => {
      const h = hash(v, k);
      if (part === 'stem') c.set(0xe8dcc8).multiplyScalar(0.82 + 0.18 * Math.min(1, y) + h * 0.08);
      else if (part === 'gills') c.set(glow ? 0x3a4a5a : 0x5a463e).multiplyScalar(0.9 + h * 0.15);
      else if (part === 'spot') c.set(kind === 3 ? 0x7a5a3e : 0xf4f0e8);
      else c.set(dark).lerp(lightColour, Math.min(1, h * 0.6 + 0.3)).multiplyScalar(h > 0.92 ? 1.3 : 0.92 + h * 0.12);
    }, part === 'cap' || part === 'gills' ? (glow ? (part === 'gills' ? glow.map((g) => g * 0.6) : glow) : null) : null),
  }));
}

const whole = new Map(), pieces = new Map();
/** A mushroom of `kind` with its cap (see shroomOf), height 1, all in one. */
export function shroomGeometry(kind, capIndex) {
  const key = `${kind}:${capIndex}`;
  if (!whole.has(key)) {
    const c = capIndex === -1 ? TOAD : capIndex === -2 ? PARASOL : SHROOM_CAPS[capIndex];
    const g = mergeGeometries(parts(kind, c).map((p) => p.geometry));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    whole.set(key, g);
  }
  return whole.get(key);
}

/** The same, broken up as it falls: the stem in two, the cap in quarters: [{ geometry, centre: [x, y, z] }] (height 1). */
export function shroomPieces(kind, capIndex) {
  const key = `${kind}:${capIndex}`;
  if (!pieces.has(key)) {
    const c = capIndex === -1 ? TOAD : capIndex === -2 ? PARASOL : SHROOM_CAPS[capIndex];
    const all = parts(kind, c);
    // (Every face goes to the piece its middle is in: the stem below and
    // above halfway; the cap and what's on it, by quarter.)
    const bins = new Map();
    for (const { geometry, part } of all) {
      const p = geometry.attributes.position, names = Object.keys(geometry.attributes);
      for (let v = 0; v < p.count; v += 3) {
        const cx = (p.getX(v) + p.getX(v + 1) + p.getX(v + 2)) / 3, cy = (p.getY(v) + p.getY(v + 1) + p.getY(v + 2)) / 3, cz = (p.getZ(v) + p.getZ(v + 1) + p.getZ(v + 2)) / 3;
        const bin = part === 'stem' ? (cy < 0.45 ? 'stem0' : 'stem1') : `cap${(cx >= 0 ? 1 : 0) + (cz >= 0 ? 2 : 0)}`;
        if (!bins.has(bin)) bins.set(bin, Object.fromEntries(names.map((n) => [n, []])));
        const b = bins.get(bin);
        for (const n of names) {
          const a = geometry.attributes[n];
          for (let k = 0; k < 3; k++) for (let i = 0; i < a.itemSize; i++) b[n].push(a.array[(v + k) * a.itemSize + i]);
        }
      }
    }
    const out = [];
    for (const b of bins.values()) {
      const g = new BufferGeometry();
      for (const [n, arr] of Object.entries(b)) g.setAttribute(n, new BufferAttribute(new Float32Array(arr), n === 'skyLight' ? 1 : 3));
      g.computeBoundingBox();
      const c = g.boundingBox.getCenter(new (g.boundingBox.min.constructor)());
      g.translate(-c.x, -c.y, -c.z);
      g.computeVertexNormals();
      out.push({ geometry: g, centre: [c.x, c.y, c.z] });
    }
    pieces.set(key, out);
  }
  return pieces.get(key);
}
