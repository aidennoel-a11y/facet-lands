// Third person (F3): you seen from behind, walking in open country. node tools/_thirdperson.mjs out
import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const out = process.argv[2] ?? 'third';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 900, height: 520 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.addInitScript(() => localStorage.setItem('facet-lands:quality', 'low'));
await page.goto('http://localhost:4173/?seed=polaris&x=399&z=1025&hide&hour=11', { timeout: 180000 });
await page.waitForFunction(() => window.world?.chunks && window.world.chunks.pendingCount === 0, null, { timeout: 600000, polling: 1000 });
await page.evaluate(() => {
  const { controls, camera } = window.world;
  controls.setMode('walk');
  controls.euler.set(-0.1, 2.2, 0, 'YXZ');
  camera.quaternion.setFromEuler(controls.euler);
});
await page.keyboard.press('F3');
await page.waitForTimeout(3000);
await page.screenshot({ path: `${out}.png` });
console.log(JSON.stringify({ errs }));
await browser.close();
