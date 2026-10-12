// The nearest ruin: found, gone to, looked at; its chests.   node tools/_ruinshot.mjs out [seed] [n]
import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const [out = 'ruin', seed = 'polaris', nth = '0'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 560 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto(`http://localhost:4173/?seed=${seed}&up=0&vd=1&hide&hour=10&weather=clear`, { timeout: 180000 });
await page.waitForFunction(() => window.world?.chunks && window.world.chunks.pendingCount === 0, null, { timeout: 600000, polling: 1000 });
const site = await page.evaluate((nth) => {
  const { game, camera } = window.world, p = camera.position;
  const list = game.ruinsNear(p.x, p.z, 3000).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
  const s = list[+nth];
  if (!s) return null;
  if (window.world.controls.mode === 'walk') document.getElementById('fly')?.click();
  camera.position.set(s.x, window.world.generator.getHeight(s.x, s.z) + 30, s.z);
  return { x: s.x, z: s.z, rot: s.rot, count: list.length };
}, nth);
console.log('site', JSON.stringify(site));
if (site) site.u = +(process.argv[5] ?? -30);
if (site) {
  await page.waitForTimeout(3000);
  await page.waitForFunction(() => window.world.chunks.pendingCount === 0, null, { timeout: 600000, polling: 1000 });
  await page.waitForTimeout(3000);
  const info = await page.evaluate((s) => {
    const { camera, controls, generator: g, game } = window.world;
    // From out in front of the gateway, a little up.
    const ca = Math.cos(s.rot), sa = Math.sin(s.rot);
    const u = s.u, v = 12, x = s.x + ca * u + sa * v, z = s.z - sa * u + ca * v;
    camera.position.set(x, g.getHeight(x, z) + 6, z);
    camera.lookAt(s.x, g.getHeight(s.x, s.z) + 3, s.z);
    controls.euler.setFromQuaternion(camera.quaternion, 'YXZ');
    const chests = game.structures.list.filter((c) => c.ruinKey).map((c) => ({ key: c.ruinKey, items: c.contents.slots.filter(Boolean).map((st) => `${st.id}x${st.count}`) }));
    return { chests };
  }, site);
  console.log(JSON.stringify(info));
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${out}.png` });
}
await browser.close();
