// First-person bow draw and axe swing, screenshotted: node tools/_bow.mjs outprefix
import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const out = process.argv[2] ?? 'bow';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 700, height: 450 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto(`http://localhost:4173/?seed=vz500g&x=1243&z=1567&up=0&vd=2&hide&hour=11`, { timeout: 180000 });
await page.waitForFunction(() => window.world?.chunks, null, { timeout: 200000 });
await page.waitForTimeout(45000);
await page.evaluate(() => (window.world.controls.mode = 'walk'));
const set = (id) => page.evaluate((id) => { const g = window.world.game; g.inventory.slots[g.hotbar.index] = { id, count: 1, dur: 50 }; g.inventory.changed?.(); }, id);
await set('bow');
await page.waitForTimeout(1500);
console.log('held', await page.evaluate(() => [window.world.game.heldId, window.world.controls.mode, window.world.game.survival.alive, window.world.game.hud.busy]));
await page.screenshot({ path: `${out}-rest.png` });
await page.evaluate(() => { const g = window.world.game; g.drawing = { since: g.time - 0.45 }; });
await page.waitForTimeout(150);
await page.evaluate(() => { const g = window.world.game; g.drawing = { since: g.time - 0.45 }; });
await page.screenshot({ path: `${out}-half.png` });
await page.evaluate(() => { const g = window.world.game; g.drawing = { since: g.time - 2 }; });
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}-full.png` });
await page.evaluate(() => { window.world.game.drawing = null; });
await set('axe');
await page.waitForTimeout(800);
for (const [k, t] of [['up', 0.45], ['bite', 0.62]]) {
  await page.evaluate((t) => { const g = window.world.game; g.anim = { kind: 'chop', t: t * 0.62, duration: 0.62, bite: true }; g.anim.duration = 1e9; g.anim.t = t * 1e9; }, t);
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${out}-chop-${k}.png` });
}
await browser.close();
