/**
 * The unexplored land on a map, in survival: a dark wash over it all, cut
 * away over the chunks you've been near (see Game.explored). Drawn into its
 * own canvas (`mask`, w x h), then laid over the map.
 *
 *  explored: Set of "cx,cz"; size: a chunk's width (m); toPx(x, z) => [px, py]
 *  on the mask; metresPerPx: the map's scale.
 */
export const FOG = '#262a32';
export function paintFog(mask, w, h, explored, size, toPx, metresPerPx) {
  if (mask.width !== w || mask.height !== h) (mask.width = w), (mask.height = h);
  const ctx = mask.getContext('2d');
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = FOG;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = '#000';
  const cell = size / metresPerPx;
  for (const key of explored) {
    const comma = key.indexOf(',');
    const cx = +key.slice(0, comma), cz = +key.slice(comma + 1);
    const [px, py] = toPx(cx * size, cz * size);
    if (px > w || py > h || px + cell < 0 || py + cell < 0) continue;
    ctx.fillRect(Math.floor(px), Math.floor(py), Math.ceil(cell) + 1, Math.ceil(cell) + 1);
  }
  ctx.globalCompositeOperation = 'source-over';
  return mask;
}
