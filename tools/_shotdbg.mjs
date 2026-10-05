import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const args = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const base = `http://localhost:4173/?seed=vz500g&vd=1&hide&hour=11&server=ws://localhost:8788`;
const open = async (q) => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args });
  const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
  page.on('pageerror', (e) => console.log('ERR', e.message));
  await page.goto(`${base}&${q}`, { timeout: 180000 });
  await page.waitForFunction(() => window.world?.chunks, null, { timeout: 120000 });
  return { page, browser };
};
const A = await open('x=1243&z=1567&up=0&mp=host&name=Host');
await A.page.waitForFunction(() => window.world.mp.code, null, { timeout: 150000 });
const code = await A.page.evaluate(() => window.world.mp.code);
const B = await open(`x=1243&z=1561&up=0&mp=${code}&name=Guest`);
await B.page.waitForFunction(() => window.world.mp.connected && window.world.sync.started, null, { timeout: 300000 });
await B.page.evaluate(() => { const w = window.world, f = w.mp.onWorld; window.fx = []; w.mp.onWorld = (m) => { if (m.t === 'fx') window.fx.push(...m.fx.map((x) => x.k ?? x.n)); f(m); }; const g = w.game, gs = g.ghostShot.bind(g); window.shots = []; g.ghostShot = (r) => { try { gs(r); window.shots.push(g.ghosts.length); } catch (e) { window.shots.push(String(e)); } }; });
for (let k = 0; k < 3; k++) {
  console.log('host', await A.page.evaluate(() => { const p = window.world.camera.position; window.world.game.onShot({ m: 'arrow', p: [p.x, p.y, p.z], v: [0, 8, 30] }); return [window.world.sync.fx.length, window.world.sync.online, window.world.mp.isHost, window.world.sync.started]; }));
  await B.page.waitForTimeout(3000);
  console.log('guest', await B.page.evaluate(() => [window.fx.slice(-6), window.shots]));
}
await A.browser.close();
await B.browser.close();
