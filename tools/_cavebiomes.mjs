// How much of the underground each cave kind takes, and how big its
// patches are on average (km²), at a depth.   node tools/_cavebiomes.mjs seed [y] [half km] [step m]
import { TerrainGenerator } from '../src/world/TerrainGenerator.js';
import { CaveField } from '../src/world/caves/CaveField.js';
import { WORLD } from '../src/config.js';
const [seed = 'polaris', y = '-60', half = '6', step = '80'] = process.argv.slice(2);
const g = new TerrainGenerator(seed, WORLD);
const f = g.caves.field, S = +step, N = Math.floor((+half * 1000 * 2) / S);
const grid = new Int8Array(N * N);
for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
  const x = -half * 1000 + i * S, z = -half * 1000 + j * S;
  grid[j * N + i] = CaveField.biomeAt(f.biomeScores(x, z), +y);
}
const NAMES = ['rock', 'lush', 'volcanic', 'ice', 'dry', 'crystal', 'mushroom'];
const seen = new Uint8Array(N * N), stats = {};
for (let c = 0; c < N * N; c++) {
  if (seen[c]) continue;
  const k = grid[c], st = [c];
  let n = 0;
  seen[c] = 1;
  while (st.length) {
    const q = st.pop(); n++;
    const i = q % N, j = (q - i) / N;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di, b = j + dj;
      if (a < 0 || b < 0 || a >= N || b >= N) continue;
      const r = b * N + a;
      if (!seen[r] && grid[r] === k) (seen[r] = 1), st.push(r);
    }
  }
  const e = (stats[NAMES[k]] ??= { cells: 0, patches: 0, big: 0 });
  e.cells += n;
  if (n * S * S > 0.05e6) (e.patches++, (e.big += n));
}
for (const [k, e] of Object.entries(stats)) console.log(k.padEnd(9), 'share', ((100 * e.cells) / (N * N)).toFixed(1).padStart(5) + '%', 'patches', String(e.patches).padStart(3), 'avg', e.patches ? ((e.big * S * S) / e.patches / 1e6).toFixed(2) + ' km²' : '-');
