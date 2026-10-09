// Shots of things held in the hand, and a vein of ore broken with a pick.   node tools/_held.mjs outprefix
import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const out = process.argv[2] ?? 'held';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 900, height: 500 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto('http://localhost:4173/?seed=polaris&x=399&z=1025&y=16.4&up=0&vd=1&hide&hour=12&weather=clear', { timeout: 180000 });
await page.waitForFunction(() => window.world?.chunks && window.world.chunks.pendingCount === 0, null, { timeout: 600000, polling: 1000 });
await page.evaluate(() => { if (window.world.controls.mode !== 'walk') document.getElementById('fly')?.click(); });
await page.waitForFunction(() => { const { camera, generator, controls } = window.world; return controls.mode === 'walk' && camera.position.y - generator.getHeight(camera.position.x, camera.position.z) < 2.2; }, null, { timeout: 120000, polling: 250 });
await page.waitForTimeout(6000);
console.log('alive', await page.evaluate(() => JSON.stringify({ alive: window.world.game.survival.alive, cause: window.world.game.survival.cause, last: window.world.game.survival.lastHurt })));
for (const id of ['apple', 'berries', 'bread', 'carrot', 'wool', 'grizzlyPelt', 'campfire', 'chest', 'goldOre', 'caveLamp', 'flintSteel', 'fangSword']) {
  await page.evaluate((id) => { const g = window.world.game; g.inventory.slots[g.hotbar.index] = { id, count: 1 }; g.inventory.changed(); }, id);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${out}-${id}.png`, clip: { x: 450, y: 200, width: 450, height: 300 } });
}
// A vein of gold ore at your feet: blows with a stone pick until it breaks.
const r = await page.evaluate(async () => {
  const { game, camera, generator } = window.world;
  const gi = game.items, C = 128;
  const x = camera.position.x - Math.sin(0) * 1.6, z = camera.position.z - Math.cos(0) * 1.6;
  const y = window.world.chunks.groundHeightAt(x, z);
  const { InstancedMesh } = window.world.THREE;
  const mesh = new InstancedMesh(gi.model('goldOre', 'node'), gi.material, 1);
  mesh.position.set(0, 0, 0);
  const item = { key: 'test-vein', id: 'goldOre', x, y, z, turn: 0, index: 0, mesh, node: true, size: 1 };
  mesh.setMatrixAt(0, new window.world.THREE.Matrix4().makeTranslation(x, y, z));
  window.world.scene.add(mesh);
  const key = `${Math.floor(x / C)},${Math.floor(z / C)}`;
  const src = gi.chunks.get(key) ?? { items: [] };
  src.items.push(item);
  gi.chunks.set(key, src);
  window.world.controls.euler.set(-0.9, 0, 0, 'YXZ');
  camera.quaternion.setFromEuler(window.world.controls.euler);
  game.inventory.slots[game.hotbar.index] = { id: 'pickaxe', count: 1, dur: 90 };
  game.inventory.changed();
  return { y };
});
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}-vein.png` });
const before = await page.evaluate(() => window.world.game.inventory.slots.filter(Boolean).map((s) => s.id + 'x' + s.count).join(','));
let blows = 0;
for (; blows < 16; blows++) {
  const gone = await page.evaluate(() => window.world.game.items.chunks.get(`${Math.floor(window.world.camera.position.x / 128)},${Math.floor(window.world.camera.position.z / 128)}`)?.items.find((i) => i.key === 'test-vein')?.gone);
  if (gone) break;
  console.log(await page.evaluate(() => {
    const g = window.world.game;
    g.cooldown = 0;
    const r = g.use(null, () => false);
    const o = g.camera.position, d = g.camera.getWorldDirection(new window.world.THREE.Vector3());
    return JSON.stringify({ r: String(r), breaking: g.breaking, mode: g.mode, walking: g.walking, busy: g.hud.busy, alive: g.survival.alive, sleeping: g.sleeping, pick: g.items.pick(o, d, 3)?.id, cool: g.cooldown });
  }));
  await page.waitForTimeout(3000);
}
const after = await page.evaluate(() => window.world.game.inventory.slots.filter(Boolean).map((s) => s.id + 'x' + s.count).join(','));
console.log(JSON.stringify({ blows, before, after }));
await browser.close();
