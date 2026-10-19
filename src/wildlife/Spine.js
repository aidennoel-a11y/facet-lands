import { BufferAttribute, BufferGeometry } from 'three';

/**
 * A four-legged animal's body cut in three, so it can move as a real one's
 * does rather than as one stiff block: the fore part (chest, shoulders, the
 * neck's root; the head hangs from it), the hind part (barrel and haunches,
 * turned about the middle of the back: bending into a turn, the back
 * arching and stretching at the gallop, the hips rocking), and the tail
 * (swinging, raised, streaming out behind). Each piece runs a little past
 * the cut into the next, so no gap opens as they turn.
 *
 * `split`: where along the body (z) the back bends (between the fore and
 * hind legs); `tailAt`: where the tail starts (behind the haunches).
 * Returns { front, rear, tail, pivot, tailPivot } (rear and tail with their
 * pivot at their own origin), or null if there's no body to cut.
 */
export function splitBody(geometry, { split, spineY, tailAt, overlap }) {
  const pos = geometry.attributes.position, col = geometry.attributes.color;
  if (!pos) return null;
  const front = [], rear = [], tail = [];
  const tri = [0, 1, 2].map(() => ({ p: [0, 0, 0], c: [1, 1, 1] }));
  for (let i = 0; i < pos.count; i += 3) {
    for (let v = 0; v < 3; v++) {
      tri[v].p = [pos.getX(i + v), pos.getY(i + v), pos.getZ(i + v)];
      tri[v].c = col ? [col.getX(i + v), col.getY(i + v), col.getZ(i + v)] : [1, 1, 1];
    }
    // (The front: everything ahead of the bend; the rear: from it back to
    // the tail; the tail: behind that. Each overlapping its neighbour.)
    emit(front, clip(tri, split - overlap, +1));
    const mid = clip(clip(tri, split + overlap, -1), tailAt != null ? tailAt - overlap * 0.5 : -Infinity, +1);
    emit(rear, mid);
    if (tailAt != null) emit(tail, clip(tri, tailAt + overlap * 0.5, -1));
  }
  const pivot = [0, spineY, split];
  // (Where the tail joins: the middle of its root.)
  let ty = 0, tn = 0;
  for (let k = 0; k < tail.length; k += 6) if (tail[k + 2] > tailAt - overlap * 3) (ty += tail[k + 1]), tn++;
  const tailPivot = [0, tn ? ty / tn : spineY, tailAt ?? split];
  return {
    front: build(front, [0, 0, 0]),
    rear: build(rear, pivot),
    tail: tail.length >= 18 ? build(tail, tailPivot) : null,
    pivot,
    tailPivot,
  };
}

// The part of a triangle (a polygon of { p, c }) on one side of the plane
// z = at: `side` +1 keeps z ≥ at, -1 keeps z ≤ at.
function clip(poly, at, side) {
  if (!poly.length || !isFinite(at)) return poly;
  const out = [];
  for (let k = 0; k < poly.length; k++) {
    const a = poly[k], b = poly[(k + 1) % poly.length];
    const da = (a.p[2] - at) * side, db = (b.p[2] - at) * side;
    if (da >= 0) out.push(a);
    if ((da >= 0) !== (db >= 0)) {
      const t = da / (da - db);
      out.push({ p: a.p.map((x, i) => x + (b.p[i] - x) * t), c: a.c.map((x, i) => x + (b.c[i] - x) * t) });
    }
  }
  return out;
}

// A polygon, as triangles (a fan), onto a flat list: x, y, z, r, g, b each corner.
function emit(list, poly) {
  for (let k = 1; k + 1 < poly.length; k++) for (const v of [poly[0], poly[k], poly[k + 1]]) list.push(v.p[0], v.p[1], v.p[2], v.c[0], v.c[1], v.c[2]);
}

function build(list, [ox, oy, oz]) {
  const n = list.length / 6, p = new Float32Array(n * 3), c = new Float32Array(n * 3);
  for (let k = 0; k < n; k++) {
    p[k * 3] = list[k * 6] - ox;
    p[k * 3 + 1] = list[k * 6 + 1] - oy;
    p[k * 3 + 2] = list[k * 6 + 2] - oz;
    c.set(list.slice(k * 6 + 3, k * 6 + 6), k * 3);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(p, 3));
  g.setAttribute('color', new BufferAttribute(c, 3));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}
