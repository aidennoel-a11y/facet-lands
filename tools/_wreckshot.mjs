// A shipwreck on a beach, looked at, and its sea chest.   node tools/_wreckshot.mjs out [seed x z]
import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const [out = 'wreck', seed = 'polaris', x = '3180', z = '-605'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 900, height: 520 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(`http://localhost:4173/?seed=${seed}&x=${+x + 9}&z=${+z + 9}&y=8&vd=2&hide&hour=11&weather=clear`, { timeout: 180000 });
await page.waitForFunction(() => window.world?.chunks, null, { timeout: 200000 });
await page.waitForTimeout(40000);
console.log(await page.evaluate(([x, z]) => {
  const { camera, controls, game } = window.world;
  camera.lookAt(+x, camera.position.y - 8, +z);
  controls.euler.setFromQuaternion(camera.quaternion, 'YXZ');
  const chest = game.structures.list.find((s) => s.ruinKey?.startsWith('wreck:'));
  return JSON.stringify({ chest: chest ? chest.contents.slots.filter(Boolean).map((s) => `${s.id}x${s.count}`) : null });
}, [x, z]));
await page.waitForTimeout(4000);
await page.screenshot({ path: `${out}.png` });
console.log('errors', errs);
await browser.close();
