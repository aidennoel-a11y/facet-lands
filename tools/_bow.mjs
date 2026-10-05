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
await page.waitForTimeout(8000); // (landed: then well again, if the drop hurt)
await page.evaluate(() => { const s = window.world.game.survival; s.alive = true; s.health = 100; });
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
await page.waitForTimeout(3000);
console.log('axe0', await page.evaluate(() => { const g = window.world.game; return [g.survival.alive, g.survival.cause, g.survival.health, window.world.camera.position.toArray(), g.heldId, JSON.stringify(g.inventory.slots[g.hotbar.index]), g.hotbar.index, window.world.controls.mode, g.hud.busy]; }));
console.log('axe', await page.evaluate(() => { const g = window.world.game, { THREE, camera } = window.world; const m = g.grip.children[0]; m.geometry.computeBoundingBox(); const bb = m.geometry.boundingBox; const pts = [bb.min, bb.max].map((p) => p.clone().applyMatrix4(m.matrixWorld).project(camera).toArray().map((v) => +v.toFixed(2))); return [pts, m.material.type, m.geometry.attributes.position.count, g.heldId, g.grip.children.length, g.grip.children.map((c) => c.visible), JSON.stringify(g.anim), g.hand.position.toArray(), g.grip.rotation.toArray()]; }));
await page.screenshot({ path: `${out}-axe.png` });
for (const [k, t] of [['up', 0.3], ['down', 0.55], ['bite', 0.62], ['back', 0.85]]) {
  await page.evaluate((t) => { const g = window.world.game; g.anim = { kind: 'chop', t: t * 0.62, duration: 0.62, bite: true }; g.anim.duration = 1e9; g.anim.t = t * 1e9; }, t);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}-chop-${k}.png` });
}
await browser.close();
