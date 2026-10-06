// Through the title screen into a new world, as a player would: the
// loading screen's shots along the way, and when it lets you in.
//   node tools/_menuload.mjs outprefix
import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const out = process.argv[2] ?? 'menuload';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
const t0 = Date.now();
await page.goto('http://localhost:4173/', { timeout: 180000 });
await page.click('[data-go="start"]');
await page.click('[data-go="new"]');
await page.fill('#sm-seed', 'polaris');
const tClick = Date.now();
await page.click('[data-go="play"]');
await page.waitForTimeout(3000);
await page.screenshot({ path: `${out}-1.png`, timeout: 180000 });
let shot = 2;
const watch = setInterval(async () => { if (shot < 4) await page.screenshot({ path: `${out}-${shot++}.png`, timeout: 120000 }).catch(() => 0); }, 30000);
await page.waitForFunction(() => document.querySelector('.load-screen')?.classList.contains('ls-done'), null, { timeout: 400000, polling: 200 });
clearInterval(watch);
const tIn = Date.now() - tClick;
await page.waitForTimeout(4000);
await page.screenshot({ path: `${out}-in.png`, timeout: 180000 });
console.log(JSON.stringify({ title: tClick - t0, in: tIn, near: await page.evaluate(() => window.world.chunks.readyNear(window.world.camera.position, 2)) }));
await browser.close();
