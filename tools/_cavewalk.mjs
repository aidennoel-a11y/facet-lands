// Walk through a cave: how far your feet are from the drawn rock floor, step by step.
//   node tools/_cavewalk.mjs [seed x z]
import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const [seed = 'polaris', x = '-715', z = '-689'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 480, height: 300 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto(`http://localhost:4173/?seed=${seed}&x=${x}&z=${z}&hide&vd=2`, { timeout: 180000 });
await page.waitForFunction(() => window.world?.chunks, null, { timeout: 300000 });
// Down into the cave there, walking.
const start = await page.evaluate(() => {
  const { camera, controls, generator } = window.world, p = camera.position;
  const caves = generator.caves;
  for (let y = generator.getHeight(p.x, p.z) - 3; y > -200; y -= 0.5) {
    if (caves.caveDensity(p.x, y, p.z) < -0.5 && caves.caveDensity(p.x, y - 1.5, p.z) < -0.5) {
      const g = caves.groundAt(p.x, y, p.z, NaN);
      p.y = g.height + 1.7;
      if (!document.getElementById('fly').checked) {} else document.getElementById('fly').click();
      return { y: g.height };
    }
  }
  return null;
});
console.log('start', JSON.stringify(start));
await page.waitForFunction(() => { const { camera: c, controls, generator: g } = window.world; return g.caves.meshFloor(c.position.x, c.position.z, c.position.y, true) !== null; }, null, { timeout: 120000, polling: 1000 }).catch(() => console.log('(no cave mesh yet)'));
await page.evaluate(() => document.getElementById('automove')?.click());
const rows = [];
for (let k = 0; k < 30; k++) {
  await page.waitForTimeout(800);
  if (k % 6 === 5) await page.evaluate(() => { window.world.controls.euler.y += 1.3; });
  rows.push(await page.evaluate(() => {
    const { camera, controls, generator } = window.world, p = camera.position, feet = p.y - controls.eyeHeight;
    const mf = generator.caves.meshFloor(p.x, p.z, feet + 1.2, true);
    return { x: Math.round(p.x), z: Math.round(p.z), feet: +feet.toFixed(2), off: mf === null ? null : +(feet - mf).toFixed(2), mode: controls.mode };
  }));
}
console.log(rows.map((r) => `${r.x},${r.z} feet ${r.feet} vs drawn floor ${r.off}`).join('\n'));
await browser.close();
