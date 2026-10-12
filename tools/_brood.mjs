// The Broodmother, set down in a great chamber in front of you; a look, and an aim at her.   node tools/_brood.mjs out
import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const out = process.argv[2] ?? 'brood';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto('http://localhost:4173/?seed=polaris&x=-715&z=-689&up=5&hide&hour=12&vd=2&weather=clear', { timeout: 180000 });
await page.waitForFunction(() => window.world?.chunks && window.world.chunks.pendingCount === 0, null, { timeout: 600000, polling: 1000 });
const y = await page.evaluate(() => { const { generator: g, camera, controls } = window.world, f = g.caves.field, p = camera.position, ch = f.chamberAt(p.x, p.z); p.y = f.chamberFloor(ch.c, p.x, p.z) + 3; controls.euler.set(-0.1, 0, 0, 'YXZ'); camera.quaternion.setFromEuler(controls.euler); return { y: p.y, rx: ch.c.rx, rz: ch.c.rz, e: ch.e }; });
console.log(JSON.stringify(y));
const hold = async (ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { await page.evaluate((y) => { window.world.camera.position.y = y; }, y.y); await page.waitForTimeout(250); } };
await hold(10000);
for (let k = 0; k < 40; k++) {
  const st = await page.evaluate(() => { const c = window.world.generator.caves.cache; let r = 0, a = 0; for (const e of c.values()) { a++; if (e.ready) r++; } return [r, a]; });
  if (st[1] > 10 && st[0] === st[1]) break;
  await hold(1500);
}
await hold(3000);
const r = await page.evaluate(() => {
  const { spiders, camera, generator: g, THREE } = window.world, p = camera.position;
  const x = p.x, z = p.z - 9, floor = g.caves.groundAt(x, p.y, z, 0).height;
  window.world.game.survival.health = 100;
  spiders.spawnBrood(x, Number.isFinite(floor) ? floor : p.y - 3, z);
  const b = spiders.spiders.at(-1);
  b.state = 'lurk'; b.timer = 99;
  const dir = new THREE.Vector3(b.x - p.x, b.y + 1.5 - p.y, b.z - p.z).normalize();
  const hit = spiders.aim(p, dir, 40);
  return { brood: { y: b.y, size: b.size }, hit: hit ? +hit.distance.toFixed(1) : null };
});
console.log(JSON.stringify(r));
await page.evaluate(() => { const nv = document.getElementById('night'); if (nv && !nv.checked) nv.click(); });
await hold(3000);
await page.screenshot({ path: `${out}.png` });
await browser.close();
