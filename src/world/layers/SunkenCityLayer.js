import { BoxGeometry, BufferAttribute, Color, CylinderGeometry, Group, Mesh, MeshLambertMaterial } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { hash2, mulberry32 } from '../../noise/random.js';

/**
 * Drowned cities: once in a long while far out at sea (one to a stretch of
 * about 5 km of deep ocean, and not every one), the ruins of a city gone
 * down long ago, 25 to 60 m under: its broken outer wall, streets of
 * roofless stone houses, avenues of columns (some fallen), and in the
 * middle a stepped temple. Weed and coral growth on everything. In the
 * temple and in a few of the houses, strongrooms: chests of what its
 * people had (see Game.ruinChest: the `city` ones). A long, deep dive.
 */
const CELL = 5000;
// (The old ruins' own grey stone (see RuinLayer), gone darker and green under the sea.)
const STONE = [0xb4b0a6, 0xa6a298, 0xc2beb2, 0x9a978e, 0xb0aa94, 0xc6c0b2, 0xa29e92];
const MORTAR = 0x6a6c64;
let coarse = false; // (building far off: each wall one plain block, not its stones)
const shade = new Color();

/** The drowned city in cell (I, K), if there is one: { x, z, y, r, key, seed }, or null. */
export function sunkenCitySite(I, K, generator, seaLevel) {
  const seed = generator.seed ?? 1;
  if (hash2(I, K, seed ^ 0xc17) > 0.45) return null;
  for (let k = 0; k < 12; k++) {
    const x = (I + 0.2 + 0.6 * hash2(I * 5 + k, K, seed ^ 0xc18)) * CELL, z = (K + 0.2 + 0.6 * hash2(I, K * 5 + k, seed ^ 0xc19)) * CELL;
    if (generator.getOceanness(x, z) < 0.8) continue;
    // (Deep all over it: no island or reef breaking it.)
    let ok = true, sum = 0;
    for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7]]) {
      const h = generator.landHeight(x + dx * 120, z + dz * 120);
      if (h > seaLevel - 25 || h < seaLevel - 60) (ok = false);
      sum += h;
    }
    if (!ok) continue;
    return { x, z, y: sum / 9, r: 110, key: `city:${I},${K}`, seed: Math.floor(hash2(I, K, seed ^ 0xc1a) * 1e9) };
  }
  return null;
}

// (A box, each face its own weathered, weed-dark shade of stone.)
function stone(geometry, rand, green = 0) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  g.deleteAttribute('uv');
  const col = new Float32Array(g.attributes.position.count * 3);
  for (let v = 0; v < col.length / 3; v += 6) {
    shade.set(green < 0 ? MORTAR : STONE[Math.floor(rand() * STONE.length)]).multiplyScalar(0.62 + 0.22 * rand());
    const weed = Math.max(0, green) + 0.3 * rand();
    shade.r *= 1 - 0.45 * weed, shade.b *= 1 - 0.35 * weed;
    for (let k = v; k < Math.min(v + 6, col.length / 3); k++) col.set([shade.r, shade.g, shade.b], k * 3);
  }
  g.setAttribute('color', new BufferAttribute(col, 3));
  return g;
}

/**
 * The city's pieces, laid out from its seed: [{ x, z, parts(y, rand) -> [geometry], chest? }]
 * (world x, z; each piece built where it stands, on the sea bed there).
 */
function cityPieces(s) {
  let pr = mulberry32(s.seed);
  const rand = () => pr(), pieces = [];
  const box = (w, h, d, x, y, z, ry = 0, rx = 0, rz = 0, green) => stone(new BoxGeometry(w, h, d).rotateX(rx).rotateZ(rz).rotateY(ry).translate(x, y, z), rand, green);
  // Masonry: a block (w by d, h high, its middle at x, y, z, turned ry) laid
  // in courses of cut stones, each other course set off by half a stone,
  // round its outside (a thick one has a core of mortar and rubble behind),
  // the stones a little out of true, weed on the top course. (Far off, one plain block.)
  const bricks = (w, h, d, x, y, z, ry = 0, big = 1) => {
    if (coarse) return [box(w, h, d, x, y, z, ry)];
    const out = [];
    const L = 1.0 * big, H = 0.5 * big, n = Math.max(1, Math.round(h / H)), ch = h / n, y0 = y - h / 2;
    const stoneAt = (lx, lz, len, deep, alongX, row, top) => {
      const g = new BoxGeometry(alongX ? len - 0.04 : deep, ch - 0.03, alongX ? deep : len - 0.04);
      g.rotateY((rand() - 0.5) * 0.04).rotateZ((rand() - 0.5) * 0.03);
      g.translate(lx, y0 + ch * (row + 0.5), lz).rotateY(ry).translate(x, 0, z);
      out.push(stone(g, rand, top ? 0.55 : 0.12));
    };
    // (A run of stones from a to b along one side.)
    const run = (ax, az, bx, bz, deep, row, top) => {
      const len = Math.hypot(bx - ax, bz - az), k = Math.max(1, Math.round(len / L)), step = len / k, alongX = Math.abs(bx - ax) > Math.abs(bz - az);
      const off = row % 2 ? step / 2 : 0;
      for (let i = -1; i < k; i++) {
        const t0 = Math.max(0, i * step + off), t1 = Math.min(len, (i + 1) * step + off);
        if (t1 - t0 < 0.1) continue;
        if (rand() < 0.03 && !top) continue; // (one fallen out)
        const m = (t0 + t1) / 2 / len;
        stoneAt(ax + (bx - ax) * m, az + (bz - az) * m, t1 - t0, deep, alongX, row, top);
      }
    };
    const thin = Math.min(w, d) <= 1.2;
    for (let row = 0; row < n; row++) {
      const top = row === n - 1;
      if (thin) {
        if (w >= d) run(-w / 2, 0, w / 2, 0, d, row, top);
        else run(0, -d / 2, 0, d / 2, w, row, top);
      } else {
        const t = 0.7 * big;
        run(-w / 2, -d / 2 + t / 2, w / 2, -d / 2 + t / 2, t, row, top);
        run(-w / 2, d / 2 - t / 2, w / 2, d / 2 - t / 2, t, row, top);
        run(-w / 2 + t / 2, -d / 2 + t, -w / 2 + t / 2, d / 2 - t, t, row, top);
        run(w / 2 - t / 2, -d / 2 + t, w / 2 - t / 2, d / 2 - t, t, row, top);
      }
    }
    // (Mortar behind, so no light shows between the stones; a big block's core, its top paved.)
    const cw = thin ? (w >= d ? w - 0.05 : w * 0.4) : w - 0.3, cd = thin ? (w >= d ? d * 0.4 : d - 0.05) : d - 0.3;
    out.push(box(cw, h - 0.06, cd, x, y - 0.02, z, ry, 0, 0, -1));
    return out;
  };
  const column = (x, y, z, h, fallen, ry) => {
    const g = new CylinderGeometry(0.55, 0.65, h, 8);
    if (fallen) g.rotateZ(Math.PI / 2).rotateY(ry).translate(x, y + 0.6, z);
    else g.translate(x, y + h / 2, z);
    return [stone(g, rand, 0.3), box(1.6, 0.5, 1.6, x, y + 0.25, z, ry)];
  };
  // The temple, in the middle: three steps up, columns round its top, a strongroom inside.
  pieces.push({
    x: s.x, z: s.z, chest: { dx: 0, dz: 0, top: 6.6 },
    parts: (y) => {
      const out = [...bricks(34, 2.2, 34, s.x, y + 1.1, s.z, 0, 1.6), ...bricks(26, 2.2, 26, s.x, y + 3.3, s.z, 0, 1.6), ...bricks(18, 2.2, 18, s.x, y + 5.5, s.z, 0, 1.6)];
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2, broken = rand() < 0.35;
        out.push(...column(s.x + Math.cos(a) * 7.5, y + 6.6, s.z + Math.sin(a) * 7.5, broken ? 2 + rand() * 3 : 8, false, 0));
      }
      out.push(box(18, 1, 2, s.x, y + 15, s.z - 7.5, 0, 0, 0.08), box(2, 1, 12, s.x + 7.5, y + 15, s.z + 1, 0.1)); // (what's left of the roof beams)
      return out;
    },
  });
  // The streets: a grid, the houses roofless, walls broken down in places.
  const R = s.r, STEP = 22;
  let strongrooms = 0;
  for (let gz = -R; gz <= R; gz += STEP) {
    for (let gx = -R; gx <= R; gx += STEP) {
      const d = Math.hypot(gx, gz);
      if (d < 26 || d > R - 8 || rand() < 0.2) continue;
      const hx = s.x + gx + (rand() - 0.5) * 6, hz = s.z + gz + (rand() - 0.5) * 6;
      const w = 7 + rand() * 6, l = 7 + rand() * 6, ry = Math.round(rand() * 2) * 0.02, tall = 2.5 + rand() * 4;
      const chest = strongrooms < 3 && rand() < 0.12 ? (strongrooms++, { dx: 0, dz: 0, top: 0 }) : null;
      pieces.push({
        x: hx, z: hz, chest,
        parts: (y) => {
          const out = [box(w + 0.6, 0.4, l + 0.6, hx, y + 0.1, hz, ry)];
          // (Each wall its own height, broken; a doorway in the front.)
          const walls = [[0, -l / 2, w, 0.7], [0, l / 2, w, 0.7], [-w / 2, 0, 0.7, l], [w / 2, 0, 0.7, l]];
          walls.forEach(([ox, oz, ww, ll], k) => {
            const h = tall * (0.3 + 0.7 * rand());
            if (k === 0) {
              out.push(...bricks(ww * 0.38, h, ll, hx + ox - ww * 0.31, y + h / 2, hz + oz, ry), ...bricks(ww * 0.38, h, ll, hx + ox + ww * 0.31, y + h / 2, hz + oz, ry));
              if (h > 2.5) out.push(box(ww * 0.3, 0.6, ll, hx + ox, y + h - 0.3, hz + oz, ry)); // (the lintel)
            } else if (rand() < 0.85) out.push(...bricks(ww, h, ll, hx + ox, y + h / 2, hz + oz, ry));
          });
          // (Rubble about it.)
          for (let k = 0; k < 4; k++) out.push(box(0.6 + rand(), 0.4 + rand() * 0.6, 0.6 + rand(), hx + (rand() - 0.5) * (w + 4), y + 0.2, hz + (rand() - 0.5) * (l + 4), rand() * 3, rand() * 0.4, rand() * 0.4, 0.5));
          return out;
        },
      });
    }
  }
  // The avenues: two of columns, crossing at the temple, some fallen.
  for (const [ax, az] of [[1, 0], [0, 1]]) {
    for (let t = -R + 10; t <= R - 10; t += 9) {
      if (Math.abs(t) < 22) continue;
      for (const side of [-1, 1]) {
        const x = s.x + ax * t + az * side * 5.5, z = s.z + az * t + ax * side * 5.5, fallen = rand() < 0.3, h = 6 + rand() * 3;
        pieces.push({ x, z, parts: (y) => column(x, y, z, fallen ? h * 0.8 : rand() < 0.25 ? h * 0.4 : h, fallen, rand() * Math.PI) });
      }
    }
  }
  // The outer wall: in lengths, gaps where it's fallen.
  for (let k = 0; k < 40; k++) {
    if (rand() < 0.25) continue;
    const a = (k / 40) * Math.PI * 2, x = s.x + Math.cos(a) * (R + 6), z = s.z + Math.sin(a) * (R + 6), h = 3 + rand() * 5;
    pieces.push({ x, z, parts: (y) => bricks(2.2, h, (Math.PI * 2 * (R + 6)) / 40 - 0.8, x, y + h / 2 - 0.5, z, -a, 1.3) });
  }
  // (Each piece built the same every time: its own run of numbers.)
  pieces.forEach((piece, n) => {
    const build = piece.parts;
    piece.parts = (y) => ((pr = mulberry32(s.seed + n * 7919)), build(y));
  });
  return pieces;
}

export function createSunkenCityLayer(config) {
  const material = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const sites = new Map(); // "I,K" -> site or null
  const layouts = new Map(); // key -> pieces
  const site = (I, K, generator) => {
    const key = `${I},${K}`;
    if (!sites.has(key)) sites.set(key, sunkenCitySite(I, K, generator, config.seaLevel));
    return sites.get(key);
  };
  const layer = {
    name: 'sunken cities',
    material,
    onChest: null, // ({ key, x, y, z, rot, city }) => a strongroom's chest, when built near you
    reuseKey: ({ lod }) => (lod > 2 ? 'none' : lod === 0 ? 'city0' : 'city'),
    /** The drowned cities round (x, z) within r: [{ x, z }] (for the map). */
    near(x, z, r, generator) {
      const out = [];
      for (let K = Math.floor((z - r) / CELL); K <= Math.floor((z + r) / CELL); K++) for (let I = Math.floor((x - r) / CELL); I <= Math.floor((x + r) / CELL); I++) {
        const s = site(I, K, generator);
        if (s) out.push(s);
      }
      return out;
    },
    /** Whether (x, z) is in a drowned city (for the map's label). */
    at(x, z, generator) {
      const s = site(Math.floor(x / CELL), Math.floor(z / CELL), generator);
      return !!s && Math.hypot(x - s.x, z - s.z) < s.r + 10;
    },
    build({ cx, cz, lod, generator, groundHeightAt }) {
      if (lod > 2) return null;
      const size = config.chunkSize, x0 = cx * size, z0 = cz * size;
      const s = site(Math.floor((x0 + size / 2) / CELL), Math.floor((z0 + size / 2) / CELL), generator);
      if (!s || Math.abs(s.x - (x0 + size / 2)) > s.r + 80 || Math.abs(s.z - (z0 + size / 2)) > s.r + 80) return null;
      if (!layouts.has(s.key)) layouts.set(s.key, cityPieces(s));
      const parts = [];
      const rand = mulberry32(s.seed ^ (cx * 73856093) ^ (cz * 19349663)); // (which bits of rubble are left out, far off)
      layouts.get(s.key).forEach((piece, n) => {
        if (Math.floor(piece.x / size) !== cx || Math.floor(piece.z / size) !== cz) return;
        const gy = groundHeightAt?.(piece.x - x0, piece.z - z0);
        const y = (Number.isFinite(gy) ? gy : s.y) - 0.4;
        // (Far off, only the bigger shapes: every other bit of rubble left out.)
        coarse = lod > 0;
        for (const g of piece.parts(y)) if (lod === 0 || g.attributes.position.count > 36 || rand() < 0.5) parts.push(g.translate(-x0, 0, -z0));
        if (piece.chest && lod === 0) layer.onChest?.({ key: `${s.key}:${n}`, x: piece.x + piece.chest.dx, y: y + 0.4 + piece.chest.top, z: piece.z + piece.chest.dz, rot: 0, city: true });
      });
      if (!parts.length) return null;
      const geometry = mergeGeometries(parts);
      geometry.computeVertexNormals();
      const mesh = new Mesh(geometry, material);
      mesh.receiveShadow = true;
      mesh.castShadow = lod === 0;
      const group = new Group();
      group.name = 'sunken city';
      group.add(mesh);
      return group;
    },
    dispose(group) {
      for (const m of group.children) m.geometry.dispose();
    },
  };
  return layer;
}
