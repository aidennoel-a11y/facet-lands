// Wild crops on the plains: how many lie about, one looked at, and reaped with a sickle.   node tools/_wildcrops.mjs out [seed x z]
import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const [out = 'wild', seed = 'polaris', x = '300', z = '-200'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 900, height: 520 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto(`http://localhost:4173/?seed=${seed}&x=${x}&z=${z}&up=0&vd=2&hide&hour=11&weather=clear`, { timeout: 180000 });
await page.waitForFunction(() => window.world?.chunks && window.world.chunks.pendingCount === 0, null, { timeout: 600000, polling: 1000 });
const r = await page.evaluate(() => {
  const { game, camera, controls } = window.world, items = game.items;
  const all = [...items.chunks.values()].flatMap((c) => c.items).filter((it) => it.id.startsWith('wild'));
  const counts = {};
  for (const it of all) counts[it.id] = (counts[it.id] ?? 0) + 1;
  const it = all.find((a) => a.id === 'wildWheat') ?? all[0];
  if (!it) return { counts, chunks: items.chunks.size };
  camera.position.set(it.x + 2.2, it.y + 1.7, it.z + 2.2);
  camera.lookAt(it.x, it.y + 0.3, it.z);
  controls.euler.setFromQuaternion(camera.quaternion, 'YXZ');
  window.__it = it;
  return { counts, chunks: items.chunks.size, at: [Math.round(it.x), Math.round(it.z)], id: it.id };
});
console.log(JSON.stringify(r));
await page.waitForTimeout(5000);
await page.screenshot({ path: `${out}.png` });
const reaped = await page.evaluate(() => {
  const it = window.__it;
  if (!it) return null;
  const near = window.world.game.items.wildNear(it.x, it.z, 1.6);
  return near.map((n) => n.id);
});
console.log('near', JSON.stringify(reaped));
await browser.close();
