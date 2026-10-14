// Close looks at the fish: the camera put by one in the water (a river's, a
// shoal's, a pond's), looking at it; and the frogs. node tools/_fishshot.mjs out
import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const out = process.argv[2] ?? 'fish';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 900, height: 520 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => /Shader|program not valid/.test(m.text()) && errs.push(m.text().slice(0, 300)));
await page.addInitScript(() => localStorage.setItem('facet-lands:quality', 'low'));
await page.goto(`http://localhost:4173/?seed=${process.argv[3] ?? 'polaris'}&x=${process.argv[4] ?? 399}&z=${process.argv[5] ?? 1025}&hide&hour=12&weather=clear&season=1.2`, { timeout: 180000 });
await page.waitForFunction(() => window.world?.chunks && window.world.chunks.pendingCount === 0, null, { timeout: 600000, polling: 1000 });
// Walk the camera to the nearest water with fish in it.
const found = await page.evaluate(async () => {
  const { camera, generator, controls } = window.world;
  controls.setMode('fly');
  const p = camera.position;
  for (let r = 0; r < 1500; r += 40) {
    for (let a = 0; a < 6.28; a += 0.4) {
      const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
      const w = generator.rivers.at(x, z, 0);
      if (w && !w.pond && w.half > 2) return { x, z, level: w.level };
    }
  }
  return null;
});
console.log('water', JSON.stringify(found));
if (found) {
  await page.evaluate((f) => { const { camera } = window.world; camera.position.set(f.x + 4, f.level + 3, f.z + 4); }, found);
  await page.waitForFunction(() => window.world.chunks.pendingCount === 0, null, { timeout: 600000, polling: 1000 });
  await page.waitForTimeout(4000);
  const fishes = await page.evaluate(() => window.world.fish.list.slice(0, 5).map((f) => ({ id: f.id, x: +f.x.toFixed(1), y: +f.y.toFixed(1), z: +f.z.toFixed(1), kind: f.kind })));
  console.log('fish', JSON.stringify(fishes));
  if (fishes.length) {
    await page.evaluate((f) => {
      const { camera, controls } = window.world;
      camera.position.set(f.x + 0.7, f.y + 1.1, f.z + 0.7);
      const dx = f.x - camera.position.x, dy = f.y - camera.position.y, dz = f.z - camera.position.z;
      controls.euler.set(Math.atan2(dy, Math.hypot(dx, dz)), Math.atan2(-dx, -dz), 0, 'YXZ');
      camera.quaternion.setFromEuler(controls.euler);
    }, fishes[0]);
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${out}-1.png` });
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${out}-2.png` });
  }
}
console.log('errors', errs);
await browser.close();
