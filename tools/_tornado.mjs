// A tornado: set off a kilometre away, passing ~150 m by; shots as it
// comes, and of the track it leaves; how many trees it took; something
// built in its path torn apart.   node tools/_tornado.mjs out
import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const out = process.argv[2] ?? 'tornado';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message + ' ' + (e.stack ?? '').split('\n').slice(1, 3).join(' ')));
await page.addInitScript(() => localStorage.setItem('facet-lands:quality', 'low'));
await page.goto('http://localhost:4173/?seed=polaris&x=399&z=1025&hide&hour=16&weather=storm&season=0.8', { timeout: 180000 });
await page.waitForFunction(() => window.world?.chunks && window.world.chunks.pendingCount === 0, null, { timeout: 600000, polling: 1000 });
const info = await page.evaluate(() => {
  const { controls, camera, spawnTornado, tornadoes, game, chunks, trees } = window.world;
  controls.setMode('walk');
  const p = camera.position;
  // Something built where it'll pass: a chest with things in it, a few walls.
  const tx = p.x + 160, tz = p.z;
  for (let k = 0; k < 4; k++) game.structures.build({ type: 'wall', x: tx + k * 4, y: chunks.groundHeightAt(tx + k * 4, tz), z: tz, rot: 0, ok: true });
  const chest = game.structures.build({ type: 'chest', x: tx, y: chunks.groundHeightAt(tx, tz + 4), z: tz + 4, rot: 0, ok: true });
  chest?.contents?.add?.({ id: 'log', count: 5 });
  const a = spawnTornado({ near: 0, delay: 4, back: 520 });
  tornadoes.timeScale = 8;
  // (Aimed right at the walls: its track passes x = tx.)
  const t = tornadoes.active;
  const ang = Math.atan2(tx - t.x0, tz - t.z0);
  t.hx = Math.sin(ang);
  t.hz = Math.cos(ang);
  t.life = 150;
  const before = trees.within(p.x, p.z, 600).length;
  return { start: [Math.round(t.x0), Math.round(t.z0)], built: game.structures.list.length, treesNear: before };
});
console.log('start', JSON.stringify(info));
const look = async () => page.evaluate(() => {
  const { controls, camera, tornadoes } = window.world;
  const c = tornadoes.now;
  if (!c) return null;
  const yaw = Math.atan2(-(c.x - camera.position.x), -(c.z - camera.position.z));
  c.d = Math.hypot(c.x - camera.position.x, c.z - camera.position.z);
  controls.euler.set(c.d > 200 ? 0.18 : 0.32, yaw, 0, 'YXZ');
  camera.quaternion.setFromEuler(controls.euler);
  return { at: [Math.round(c.x), Math.round(c.z)], d: Math.round(Math.hypot(c.x - camera.position.x, c.z - camera.position.z)), r: Math.round(c.r), strength: +c.strength.toFixed(2), threat: +tornadoes.threat.toFixed(2) };
});
for (let k = 0; k < 7; k++) {
  await page.waitForTimeout(k === 0 ? 3000 : 9000);
  console.log('t', k, JSON.stringify(await look()));
  await page.screenshot({ path: `${out}-${k}.png` });
}
const after = await page.evaluate(() => {
  const { game, camera, trees } = window.world;
  return { built: game.structures.list.length, track: game.stormPaths.length, uprooted: game.felling.stumps.filter((s) => s.storm).length, flying: game.items.drops.length, health: Math.round(game.survival.health) };
});
console.log('after', JSON.stringify(after));
console.log('errors', errs);
await browser.close();
