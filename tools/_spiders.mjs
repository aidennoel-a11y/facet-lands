// Cave spiders: spawned round you underground, coming for you; a shot of one.   node tools/_spiders.mjs out seed x z y
import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const [out = 'spiders', seed = 'polaris', x = '2450', z = '-2999', y = '-48.5'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 900, height: 500 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto(`http://localhost:4173/?seed=${seed}&x=${x}&z=${z}&y=${y}&hide&hour=12&weather=clear`, { timeout: 180000 });
await page.waitForFunction(() => window.world?.chunks && window.world.chunks.pendingCount === 0, null, { timeout: 900000, polling: 1000 });
for (let k = 0; k < 160; k++) {
  await page.evaluate((y) => { window.world.camera.position.y = +y; }, y);
  await page.waitForTimeout(500);
  if (k > 20 && k % 10 === 0) { const st = await page.evaluate(() => { const c = window.world.generator.caves.cache; let r = 0, a = 0; for (const e of c.values()) { a++; if (e.ready) r++; } return [r, a]; }); if (st[1] > 20 && st[0] === st[1]) break; }
}
await page.evaluate(() => { if (window.world.controls.mode !== 'walk') document.getElementById('fly')?.click(); });
const r = await page.evaluate(async () => {
  const { spiders, camera, game } = window.world;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = [];
  {
    const { generator, chunks } = window.world, eye = camera.position, feet = eye.y - 1.6;
    let found = 0, inC = 0;
    for (let t = 0; t < 60; t++) {
      const a = Math.random() * 6.28, d = 22 + Math.random() * 23, x = eye.x + Math.sin(a) * d, z = eye.z + Math.cos(a) * d;
      for (const from of [feet + 6, feet + 2, feet - 3, feet - 7]) {
        const g = generator.caves.groundAt(x, from, z, chunks.groundHeightAt(x, z));
        if (g.inCave) inC++;
        if (g.inCave && Number.isFinite(g.height) && g.height < from - 0.5 && Math.abs(g.height - feet) < 12) { found++; break; }
      }
    }
    let err = null;
    try {
      for (let k = 0; k < 20; k++) spiders.update(0.25, { eye, under: true, caves: generator.caves, terrain: (x, z) => chunks.groundHeightAt(x, z), fear: [], alive: true });
    } catch (e) { err = String(e.stack).slice(0, 300); }
    log.push(JSON.stringify({ mode: window.world.controls.mode, found, inC, surface: chunks.groundHeightAt(eye.x, eye.z), manual: spiders.spiders.length, err }));
  }
  const hp0 = game.survival.health;
  for (let k = 0; k < 30; k++) {
    await wait(500);
    log.push(spiders.spiders.map((s) => `${s.state}:${Math.hypot(s.x - camera.position.x, s.z - camera.position.z).toFixed(1)}`).join(' '));
  }
  // One right in front, for the picture.
  const s = spiders.spiders[0];
  return { log: [log[0], ...log.filter((_, i) => i % 5 === 4)], wait2: spiders.wait, n: spiders.spiders.length, hurt: hp0 - game.survival.health, first: s && { x: s.x, y: s.y, z: s.z } };
});
console.log(JSON.stringify(r));
const shot = await page.evaluate(() => {
  const { spiders, camera, controls } = window.world;
  const s = spiders.spiders.find((s) => s.alive);
  if (!s) return false;
  if (controls.mode === 'walk') document.getElementById('fly')?.click();
  const nv = document.getElementById('night'); if (nv && !nv.checked) nv.click();
  camera.position.set(s.x + 2.2, s.y + 1.4, s.z + 2.2);
  camera.lookAt(s.x, s.y + 0.4, s.z);
  controls.euler.setFromQuaternion(camera.quaternion, 'YXZ');
  return true;
});
await page.waitForTimeout(2500);
if (shot) await page.screenshot({ path: `${out}.png` });
await browser.close();
