// A rope off a drop in a cave: looks round a spot for a lip, places it, and a shot of it.   node tools/_caverope.mjs out seed x z y
import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const [out = 'caverope', seed = '87pyte', x = '-802', z = '806', y = '-77'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 900, height: 500 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto(`http://localhost:4173/?seed=${seed}&x=${x}&z=${z}&y=${y}&hide&hour=15&weather=clear`, { timeout: 180000 });
await page.waitForFunction(() => window.world?.chunks && window.world.chunks.pendingCount === 0, null, { timeout: 900000, polling: 1000 });
for (let k = 0; k < 200; k++) {
  await page.evaluate((y) => { window.world.camera.position.y = +y; }, y);
  await page.waitForTimeout(500);
  if (k > 20 && k % 10 === 0) { const st = await page.evaluate(() => { const c = window.world.generator.caves.cache; let r = 0, a = 0; for (const e of c.values()) { a++; if (e.ready) r++; } return [r, a]; }); if (st[1] > 20 && st[0] === st[1]) break; }
}
// Candidate lips: floor points where the floor a few metres on is much lower.
const cands = await page.evaluate(([x0, z0, y0]) => {
  const { groundAt } = window.world, out = [];
  const g = (x, z, y) => groundAt(x, y, z).height;
  for (let r = 0; r < 60; r += 3) for (let a = 0; a < 6.28; a += 0.5) {
    const x = +x0 + Math.cos(a) * r, z = +z0 + Math.sin(a) * r, f = g(x, z, +y0 + 2);
    if (!Number.isFinite(f) || f < +y0 - 30) continue;
    for (let yaw = 0; yaw < 6.28; yaw += 0.5) {
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      const f1 = g(x + fx * 0.6, z + fz * 0.6, f + 0.5), f2 = g(x + fx * 3, z + fz * 3, f + 0.5);
      if (Math.abs(f1 - f) < 0.4 && f - f2 > 4) out.push({ x, z, yaw, f });
    }
  }
  return out.slice(0, 40);
}, [x, z, y]);
console.log('candidates', cands.length);
if (!cands.length) {
  await browser.close();
  process.exit(0);
}
await page.evaluate(() => { if (window.world.controls.mode !== 'walk') document.getElementById('fly')?.click(); });
let placed = null;
for (const c of cands) {
  const plan = await page.evaluate(async (c) => {
    const { game, camera, controls } = window.world;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    for (let k = 0; k < 4; k++) {
      camera.position.set(c.x, c.f + controls.eyeHeight + 0.05, c.z);
      controls.euler.set(-0.5, c.yaw, 0, 'YXZ');
      camera.quaternion.setFromEuler(controls.euler);
      game.inventory.slots[game.hotbar.index] = { id: 'rope', count: 2 };
      game.inventory.changed();
      await wait(250);
    }
    const p = game.plan;
    if (p?.ok) game.structures.build(p, { len: p.len, path: p.path });
    return p && { ok: p.ok, why: p.why, len: p.len, path: p.path, x: p.x, y: p.y, z: p.z, rot: p.rot };
  }, c);
  if (plan?.ok) { placed = plan; break; }
  else console.log('no', plan?.why);
}
console.log('placed', JSON.stringify(placed));
if (placed) {
  await page.evaluate((p) => {
    const { camera, controls } = window.world;
    if (controls.mode === 'walk') document.getElementById('fly')?.click();
    const bx = Math.sin(p.rot), bz = Math.cos(p.rot), sx = bz, sz = -bx;
    const mid = p.path[Math.floor(p.path.length / 2)];
    const tx = p.x + bx * mid[0], ty = p.y + mid[1], tz = p.z + bz * mid[0];
    camera.position.set(tx + sx * 3 + bx * 7, ty + 1.5, tz + sz * 3 + bz * 7);
    const nv = document.getElementById('night'); if (nv && !nv.checked) nv.click();
    camera.lookAt(tx, ty, tz);
    controls.euler.setFromQuaternion(camera.quaternion, 'YXZ');
  }, placed);
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${out}.png` });
}
await browser.close();
