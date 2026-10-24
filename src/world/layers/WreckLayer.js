import { BoxGeometry, BufferAttribute, Color, CylinderGeometry, Group, Mesh, MeshLambertMaterial } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { hash2, mulberry32 } from '../../noise/random.js';

/**
 * Shipwrecks: here and there along the sea coasts (about one to a stretch
 * of 900 m of coast, where there's a beach to wash up on), an old wooden
 * ship driven ashore, broken-backed and half sunk in the sand, listing:
 * its ribs showing where the planking's gone, its mast snapped off, and
 * beside it a sea chest of what it carried (see Game.ruinChest: the
 * `wreck` ones). The same in every visit.
 */
const CELL = 900;
const WOOD = [0x6a5038, 0x5a4430, 0x7a5c40, 0x4e3a28];
const shade = new Color();

/** The wreck in cell (I, K), if the coast there will take one: { x, z, y, rot, key, seed }, or null. */
export function wreckSite(I, K, generator, seaLevel) {
  const seed = generator.seed ?? 1;
  if (hash2(I, K, seed ^ 0x7e1) > 0.6) return null;
  // (A handful of tries in the cell for a beach: just above the sea, on the open coast, the land fairly flat.)
  for (let k = 0; k < 24; k++) {
    const x = (I + 0.1 + 0.8 * hash2(I * 13 + k, K, seed ^ 0x7e2)) * CELL, z = (K + 0.1 + 0.8 * hash2(I, K * 13 + k, seed ^ 0x7e3)) * CELL;
    // (First the quick test, how near the open sea it is; only then the
    // land's height, before its rivers: quicker, and they don't reach the open beach.)
    const ocean = generator.getOceanness(x, z);
    if (ocean < 0.45 || ocean > 0.97) continue;
    const H = (px, pz) => generator.landHeight(px, pz);
    const h = H(x, z);
    if (h < seaLevel + 0.4 || h > seaLevel + 2.2) continue;
    const e = 6, gx = H(x + e, z) - H(x - e, z), gz = H(x, z + e) - H(x, z - e);
    if (Math.hypot(gx, gz) / (2 * e) > 0.18) continue;
    // (Lying along the shore: across the way the land rises.)
    const rot = Math.atan2(gx, gz) + Math.PI / 2;
    return { x, z, y: h, rot, key: `wreck:${I},${K}`, seed: Math.floor(hash2(I, K, seed ^ 0x7e4) * 1e9) };
  }
  return null;
}

function piece(parts, rand, geo, hex, [x, y, z], [rx, ry, rz] = [0, 0, 0]) {
  geo.rotateX(rx);
  geo.rotateZ(rz);
  geo.rotateY(ry);
  geo.translate(x, y, z);
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  const n = g.attributes.position.count, col = new Float32Array(n * 3);
  for (let k = 0; k < n; k += 3) {
    shade.set(hex).multiplyScalar(0.85 + rand() * 0.3);
    for (let v = 0; v < 3; v++) col.set([shade.r, shade.g, shade.b], (k + v) * 3);
  }
  g.setAttribute('color', new BufferAttribute(col, 3));
  parts.push(g);
}

/** The wreck's timbers, along +z, keel down at y = 0 (before it's set on its side in the sand). */
function wreckParts(seed) {
  const rand = mulberry32(seed), parts = [];
  const L = 16, ribs = 11;
  // The keel, broken in two.
  piece(parts, rand, new BoxGeometry(0.4, 0.5, L * 0.55), WOOD[0], [0, 0, -L * 0.22]);
  piece(parts, rand, new BoxGeometry(0.4, 0.5, L * 0.4), WOOD[0], [0.3, 0.2, L * 0.3], [0.08, 0.1, 0]);
  for (let k = 0; k < ribs; k++) {
    const t = k / (ribs - 1), z = (t - 0.5) * L, beam = 2.6 * Math.sin(Math.PI * (0.12 + 0.76 * t));
    // (The ribs: curving up each side; the planking still on, here and there.)
    for (const side of [-1, 1]) {
      if (rand() < 0.08) continue;
      for (let j = 0; j < 4; j++) {
        const a0 = (j / 4) * 1.4, a1 = ((j + 1) / 4) * 1.4;
        const x0 = side * beam * Math.sin(a0), y0 = beam * 0.9 * (1 - Math.cos(a0)), x1 = side * beam * Math.sin(a1), y1 = beam * 0.9 * (1 - Math.cos(a1));
        const len = Math.hypot(x1 - x0, y1 - y0);
        piece(parts, rand, new BoxGeometry(0.28, len + 0.08, 0.28), WOOD[1], [(x0 + x1) / 2, (y0 + y1) / 2, z], [0, 0, -Math.atan2(x1 - x0, y1 - y0)]);
        if (rand() < 0.85 && k < ribs - 1) {
          const step = L / (ribs - 1);
          piece(parts, rand, new BoxGeometry(0.1, len * 1.02, step + 0.08), WOOD[2 + (j % 2)], [(x0 + x1) / 2 + side * 0.08, (y0 + y1) / 2, z + step / 2], [0, 0, -Math.atan2(x1 - x0, y1 - y0)]);
        }
      }
    }
  }
  // The mast, snapped off; the rest of it lying in the sand by the hull.
  piece(parts, rand, new CylinderGeometry(0.22, 0.26, 3.2, 7), WOOD[0], [0, 1.6, -1]);
  piece(parts, rand, new CylinderGeometry(0.2, 0.22, 7, 7), WOOD[2], [3.6, 0.1, -2.5], [Math.PI / 2, 0.5, 0]);
  // (A stretch of deck still on, at the stern.)
  piece(parts, rand, new BoxGeometry(3.4, 0.12, 3.5), WOOD[3], [0, 2.0, L * 0.36]);
  return parts;
}

// Wrecks gone down out at sea: one to a stretch of 700 m of open water
// six to twenty metres deep, upright in the sand of the bed, weed on it.
const DEEP = 700;
export function sunkenSite(I, K, generator, seaLevel) {
  const seed = generator.seed ?? 1;
  if (hash2(I, K, seed ^ 0x5a1) > 0.5) return null;
  for (let k = 0; k < 16; k++) {
    const x = (I + 0.15 + 0.7 * hash2(I * 7 + k, K, seed ^ 0x5a2)) * DEEP, z = (K + 0.15 + 0.7 * hash2(I, K * 7 + k, seed ^ 0x5a3)) * DEEP;
    if (generator.getOceanness(x, z) < 0.6) continue;
    const h = generator.landHeight(x, z);
    if (h > seaLevel - 6 || h < seaLevel - 22) continue;
    const rot = hash2(I, K, seed ^ 0x5a5) * Math.PI * 2;
    return { x, z, y: h, rot, key: `sunken:${I},${K}`, seed: Math.floor(hash2(I, K, seed ^ 0x5a4) * 1e9), sunken: true };
  }
  return null;
}

export function createWreckLayer(config) {
  const material = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const sites = new Map(); // "I,K" -> site or null
  const site = (I, K, generator) => {
    const key = `${I},${K}`;
    if (!sites.has(key)) sites.set(key, wreckSite(I, K, generator, config.seaLevel));
    if (sites.size > 4000) sites.clear();
    return sites.get(key);
  };
  const layer = {
    name: 'wrecks',
    material,
    onChest: null, // ({ key, x, y, z, rot, best, wreck }) => the sea chest's place, when a wreck's built near you
    reuseKey: ({ lod }) => (lod > 2 ? 'none' : lod === 0 ? 'wrecks0' : 'wrecks'),
    /** The wrecks round (x, z) within r: [{ x, z }] (for the map). */
    near(x, z, r, generator) {
      const out = [];
      for (let K = Math.floor((z - r) / CELL); K <= Math.floor((z + r) / CELL); K++) {
        for (let I = Math.floor((x - r) / CELL); I <= Math.floor((x + r) / CELL); I++) {
          const s = site(I, K, generator);
          if (s) out.push(s);
        }
      }
      return out;
    },
    build({ cx, cz, lod, generator, groundHeightAt }) {
      if (lod > 2) return null;
      const size = config.chunkSize, x0 = cx * size, z0 = cz * size;
      const I0 = Math.floor((x0 + size / 2) / CELL), K0 = Math.floor((z0 + size / 2) / CELL);
      const group = new Group();
      group.name = 'wrecks';
      // (The sunken ones, out on the sea bed: settled upright, a little over on its side, its chest beside it.)
      const D0 = Math.floor((x0 + size / 2) / DEEP), E0 = Math.floor((z0 + size / 2) / DEEP);
      for (let K = E0 - 1; K <= E0 + 1; K++) {
        for (let I = D0 - 1; I <= D0 + 1; I++) {
          const key = `d${I},${K}`;
          if (!sites.has(key)) sites.set(key, sunkenSite(I, K, generator, config.seaLevel));
          const s = sites.get(key);
          if (!s || Math.floor(s.x / size) !== cx || Math.floor(s.z / size) !== cz) continue;
          const geometry = mergeGeometries(wreckParts(s.seed));
          geometry.computeVertexNormals();
          // (Weed and growth on it: the timbers gone dark green-brown.)
          const col = geometry.attributes.color;
          for (let k = 0; k < col.count; k++) col.setXYZ(k, col.getX(k) * 0.6, col.getY(k) * 0.72, col.getZ(k) * 0.55);
          const mesh = new Mesh(geometry, material);
          const gy = groundHeightAt?.(s.x - x0, s.z - z0);
          const y = Number.isFinite(gy) ? gy : s.y;
          mesh.position.set(s.x - x0, y - 0.6, s.z - z0);
          mesh.rotation.set(0.05, s.rot, 0.18, 'YXZ');
          mesh.receiveShadow = true;
          group.add(mesh);
          if (lod === 0) {
            const cxw = s.x + Math.cos(s.rot) * 4, czw = s.z - Math.sin(s.rot) * 4;
            const cy = groundHeightAt?.(cxw - x0, czw - z0);
            layer.onChest?.({ key: s.key, x: cxw, y: Number.isFinite(cy) ? cy : y, z: czw, rot: s.rot, best: true, wreck: true, sunken: true });
          }
        }
      }
      for (let K = K0 - 1; K <= K0 + 1; K++) {
        for (let I = I0 - 1; I <= I0 + 1; I++) {
          const s = site(I, K, generator);
          if (!s || Math.floor(s.x / size) !== cx || Math.floor(s.z / size) !== cz) continue;
          const geometry = mergeGeometries(wreckParts(s.seed));
          geometry.computeVertexNormals();
          const mesh = new Mesh(geometry, material);
          // (Listing hard over on its side, its keel half buried.)
          const gy = groundHeightAt?.(s.x - x0, s.z - z0);
          const y = Number.isFinite(gy) ? gy : s.y;
          mesh.position.set(s.x - x0, y - 0.45, s.z - z0);
          mesh.rotation.set(0, s.rot, 0.38, 'YXZ');
          mesh.castShadow = mesh.receiveShadow = true;
          group.add(mesh);
          if (lod === 0) {
            const cxw = s.x + Math.cos(s.rot) * 3.4, czw = s.z - Math.sin(s.rot) * 3.4;
            const cy = groundHeightAt?.(cxw - x0, czw - z0);
            layer.onChest?.({ key: s.key, x: cxw, y: Number.isFinite(cy) ? cy : y, z: czw, rot: s.rot, best: true, wreck: true });
          }
        }
      }
      return group.children.length ? group : null;
    },
    dispose(group) {
      for (const m of group.children) m.geometry.dispose();
    },
  };
  return layer;
}
