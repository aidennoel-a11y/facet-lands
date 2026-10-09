// Underground: a shot in a great chamber (and elsewhere) with night vision
// off and on.   node tools/_caveshot.mjs outprefix seed x z [y] [yaw]
import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const [out = 'cave', seed = 'polaris', x = '-715', z = '-689', y = '', yaw = '0'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
page.on('console', (m) => m.type() === 'error' && console.log('CONSOLE', m.text().slice(0, 200)));
await page.goto(`http://localhost:4173/?seed=${seed}&x=${x}&z=${z}&up=5&hide&hour=12&vd=2&weather=clear`, { timeout: 180000 });
await page.waitForFunction(() => window.world?.chunks && window.world.chunks.pendingCount === 0, null, { timeout: 600000, polling: 1000 });
const info = await page.evaluate(([y, yaw]) => {
  const { camera, controls, generator: g } = window.world;
  const f = g.caves.field, p = camera.position;
  const ch = f.chamberAt(p.x, p.z);
  const floor = ch ? f.chamberFloor(ch.c, p.x, p.z) : null;
  p.y = y ? +y : ch ? floor + 4 : p.y;
  controls.euler.set(-0.05, +yaw, 0, 'YXZ');
  camera.quaternion.setFromEuler(controls.euler);
  return { at: [p.x, p.z], chamber: ch && { e: ch.e, y: ch.c.y, ry: ch.c.ry, lake: ch.c.lake, floor }, y: p.y, kind: g.caves.biomeAt(p.x, p.y, p.z) };
}, [y, yaw]);
console.log(JSON.stringify(info));
const hold = async (ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { await page.evaluate((y) => { window.world.camera.position.y = y; }, info.y); await page.waitForTimeout(250); } };
await hold(10000);
for (let k = 0; k < 40; k++) {
  const st = await page.evaluate(() => { const c = window.world.generator.caves.cache; let ready = 0, all = 0; for (const e of c.values()) { all++; if (e.ready) ready++; } return [ready, all]; });
  if (st[0] === st[1]) { console.log('caves ready', st); break; }
  await hold(1500);
}
await page.screenshot({ path: `${out}-dark.png` });
await page.evaluate(() => { const nv = document.getElementById('night'); if (nv && !nv.checked) nv.click(); });
await hold(2500);
await page.screenshot({ path: `${out}-nv.png` });
console.log(await page.evaluate(() => JSON.stringify({ meshes: window.world.scene.getObjectsByProperty('name', 'cave rock').length, water: window.world.scene.getObjectsByProperty('name', 'cave water').length, fish: window.world.scene.getObjectsByProperty('name', 'cave fish').length })));
await browser.close();
