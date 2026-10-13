// Opening the big map (B) and zooming out: errors, and how long each draw takes.   node tools/_mapopen.mjs [mode]
import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const [mode = 'testing'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 600 } });
page.on('pageerror', (e) => console.log('ERR', e.message, e.stack?.split('\n').slice(0, 4).join(' | ')));
page.on('console', (m) => m.type() === 'error' && console.log('CONSOLE', m.text().slice(0, 300)));
await page.goto('http://localhost:4173/?seed=polaris&x=399&z=1025&up=2&vd=1&hour=12&weather=clear', { timeout: 180000 });
await page.waitForFunction(() => window.world?.chunks && window.world.chunks.pendingCount === 0, null, { timeout: 600000, polling: 1000 });
await page.evaluate((m) => { window.world.game.mode = m; }, mode);
await page.waitForTimeout(1500);
await page.evaluate(() => {
  // (Each big-map draw timed, and the ruins' part of it.)
  const m = window.world.bigMap, w = window.__mapTimes = { draws: 0, ms: 0, worst: 0 };
  const draw = m.draw.bind(m);
  m.draw = () => { const t = performance.now(); draw(); const d = performance.now() - t; w.draws++; w.ms += d; w.worst = Math.max(w.worst, d); };
  const ruins = m.ruins;
  m.ruins = (...a) => { const t = performance.now(); const r = ruins(...a); w.ruins = (w.ruins ?? 0) + performance.now() - t; return r; };
});
let t = Date.now();
await page.keyboard.press('KeyB');
await page.waitForTimeout(500);
console.log('opened in', Date.now() - t, 'ms');
for (let k = 0; k < 6; k++) {
  t = Date.now();
  await page.mouse.move(500, 300);
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(300);
  const ok = await page.evaluate(() => 1).catch(() => 0);
  console.log('zoom out', k, Date.now() - t, 'ms', ok ? '' : 'PAGE DEAD');
}
console.log(JSON.stringify(await page.evaluate(() => window.__mapTimes)));
await page.screenshot({ path: '/tmp/claude-0/-home-user-Claudetest/04b8a724-ab66-5800-8846-fb631b4ef23e/scratchpad/mapopen.png' });
await browser.close();
