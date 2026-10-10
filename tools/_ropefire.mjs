// The rope down a steep slope (following the ground), and a wildfire in a
// wood (flames on the trees, the trees scorched, its heat).   node tools/_ropefire.mjs outprefix
import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const out = process.argv[2] ?? 'ropefire';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 900, height: 500 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto('http://localhost:4173/?seed=polaris&up=0&vd=1&hide&hour=12&weather=clear', { timeout: 180000 });
await page.waitForFunction(() => window.world?.chunks && window.world.chunks.pendingCount === 0, null, { timeout: 600000, polling: 1000 });
// A steep slope near: a spot whose ground falls away more than 1.3 in 1 over several metres.
const spot = await page.evaluate(() => {
  const { camera, generator: g } = window.world, p = camera.position;
  let best = null;
  for (let r = 10; r < 900 && !best; r += 8) for (let a = 0; a < 6.28 && !best; a += 0.15) {
    const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
    for (let yaw = 0; yaw < 6.28; yaw += 0.4) {
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw), h0 = g.getHeight(x, z);
      const h1 = g.getHeight(x + fx * 2, z + fz * 2), h2 = g.getHeight(x + fx * 6, z + fz * 6), hb = g.getHeight(x - fx * 2, z - fz * 2);
      if (h0 - h1 > 2.4 && h1 - h2 > 4.4 && Math.abs(hb - h0) < 1.5 && h0 > 5) { best = { x, z, yaw, h0 }; break; }
    }
  }
  return best;
});
console.log('spot', JSON.stringify(spot));
if (spot) {
  await page.evaluate(({ x, z, yaw }) => { window.world.camera.position.set(x, window.world.generator.getHeight(x, z) + 30, z); }, spot);
  await page.waitForTimeout(4000);
  await page.waitForFunction(() => window.world.chunks.pendingCount === 0, null, { timeout: 600000, polling: 1000 });
  await page.evaluate(() => { if (window.world.controls.mode !== 'walk') document.getElementById('fly')?.click(); });
  const plan = await page.evaluate(async ({ x, z, yaw }) => {
    const { game, camera, controls, groundAt } = window.world;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    for (let k = 0; k < 12; k++) {
      camera.position.set(x, window.world.chunks.groundHeightAt(x, z) + controls.eyeHeight + 0.05, z);
      controls.velocityY = 0;
      controls.euler.set(-0.5, yaw, 0, 'YXZ');
      camera.quaternion.setFromEuler(controls.euler);
      game.inventory.slots[game.hotbar.index] = { id: 'rope', count: 2 };
      game.inventory.changed();
      await wait(250);
    }
    const p = game.plan;
    if (p?.ok) game.structures.build(p, { len: p.len, path: p.path });
    return p && { ok: p.ok, why: p.why, len: p.len, path: p.path };
  }, spot);
  console.log('plan', JSON.stringify(plan));
  // From the side, to see it lying on the slope.
  await page.evaluate(({ x, z, yaw }) => {
    const { camera, controls, generator: g } = window.world;
    if (controls.mode === 'walk') document.getElementById('fly')?.click();
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), sx = fz, sz = -fx;
    const cx = x + fx * 6 + sx * 16, cz = z + fz * 6 + sz * 16;
    camera.position.set(cx, g.getHeight(x, z) + 2, cz);
    camera.lookAt(x + fx * 6, g.getHeight(x + fx * 6, z + fz * 6), z + fz * 6);
    controls.euler.setFromQuaternion(camera.quaternion, 'YXZ');
  }, spot);
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${out}-rope.png` });
}
// A wildfire in the woods.
const fire = await page.evaluate(async () => {
  const { camera, trees, fires, generator: g, game } = window.world, p = camera.position;
  let best = null;
  for (let r = 0; r < 300; r += 20) for (let a = 0; a < 6.28; a += 0.5) {
    const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
    const n = trees.within(x, z, 12).length;
    if (!best || n > best.n) best = { x, z, n };
  }
  if (!best) return null;
  const y = g.getBaseHeight(best.x, best.z);
  fires.ignite(best.x, y, best.z, (px, pz) => g.getBaseHeight(px, pz));
  const f = fires.fires[fires.fires.length - 1];
  const stumps0 = game.felling.stumps.length;
  const ctx = { time: 0, wind: { x: 1, z: 0 }, rain: 0, light: new window.world.THREE.Color(1, 1, 1), night: 0, camera, sound: null, pan: () => 0 };
  for (let k = 0; k < 30; k++) (ctx.time += 1), fires.update(1, ctx);
  const heat = fires.heatAt(best.x, y, best.z, (px, pz) => g.getBaseHeight(px, pz));
  const zones = fires.zones();
  camera.position.set(best.x + 30, y + 16, best.z + 30);
  camera.lookAt(best.x, y + 5, best.z);
  return { trees: best.n, burning: f.trees.length, flames: f.flames.mesh?.count, heat, zones, scorched: game.felling.stumps.length - stumps0 };
});
console.log('fire', JSON.stringify(fire));
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}-fire.png` });
const later = await page.evaluate(() => {
  const { camera, fires, game } = window.world;
  const ctx = { time: 30, wind: { x: 1, z: 0 }, rain: 0, light: new window.world.THREE.Color(1, 1, 1), night: 0, camera, sound: null, pan: () => 0 };
  for (let k = 0; k < 30; k++) (ctx.time += 1), fires.update(1, ctx);
  return { snags: game.felling.stumps.filter((s) => s.burnt).length };
});
console.log('later', JSON.stringify(later));
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}-fire2.png` });
await browser.close();
