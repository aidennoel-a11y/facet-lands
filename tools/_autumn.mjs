// The leaves turning, kind by kind: shots of a mixed wood through the turn
// into autumn (season time set by hand).   node tools/_autumn.mjs outprefix [seed x z]
import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const [out = 'autumn', seed = 'polaris', x = '300', z = '-200'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto(`http://localhost:4173/?seed=${seed}&x=${x}&z=${z}&up=25&pitch=-0.25&hide&hour=12&vd=4&weather=clear`, { timeout: 180000 });
await page.waitForFunction(() => window.world?.chunks && window.world.chunks.pendingCount === 0, null, { timeout: 600000, polling: 1000 });
await page.waitForTimeout(2000);
const d = 12;
// Summer's end, the turn, a day in, three days in.
for (const [name, day] of [['a-summer', 1 + (d - 2) / d], ['b-turn', 2 - 0.5 / d], ['c-day1', 2 + 1 / d], ['d-day3', 2 + 3 / d], ['e-winter', 3 + 1.5 / d]]) {
  await page.evaluate((t) => { const s = window.world.seasons; s.auto = true; s.time = t; s.update(0, 0.016); }, day);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}-${name}.png` });
  console.log(name, day.toFixed(3));
}
await browser.close();
