// No clip: J, then flying straight down goes through the ground into the rock.   node tools/_noclip.mjs
import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto('http://localhost:4173/?seed=polaris&x=-1231&z=2947&vd=1&hide&hour=12&weather=clear', { timeout: 180000 });
await page.waitForFunction(() => window.world?.chunks && window.world.chunks.pendingCount === 0, null, { timeout: 600000, polling: 1000 });
const down = async () => {
  await page.evaluate(() => { const c = window.world.controls; c.euler.set(-1.5, 0, 0, 'YXZ'); window.world.camera.quaternion.setFromEuler(c.euler); });
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(6000);
  await page.keyboard.up('KeyW');
  return page.evaluate(() => { const p = window.world.camera.position; return +(p.y - window.world.generator.getHeight(p.x, p.z)).toFixed(1); });
};
console.log('without: height over the ground', await down());
await page.keyboard.press('KeyJ');
console.log('no clip on:', await page.evaluate(() => window.world.controls.noclip));
console.log('with: height over the ground', await down());
await browser.close();
