import { Sphere, Vector3 } from 'three';

/**
 * A sphere round every point of `points` (x, y, z, x, y, z...), `margin`
 * further out all round: for something moved on the graphics card (spray,
 * surf, mist, puffs), so it can still be left out when it's off the screen,
 * its sphere taking in everywhere it goes.
 */
export function boundsOf(points, margin = 0, stride = 3) {
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (let k = 0; k + 2 < points.length; k += stride) {
    const x = points[k], y = points[k + 1], z = points[k + 2];
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
    if (z < z0) z0 = z;
    if (z > z1) z1 = z;
  }
  if (x0 > x1) return new Sphere(new Vector3(), margin);
  return new Sphere(new Vector3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2 + margin);
}

/** How far a thrown speck goes from its start: speeds (x, y, z...) for `life(i)` seconds each, falling. */
export function throwReach(velocities, life) {
  let reach = 0;
  for (let i = 0; i * 3 + 2 < velocities.length; i++) {
    const t = life(i), v = Math.hypot(velocities[i * 3], velocities[i * 3 + 1], velocities[i * 3 + 2]);
    reach = Math.max(reach, v * t + 4.9 * t * t);
  }
  return reach;
}
