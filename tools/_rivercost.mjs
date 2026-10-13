// What the first look at the rivers costs on a fresh world: each region's
// rivers and streams (rivers.prepare, step by step), and the big rivers.
import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const [seed = 'zz9q1'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 300, height: 200 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.addInitScript(() => localStorage.setItem('facet-lands:quality', 'low'));
await page.goto(`http://localhost:4173/?seed=aaa&vd=1&up=50`, { timeout: 180000 });
await page.waitForFunction(() => window.world?.generator, null, { timeout: 300000 });
console.log(JSON.stringify(await page.evaluate((seed) => {
  const { generator, WORLD } = window.world;
  const g = new generator.constructor(seed, WORLD);
  const t0 = performance.now();
  g.landHeight(100, 100);
  const tLand = performance.now() - t0;
  const steps = [];
  const it = g.rivers.prepare(100, 100);
  for (;;) { const t = performance.now(); const r = it.next(); steps.push(Math.round(performance.now() - t)); if (r.done) break; }
  const tb = performance.now();
  g.rivers.big.waterAt(100, 100, 45);
  const big = performance.now() - tb;
  const ta = performance.now();
  g.rivers.at(100, 100, 45);
  return { land: Math.round(tLand), steps: steps.length, maxStep: Math.max(...steps), sum: steps.reduce((a, b) => a + b, 0), top: steps.map((v, i) => [i, v]).sort((a, b) => b[1] - a[1]).slice(0, 6), big: Math.round(big), at: Math.round(performance.now() - ta) };
}, seed)));
await browser.close();
