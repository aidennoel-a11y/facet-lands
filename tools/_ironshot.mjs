// An iron boulder on the surface, looked at.   node tools/_ironshot.mjs out
import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const out = process.argv[2] ?? 'iron';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 800, height: 480 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto('http://localhost:4173/?seed=polaris&x=300&z=-200&up=0&vd=2&hide&hour=11&weather=clear', { timeout: 180000 });
await page.waitForFunction(() => window.world?.chunks, null, { timeout: 200000 }); await page.waitForTimeout(60000); console.log('pending', await page.evaluate(() => window.world.chunks.pendingCount));
console.log(await page.evaluate(() => {
  const { game, camera, controls } = window.world, all = [...game.items.chunks.values()].flatMap((c) => c.items);
  const it = all.find((i) => i.id === 'iron');
  if (!it) return 'none';
  camera.position.set(it.x + 3.5, it.y + 2, it.z + 3.5);
  camera.lookAt(it.x, it.y + 0.4, it.z);
  controls.euler.setFromQuaternion(camera.quaternion, 'YXZ');
  return `iron ${all.filter((i) => i.id === 'iron').length}, rock ${all.filter((i) => i.id === 'rock').length}`;
}));
await page.waitForTimeout(5000);
await page.screenshot({ path: `${out}.png` });
await browser.close();
