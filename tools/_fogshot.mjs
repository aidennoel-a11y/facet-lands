// The survival map's fog: explored land only.   node tools/_fogshot.mjs out
import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const out = process.argv[2] ?? 'fog';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 600 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto('http://localhost:4173/?seed=polaris&x=399&z=1025&up=2&vd=1&hour=12&weather=clear', { timeout: 180000 });
await page.waitForFunction(() => window.world?.chunks && window.world.chunks.pendingCount === 0, null, { timeout: 600000, polling: 1000 });
await page.evaluate(() => { window.world.game.mode = 'survival'; });
await page.waitForTimeout(3000);
// A walk off east 700 m (a line of explored land), then back.
for (let k = 1; k <= 6; k++) {
  await page.evaluate((k) => { const p = window.world.camera.position; p.x = 399 + k * 120; }, k);
  await page.waitForTimeout(1500);
}
await page.evaluate(() => { const p = window.world.camera.position; p.x = 399 + 300; });
await page.waitForTimeout(4000);
console.log(await page.evaluate(() => window.world.game.explored.size));
await page.screenshot({ path: `${out}-mini.png`, clip: { x: 760, y: 360, width: 240, height: 240 } });
await page.keyboard.press('KeyB');
await page.waitForTimeout(6000);
await page.screenshot({ path: `${out}-big.png` });
await browser.close();
