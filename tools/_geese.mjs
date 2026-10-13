// A skein of geese overhead in the spring, looked up at.   node tools/_geese.mjs out
import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const out = process.argv[2] ?? 'geese';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 900, height: 520 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto('http://localhost:4173/?seed=polaris&x=300&z=-200&up=0&vd=1&hide&hour=11&weather=clear&season=spring', { timeout: 180000 });
await page.waitForFunction(() => window.world?.chunks, null, { timeout: 200000 });
await page.waitForTimeout(15000);
await page.evaluate(() => { window.world.seasons.time = 0.5; window.world.geese.wait = 0; });
await page.waitForTimeout(6000);
const r = await page.evaluate(() => {
  const g = window.world.geese, { camera, controls } = window.world;
  if (!g.flight) return 'no flight';
  // (Put the skein just overhead, ahead of you, and look up at it.)
  g.flight.at.set(camera.position.x, camera.position.y + 40, camera.position.z - 30);
  camera.lookAt(g.flight.at.x, g.flight.at.y, g.flight.at.z + 6);
  controls.euler.setFromQuaternion(camera.quaternion, 'YXZ');
  return `flight of ${g.flight.n}`;
});
console.log(r);
await page.waitForTimeout(3000);
await page.screenshot({ path: `${out}.png` });
console.log('errors', errs);
await browser.close();
