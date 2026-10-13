// How long the survival spawn search takes (greenGround in main.js, copied),
// and how much of it is the rivers being laid out.   node tools/_spawncost.mjs [seed]
import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const [seed = 'ztuz7s'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.addInitScript(() => localStorage.setItem('facet-lands:quality', 'low'));
await page.goto(`http://localhost:4173/?seed=${seed}&vd=2&up=50`, { timeout: 180000 });
await page.waitForFunction(() => window.world?.generator, null, { timeout: 300000 });
console.log(JSON.stringify(await page.evaluate(() => {
  const { generator, WORLD } = window.world;
  const t0 = performance.now();
  let best = { x: 0, z: 0, h: -Infinity };
  for (let i = 0; i < 400; i++) {
    const x = (i % 20) * 160 - 1600, z = Math.floor(i / 20) * 160 - 1600, h = generator.landHeight(x, z);
    if (h > best.h) best = { x, z, h };
  }
  const tPeak = performance.now() - t0;
  const x = best.x + 300, z = best.z + 360;
  const dry = (w) => (w.desert ?? 0) + (w.saltFlat ?? 0) + (w.badlands ?? 0);
  let okMs = 0, waterMs = 0, oks = 0, waters = 0;
  const ok = (px, pz) => {
    const t = performance.now(); oks++;
    try {
      const h = generator.landHeight(px, pz);
      if (!(h > WORLD.seaLevel + 2 && h < WORLD.seaLevel + 260)) return false;
      const w = generator.getBiomeWeights(px, pz, {});
      if (dry(w) >= 0.02) return false;
      const wooded = Math.max(generator.getForestDensity(px, pz) * ((w.temperate ?? 0) + (w.smoky ?? 0) + (w.pine ?? 0) + (w.blackHills ?? 0) + (w.wetland ?? 0)), w.jungle ?? 0, 0.6 * (w.pine ?? 0), 0.6 * (w.smoky ?? 0));
      const mount = generator.getMountainness(px, pz);
      return wooded > 0.45 || (mount > 0.35 && mount < 0.75);
    } finally { okMs += performance.now() - t; }
  };
  const byWater = (px, pz) => { const t = performance.now(); waters++; const w = generator.rivers.at(px, pz, 45); waterMs += performance.now() - t; return !!w && !w.pond && w.d > w.half + 3; };
  let found = null, ring = 0;
  search: for (let r = 100; r <= 9000; r += 100) {
    ring = r;
    const n = Math.max(8, Math.round(r / 50));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (!ok(px, pz)) continue;
      if (byWater(px, pz)) { found = { px, pz }; break search; }
    }
  }
  const tH = performance.now();
  if (found) generator.getHeight(found.px, found.pz);
  return { peakMs: Math.round(tPeak), ring, oks, okMs: Math.round(okMs), waters, waterMs: Math.round(waterMs), getHeightMs: Math.round(performance.now() - tH), total: Math.round(performance.now() - t0) };
})));
await browser.close();
