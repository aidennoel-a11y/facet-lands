// The new things to make and use: clothes on, the cold of the water, a bee
// box that fills, a goat milked, a fire arrow set to the grass. Shots of
// the inventory figure dressed, and the goat and the bee box.
//   node tools/_batch126.mjs out
import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const out = process.argv[2] ?? 'b126';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 600 } });
const errs = [];
page.on('console', (m) => m.type() === 'error' && errs.push('console: ' + m.text()));
page.on('pageerror', (e) => errs.push(e.message + ' ' + (e.stack ?? '').split('\n').slice(1, 3).join(' ')));
await page.addInitScript(() => localStorage.setItem('facet-lands:quality', 'low'));
await page.goto('http://localhost:4173/?seed=polaris&x=399&z=1025&hide&hour=13&weather=clear&vd=3&season=1.5', { timeout: 180000 });
await page.waitForFunction(() => window.world?.chunks && window.world.chunks.pendingCount === 0, null, { timeout: 600000, polling: 1000 });
await page.waitForTimeout(3000);
const r = await page.evaluate(async () => {
  const { game, wildlife, camera, controls, fires, THREE } = window.world;
  controls.setMode('walk');
  const inv = game.inventory, o = {};
  inv.clear();
  game.unlocked = () => true;
  inv.back = { id: 'backpack', count: 1 };
  inv.changed();
  const made = [];
  const groups = [
    [[['deerSkin', 4], ['vine', 4], ['pelt', 1], ['straw', 3]], ['boots', 'gloves', 'furHat', 'strawHat']],
    [[['log', 4], ['vine', 2], ['stick', 6], ['honey', 1]], ['pail', 'beeBox', 'sign']],
    [[['log', 1], ['rope', 1], ['deerSkin', 1], ['arrow', 4], ['beeswax', 2], ['vine', 2], ['ironBar', 1]], ['longbow', 'fireArrow', 'candle', 'lantern']],
  ];
  const keep = [];
  for (const [give, ids] of groups) {
    inv.slots.fill(null);
    for (const [id, n] of give) inv.add({ id, count: n });
    for (const id of ids) {
      const before = inv.count(id);
      game.craft(id);
      made.push(`${id}:${inv.count(id) - before}`);
    }
    for (const st of inv.slots) if (st && ids.includes(st.id)) keep.push(st);
  }
  inv.slots.fill(null);
  for (const st of keep) inv.add(st);
  inv.add({ id: 'milk', count: 4 });
  inv.add({ id: 'salt', count: 1 });
  o.made = made.join(' ');
  o.cheeseNoFire = (game.craft('cheese'), inv.count('cheese'));
  // Put the clothes on.
  for (const id of ['boots', 'gloves', 'furHat']) {
    const i = inv.slots.findIndex((s) => s?.id === id);
    if (i >= 0) game.hud.onInvWear(i);
  }
  o.worn = ['head', 'hands', 'feet'].map((k) => inv[k]?.id ?? '-').join(',');
  o.saved = Object.keys(inv.toJSON()).join(',');
  // A goat: tame two, feed both (a kid), and the bee box set down.
  const p = camera.position;
  for (const a of wildlife.animals) a.gone = true;
  wildlife.update(0.05, wildlife.ctx);
  const yaw = controls.euler.y, fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  const g1 = wildlife.spawn('goat', p.x + fx * 6 - fz * 1.5, p.z + fz * 6 + fx * 1.5), g2 = wildlife.spawn('goat', p.x + fx * 6 + fz * 1.5, p.z + fz * 6 - fx * 1.5);
  for (const a of [g1, g2]) Object.assign(a, { tame: true, herd: null });
  wildlife.feed(g1);
  const kid = wildlife.feed(g2);
  o.kid = kid ? `${kid.kind} billy:${kid.billy}` : null;
  const bx = p.x + fx * 4 + fz * 3, bz = p.z + fz * 4 - fx * 3;
  const box = game.structures.build({ type: 'beeBox', x: bx, y: window.world.groundAt(bx, bz), z: bz, rot: 0 }, { data: { wait: 5000, bees: false, honey: 0, wax: 0 } });
  o.box = !!box;
  return o;
});
console.log(JSON.stringify(r));
// Let the game run: the bees should move in (wait was set past due).
await page.waitForTimeout(12000);
const r2 = await page.evaluate(async () => {
  const { game, fires, camera, controls } = window.world;
  const box = game.structures.list.find((s) => s.type === 'beeBox');
  const o = { bees: box?.data, beeWait: game.beeWait, time: game.time };
  // A fire arrow into the grass ahead.
  const inv = game.inventory;
  const i = inv.slots.findIndex((s) => s?.id === 'longbow');
  game.hotbar.index = i;
  game.cooldown = 0;
  const before = fires.burning.size;
  controls.euler.set(-0.25, controls.euler.y, 0, 'YXZ');
  camera.quaternion.setFromEuler(controls.euler);
  game.press();
  if (game.drawing) game.drawing.since -= 2;
  const fa = inv.count('fireArrow');
  game.use();
  o.shot = { fireArrowsLeft: `${fa}->${inv.count('fireArrow')}`, flying: game.flying.length, fire: game.flying[0]?.fire };
  o.before = before;
  return o;
});
await page.waitForTimeout(8000);
const r3 = await page.evaluate(() => ({ burning: window.world.fires.burning.size, flying: window.world.game.flying.length }));
console.log(JSON.stringify(r2), JSON.stringify(r3));
await page.screenshot({ path: `${out}-world.png` });
await page.evaluate(() => { window.world.game.hud.toggleInventory?.(window.world.game.inventory); });
await page.keyboard.press('KeyE');
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}-inv.png` });
console.log('errors', errs);
await browser.close();
