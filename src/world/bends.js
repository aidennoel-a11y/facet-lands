/**
 * Eases a course's sharp bends: wherever it turns by more than `maxTurn`
 * (radians) at one of its points, that point is drawn in halfway towards the
 * middle of its two neighbours, over and over, so the turn spreads out over
 * the points either side into a smooth curve, until no point turns more
 * than that (or `passes` times over). Only points `from` to `to` move (the
 * course's ends, or whatever else must stay put, stay where they are).
 * `P` is [[x, z], ...]; it's changed in place (and returned).
 */
export function easeBends(P, maxTurn, from = 1, to = P.length - 2, passes = 120) {
  const cos = Math.cos(maxTurn);
  from = Math.max(1, from);
  to = Math.min(P.length - 2, to);
  for (let pass = 0; pass < passes; pass++) {
    let moved = false;
    for (let k = from; k <= to; k++) {
      const a = P[k - 1], b = P[k], c = P[k + 1];
      const ux = b[0] - a[0], uz = b[1] - a[1], vx = c[0] - b[0], vz = c[1] - b[1];
      const lu = Math.hypot(ux, uz), lv = Math.hypot(vx, vz);
      if (lu < 1e-6 || lv < 1e-6 || (ux * vx + uz * vz) / (lu * lv) >= cos) continue;
      b[0] += ((a[0] + c[0]) / 2 - b[0]) * 0.5;
      b[1] += ((a[1] + c[1]) / 2 - b[1]) * 0.5;
      moved = true;
    }
    if (!moved) break;
  }
  return P;
}
