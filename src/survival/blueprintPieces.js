import { BufferAttribute, BufferGeometry } from 'three';

/**
 * A building piece's model split into the separate things you can see it's
 * made of (each log of a log wall, each plank, each stone), in the order
 * they'd go up: from the bottom, the lowest first. A blueprint is built a
 * piece at a time (see Structures, blueprints), and it takes one of its
 * material for each piece.
 *
 * How: the model's triangles grouped into the bits that share corners (one
 * shape each, as it was made), then any bit lying mostly inside another
 * (a log's end, a notch, a nail) folded into it, and slivers too small to
 * count as a piece folded into the nearest piece. Pure (three.js only).
 */
export function splitPieces(geometry, bands = 4) {
  const pos = geometry.attributes.position, col = geometry.attributes.color, nor = geometry.attributes.normal;
  const index = geometry.index ? geometry.index.array : null;
  const triCount = (index ? index.length : pos.count) / 3;
  const corner = (t, c) => (index ? index[t * 3 + c] : t * 3 + c);
  // (Corners at the same place are one corner.)
  const ids = new Map(), parent = [];
  const idOf = (v) => {
    const key = `${Math.round(pos.getX(v) * 500)},${Math.round(pos.getY(v) * 500)},${Math.round(pos.getZ(v) * 500)}`;
    let id = ids.get(key);
    if (id === undefined) (id = parent.length), ids.set(key, id), parent.push(id);
    return id;
  };
  const find = (a) => {
    while (parent[a] !== a) (parent[a] = parent[parent[a]]), (a = parent[a]);
    return a;
  };
  const triIds = new Int32Array(triCount * 3);
  for (let t = 0; t < triCount; t++) {
    const a = idOf(corner(t, 0)), b = idOf(corner(t, 1)), c = idOf(corner(t, 2));
    triIds.set([a, b, c], t * 3);
    parent[find(b)] = find(a);
    parent[find(c)] = find(a);
  }
  // The bits: their triangles and their bounds.
  const bits = new Map();
  for (let t = 0; t < triCount; t++) {
    const root = find(triIds[t * 3]);
    let b = bits.get(root);
    if (!b) bits.set(root, (b = { tris: [], min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }));
    b.tris.push(t);
    for (let c = 0; c < 3; c++) {
      const v = corner(t, c);
      const p = [pos.getX(v), pos.getY(v), pos.getZ(v)];
      for (let k = 0; k < 3; k++) (b.min[k] = Math.min(b.min[k], p[k])), (b.max[k] = Math.max(b.max[k], p[k]));
    }
  }
  let list = [...bits.values()];
  const vol = (b) => Math.max(1e-6, (b.max[0] - b.min[0]) * (b.max[1] - b.min[1]) * (b.max[2] - b.min[2]));
  const size = (b) => Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]);
  const overlap = (a, b) => {
    let v = 1;
    for (let k = 0; k < 3; k++) v *= Math.max(0, Math.min(a.max[k], b.max[k]) - Math.max(a.min[k], b.min[k]));
    return v;
  };
  const absorb = (into, b) => {
    into.tris.push(...b.tris);
    for (let k = 0; k < 3; k++) (into.min[k] = Math.min(into.min[k], b.min[k])), (into.max[k] = Math.max(into.max[k], b.max[k]));
  };
  // (A bit mostly inside a bigger one: part of it.)
  list.sort((a, b) => vol(b) - vol(a));
  for (let changed = true; changed; ) {
    changed = false;
    for (let i = 0; i < list.length && !changed; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        if (size(b) < 0.4 && overlap(a, b) > 0.55 * vol(b)) {
          absorb(a, b);
          list.splice(j, 1);
          changed = true;
          break;
        }
      }
    }
  }
  // (Slivers, too small to be a piece of their own: to the nearest piece.)
  const biggest = Math.max(...list.map(size));
  const small = (b) => size(b) < biggest * 0.12 && size(b) < 0.35;
  const keep = list.filter((b) => !small(b));
  if (!keep.length) keep.push(list[0]);
  for (const b of list) {
    if (keep.includes(b)) continue;
    const c = b.min.map((m, k) => (m + b.max[k]) / 2);
    let best = keep[0], bestD = Infinity;
    for (const k of keep) {
      const d = Math.hypot(...[0, 1, 2].map((a) => Math.max(k.min[a] - c[a], 0, c[a] - k.max[a])));
      if (d < bestD) (bestD = d), (best = k);
    }
    absorb(best, b);
  }
  // (Made all of a piece, a thatch or a hide: built up in bands from its foot instead.)
  if (keep.length < 3 && bands > 1) {
    const all = { tris: keep.flatMap((b) => b.tris) };
    let lo = Infinity, hi = -Infinity;
    const cy = (t) => (pos.getY(corner(t, 0)) + pos.getY(corner(t, 1)) + pos.getY(corner(t, 2))) / 3;
    for (const t of all.tris) (lo = Math.min(lo, cy(t))), (hi = Math.max(hi, cy(t)));
    keep.length = 0;
    for (let k = 0; k < bands; k++) keep.push({ tris: [], min: [0, lo + ((hi - lo) * k) / bands, 0], max: [0, 0, 0] });
    for (const t of all.tris) keep[Math.min(bands - 1, Math.floor(((cy(t) - lo) / Math.max(1e-6, hi - lo)) * bands))].tris.push(t);
    for (let k = keep.length - 1; k >= 0; k--) if (!keep[k].tris.length) keep.splice(k, 1);
  }
  // In building order: from the bottom up (then along).
  keep.sort((a, b) => Math.round(a.min[1] * 10) - Math.round(b.min[1] * 10) || a.min[0] + a.min[2] - (b.min[0] + b.min[2]));
  // (Little things in their hundreds, shingles, tiles, slates: laid a course at a time, a row across.)
  const sizes = keep.map(size).sort((a, b) => a - b), median = sizes[Math.floor(sizes.length / 2)] ?? 1;
  if (keep.length > 80 && median < 0.9) {
    const rows = new Map();
    for (const b of keep) {
      const k = Math.round(b.min[1] / 0.16);
      if (!rows.has(k)) rows.set(k, { tris: [], min: [...b.min], max: [...b.max] });
      absorb(rows.get(k), b);
    }
    keep.length = 0;
    keep.push(...[...rows.entries()].sort((a, b) => a[0] - b[0]).map(([, r]) => r));
  }
  return keep.map((b) => {
    const n = b.tris.length * 3, P = new Float32Array(n * 3), C = col ? new Float32Array(n * col.itemSize) : null, N = nor ? new Float32Array(n * 3) : null;
    let o = 0;
    for (const t of b.tris) for (let c = 0; c < 3; c++) {
      const v = corner(t, c);
      P.set([pos.getX(v), pos.getY(v), pos.getZ(v)], o * 3);
      if (C) for (let k = 0; k < col.itemSize; k++) C[o * col.itemSize + k] = col.array[v * col.itemSize + k];
      if (N) N.set([nor.getX(v), nor.getY(v), nor.getZ(v)], o * 3);
      o++;
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(P, 3));
    if (C) g.setAttribute('color', new BufferAttribute(C, col.itemSize));
    if (N) g.setAttribute('normal', new BufferAttribute(N, 3));
    else g.computeVertexNormals();
    g.computeBoundingBox();
    return g;
  });
}
