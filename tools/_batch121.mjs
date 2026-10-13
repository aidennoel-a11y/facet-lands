// The inventory (E), a worn backpack, sorting; dropping things (R) apart on
// the ground; meat on a fire's stones; third person (F3); straw from the
// sickle. Shots of each; no errors.   node tools/_batch121.mjs out
import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const out = process.argv[2] ?? 'b121';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 620 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message + ' | ' + (e.stack ?? '').split('\n').slice(1, 3).join(' ')));
await page.goto('http://localhost:4173/', { timeout: 180000 });
await page.evaluate(() => localStorage.setItem('facet-lands:quality', 'low'));
await page.click('[data-go="start"]');
await page.click('[data-go="new"]');
await page.fill('#sm-seed', 'polaris');
await page.fill('#sm-name', 'B121');
await page.click('[data-go="play"]');
await page.waitForTimeout(500);
if (await page.$('[data-go="play"]')) await page.click('[data-go="play"]').catch(() => {});
await page.waitForFunction(() => document.querySelector('.load-screen')?.classList.contains('ls-done'), null, { timeout: 900000, polling: 500 });
await page.waitForTimeout(8000);
const step = async (name, fn, arg) => {
  try {
    console.log(name, JSON.stringify(await page.evaluate(fn, arg)));
  } catch (e) {
    console.log(name, 'FAILED', e.message.split('\n')[0]);
  }
};
await step('setup', () => {
  const { game } = window.world;
  game.inventory.clear();
  for (const [id, n] of [['rock', 6], ['backpack', 1], ['stick', 5], ['coat', 1], ['rawMeat', 3], ['berries', 4], ['rock', 3], ['flint', 2], ['log', 2], ['vine', 3]]) game.inventory.add({ id, count: n, ...(id === 'coat' ? { dur: 1 } : {}) });
  return { slots: game.inventory.slots.map((s) => s && `${s.id}×${s.count}`), open: game.inventory.open };
});
await page.keyboard.press('KeyE');
await page.waitForTimeout(600);
await step('inv open', () => !document.querySelector('.inv-ui').hidden);
// The backpack: clicked, then the figure's back.
await step('wear backpack', () => {
  const { game } = window.world, i = game.inventory.slots.findIndex((s) => s?.id === 'backpack');
  document.querySelector(`.inv-hot [data-i="${i}"]`).click();
  document.querySelector('[data-worn="back"]').click();
  return { back: game.inventory.back?.id, open: game.inventory.open, packShown: !document.querySelector('.inv-pack-head').hidden };
});
await step('sort', () => {
  document.querySelector('.inv-sort').click();
  return window.world.game.inventory.slots.map((s) => s && `${s.id}×${s.count}`);
});
await step('move 0->12', () => {
  document.querySelector('.inv-hot [data-i="0"]').click();
  document.querySelector('.inv-pack [data-i="12"]').click();
  return window.world.game.inventory.slots.map((s) => s && `${s.id}×${s.count}`);
});
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}-inv.png` });
await page.keyboard.press('KeyE');
await page.waitForTimeout(400);
await step('inv closed', () => document.querySelector('.inv-ui').hidden);
// Dropping (R): one rock at a time, all from the same spot.
await step('drop', async () => {
  const { game, controls, camera } = window.world;
  const i = game.inventory.slots.findIndex((s) => s?.id === 'rock');
  game.hotbar.select(i, true);
  controls.euler.set(-0.9, 0, 0, 'YXZ');
  camera.quaternion.setFromEuler(controls.euler);
  for (let k = 0; k < 5; k++) {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyR' }));
    await new Promise((r) => setTimeout(r, 700));
  }
  await new Promise((r) => setTimeout(r, 2500));
  const d = game.items.drops.filter((x) => x.stack.id === 'rock');
  let closest = Infinity;
  for (const a of d) for (const b of d) if (a !== b) closest = Math.min(closest, Math.hypot(a.x - b.x, a.z - b.z));
  return { dropped: d.length, settled: d.filter((x) => x.settled).length, closest: +closest.toFixed(2), radii: d.map((x) => x.restR?.toFixed(2)) };
});
await page.waitForTimeout(1000);
await page.screenshot({ path: `${out}-drops.png` });
// A fire with meat on its stones.
await step('fire', () => {
  const { game, camera, chunks } = window.world;
  const x = camera.position.x, z = camera.position.z - 2.2, y = chunks.groundHeightAt(x, z);
  game.structures.build({ type: 'campfire', x, y, z, rot: 0, ok: true });
  const s = game.structures.list.find((t) => t.type === 'campfire');
  for (let k = 0; k < 3; k++) game.structures.work(s, { id: 'rawMeat', count: 1 }, { id: 'cookedMeat', count: 1 }, 60);
  return { jobs: s.jobs.length, shown: s.jobGroup?.children.length };
});
await step('look at fire', () => {
  const { controls, camera } = window.world;
  controls.euler.set(-0.6, 0, 0, 'YXZ');
  camera.quaternion.setFromEuler(controls.euler);
  return true;
});
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}-fire.png` });
await step('straw', () => {
  const { game, camera } = window.world;
  return [0, 1, 2].map((k) => game.cutGrass(camera.position.x + 6 + k * 4, camera.position.z + 6, 1.5));
});
await page.keyboard.press('F3');
await step('look level', () => {
  const { controls, camera } = window.world;
  controls.euler.set(-0.15, 0.6, 0, 'YXZ');
  camera.quaternion.setFromEuler(controls.euler);
  return true;
});
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}-third.png` });
await page.keyboard.press('F3');
await page.waitForTimeout(500);
console.log('errors', errs);
await browser.close();
