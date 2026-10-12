// One of each kind of ruin: found, gone to, looked at.   node tools/_ruinkinds.mjs outprefix [seed] [kinds,comma]
import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const [out = 'rk', seed = 'polaris', kinds = '0,1,2,3,4,5,6,7,8,9'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 900, height: 520 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto(`http://localhost:4173/?seed=${seed}&up=0&vd=1&hide&hour=10&weather=clear`, { timeout: 180000 });
await page.waitForFunction(() => window.world?.chunks && window.world.chunks.pendingCount === 0, null, { timeout: 600000, polling: 1000 });
const all = await page.evaluate(() => { const p = window.world.camera.position; return window.world.game.ruinsNear(p.x, p.z, 9000).map((s) => ({ x: s.x, z: s.z, rot: s.rot, kind: s.kind, size: s.size, d: Math.hypot(s.x - p.x, s.z - p.z) })).sort((a, b) => a.d - b.d); });
console.log('sites', all.length, JSON.stringify(all.reduce((m, s) => ((m[s.kind] = (m[s.kind] ?? 0) + 1), m), {})));
for (const k of kinds.split(',').map(Number)) {
  const s = all.find((q) => q.kind === k);
  if (!s) { console.log('none of', k); continue; }
  await page.evaluate((s) => { const { camera, controls } = window.world; if (controls.mode === 'walk') document.getElementById('fly')?.click(); camera.position.set(s.x, window.world.generator.getHeight(s.x, s.z) + 30, s.z); }, s);
  for (let k2 = 0; k2 < 3; k2++) {
    await page.waitForTimeout(4000);
    await page.waitForFunction(() => window.world.chunks.pendingCount === 0, null, { timeout: 600000, polling: 1000 });
  }
  const info = await page.evaluate((s) => {
    const { camera, controls, generator: g, game } = window.world;
    const ca = Math.cos(s.rot), sa = Math.sin(s.rot), u = -(s.size + 10), v = s.size * 0.7, x = s.x + ca * u + sa * v, z = s.z - sa * u + ca * v;
    camera.position.set(x, g.getHeight(x, z) + 6 + s.size * 0.8, z);
    camera.lookAt(s.x, g.getHeight(s.x, s.z) + 2, s.z);
    controls.euler.setFromQuaternion(camera.quaternion, 'YXZ');
    return game.structures.list.filter((c) => c.ruinKey).length;
  }, s);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}${k}.png` });
  console.log('kind', k, 'at', Math.round(s.x), Math.round(s.z), 'chests so far', info);
}
await browser.close();
