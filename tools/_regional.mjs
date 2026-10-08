// Regional seasons: a wood at the jungle's edge in autumn (it shouldn't
// turn), and the mountains in mid autumn (snow lying up high; leaves
// turned sooner).   node tools/_regional.mjs outprefix
import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const out = process.argv[2] ?? 'regional';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 900, height: 500 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
const d = 12;
for (const [name, x, z, t, up] of [['jungle-edge-autumn', -4978, 861, 2 + 4 / d, 30], ['mountain-midautumn', -2920, -9040, 2 + 7 / d, 40], ['mountain-latesummer', -2920, -9040, 1 + 10.5 / d, 40]]) {
  await page.goto(`http://localhost:4173/?seed=polaris&x=${x}&z=${z}&up=${up}&pitch=-0.3&vd=3&hide&hour=12&weather=clear`, { timeout: 180000 });
  await page.waitForFunction(() => window.world?.chunks && window.world.chunks.pendingCount === 0, null, { timeout: 900000, polling: 1000 });
  await page.evaluate((t) => { const s = window.world.seasons; s.auto = true; s.time = t; s.update(0, 0.016); }, t);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}-${name}.png` });
  console.log(name, JSON.stringify(await page.evaluate(() => { const u = window.world.seasons; return { name: u.name, high: +(+document.querySelector ? 0 : 0) }; })));
}
await browser.close();
