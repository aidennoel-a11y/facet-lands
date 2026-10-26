/**
 * The kinds of country the big map shows (as the biome readout names
 * them), each with its colour on the map, in the order the legend lists them.
 */
export const MAP_LABELS = [
  ['Ocean', '#2c67b0'],
  ['Coral reef', '#e0708a'],
  ['Kelp forest', '#6b7a3a'],
  ['Lake', '#4f9fd8'],
  ['Beach', '#ead9a4'],
  ['Black sand beach', '#3a3638'],
  ['Coral atoll', '#7fe0d0'],
  ['Sea cliffs', '#8a8597'],
  ['Plains', '#a9cf6a'],
  ['Forest', '#3f7d33'],
  ['Birch & aspen parkland', '#c3d77a'],
  ['Pine forest', '#2f5a36'],
  ['Redwood forest', '#8a3b24'],
  ['Wildflower meadow', '#d98ac9'],
  ['Giant flower meadow', '#f0a0e0'],
  ['Escarpment', '#6f7f5a'],
  ['Cascades', '#3f9a7a'],
  ['Mountain foothills', '#6e8f4a'],
  ['Mountains', '#8d8797'],
  ['Snowy peaks', '#f1f4f7'],
  ['Black Hills', '#4a4450'],
  ['Smoky Mountains', '#35613d'],
  ['Island', '#5f9a45'],
  ['Volcanic highlands', '#3b4a2c'],
  ['Volcano', '#2b2827'],
  ['Geyser', '#e6dcc4'],
  ['Hot springs', '#d2803a'],
  ['Wetlands', '#5a8a6a'],
  ['Marsh', '#6f9f86'],
  ['Glowing swamp', '#3fb8a8'],
  ['Mangrove coast', '#4d7a3c'],
  ['Jungle', '#1f5a24'],
  ['Bamboo forest', '#4f8a2c'],
  ['Cherry blossom highlands', '#e8a8c4'],
  ['Savanna', '#d2bf6a'],
  ['Mesas', '#c4744a'],
  ['Badlands', '#c9a98e'],
  ['Petrified forest', '#a88ea8'],
  ['Desert', '#e8cf92'],
  ['Dune sea', '#e6b86e'],
  ['Oasis', '#7fa84a'],
  ['Salt flats', '#f4f1e8'],
  ['Canyon', '#b05a3c'],
  ['Canyon floor', '#cdb592'],
  ['River', '#2f7fd0'],
  ['Creek', '#5fb4ea'],
];

export const MAP_INDEX = Object.fromEntries(MAP_LABELS.map(([name], k) => [name, k]));

/**
 * One tile of the big map: `n` x `n` samples `s` metres apart from (x0, z0),
 * as the index of each one's kind of country (255 for anything unlisted)
 * and a hill shade (0..255, 128 flat, lit from the north-west).
 */
export function mapTile(generator, x0, z0, n, s) {
  const labels = new Uint8Array(n * n);
  const shade = new Uint8Array(n * n);
  const heights = new Float32Array((n + 1) * (n + 1));
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) heights[j * (n + 1) + i] = generator.getBaseHeight(x0 + i * s, z0 + j * s);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = x0 + i * s, z = z0 + j * s;
      let label = generator.describe(x, z, true);
      // Rivers drawn at least a pixel wide at any scale; creeks when
      // zoomed in far enough to see them (they're slow to work out).
      if (generator.bigRivers?.waterAt(x, z, s * 0.6)) label = 'River';
      else if (s <= 8 && label !== 'Ocean' && label !== 'Lake') {
        const w = generator.rivers.at(x, z, s * 0.5);
        if (w && !w.pond && !w.big) label = 'Creek';
      }
      labels[j * n + i] = MAP_INDEX[label] ?? 255;
      const h = heights[j * (n + 1) + i];
      const d = -(heights[j * (n + 1) + i + 1] - h) - (heights[(j + 1) * (n + 1) + i] - h);
      shade[j * n + i] = Math.max(0, Math.min(255, 128 + (d / s) * 90));
    }
  }
  return { labels, shade };
}
