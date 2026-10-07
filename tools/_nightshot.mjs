// Night: shots a moment after it falls (your eyes not yet used to it) and
// once they are; with no moon (day 0) or a full one (day 4).
//   node tools/_nightshot.mjs outprefix [moonDay] [seed x z yaw]
import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const [out = 'night', moonDay = '0', seed = 'vz500g', x = '1243', z = '1567', yaw = '0'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto(`http://localhost:4173/?seed=${seed}&x=${x}&z=${z}&up=0&yaw=${yaw}&pitch=-0.02&vd=4&hide&hour=12&loadscreen`, { timeout: 180000 });
await page.waitForFunction(() => document.querySelector('.load-screen')?.classList.contains('ls-done'), null, { timeout: 600000, polling: 500 });
await page.waitForFunction(() => window.world.chunks.pendingCount === 0, null, { timeout: 600000, polling: 1000 }).catch(() => 0);
await page.screenshot({ path: `${out}-day.png`, timeout: 120000 });
// Night falls at once (as if you'd walked out of the light).
await page.evaluate((d) => { const n = window.world.dayNight; n.day = +d; n.hour = 0.5; n._prevHour = 0.5; n.playing = false; }, moonDay);
const t0 = Date.now();
await page.waitForTimeout(1000);
await page.screenshot({ path: `${out}-1s.png`, timeout: 120000 });
console.log('first shot after', Date.now() - t0, 'ms', await page.evaluate(() => ({ moon: +window.world.dayNight.moonlight.toFixed(2), fog: Math.round(window.world.scene.fog.far), veil: document.querySelector('.eye-veil').style.background.slice(0, 60) })));
await page.waitForTimeout(15000);
await page.screenshot({ path: `${out}-15s.png`, timeout: 120000 });
console.log('second shot after', Date.now() - t0, 'ms', await page.evaluate(() => ({ fog: Math.round(window.world.scene.fog.far), veil: document.querySelector('.eye-veil').style.background.slice(0, 60) })));
// (And once your eyes are fully used to it: here, drawing slowly, the game's clock runs too slow to get there.)
await page.evaluate(() => (document.querySelector('.eye-veil').style.visibility = 'hidden'));
await page.screenshot({ path: `${out}-adapted.png`, timeout: 120000 });
await browser.close();
