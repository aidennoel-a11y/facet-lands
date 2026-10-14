// Predators hunting prey: a cougar near deer, two wolves near sheep, away
// from you, at dusk; the animals' minds run on for a minute or two of
// their time; what the hunters did (stalk, rush, kill, feed), shots.
//   node tools/_hunt.mjs out
import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const out = process.argv[2] ?? 'hunt';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 900, height: 520 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message + ' ' + (e.stack ?? '').split('\n').slice(1, 3).join(' ')));
await page.addInitScript(() => localStorage.setItem('facet-lands:quality', 'low'));
await page.goto('http://localhost:4173/?seed=polaris&x=399&z=1025&hide&hour=19.6&weather=clear&vd=3', { timeout: 180000 });
await page.waitForFunction(() => window.world?.chunks && window.world.chunks.pendingCount === 0, null, { timeout: 600000, polling: 1000 });
await page.waitForTimeout(3000);
const r = await page.evaluate(async () => {
  const { wildlife, camera, controls } = window.world;
  controls.setMode('walk');
  const p = camera.position;
  // (Clear the ground: only ours.)
  for (const a of wildlife.animals) a.gone = true;
  wildlife.update(0.05, wildlife.ctx);
  const at = (dx, dz) => [p.x + dx, p.z + dz];
  const deer = [0, 1, 2].map((k) => wildlife.spawn('deer', ...at(70 + k * 4, 40 + k * 3)));
  const cougar = wildlife.spawn('cougar', ...at(40, 10));
  const sheep = [0, 1, 2].map((k) => wildlife.spawn('sheep', ...at(-60 - k * 3, 50)));
  const wolves = [0, 1].map((k) => wildlife.spawn('wolf', ...at(-110, 20 + k * 6)));
  for (const a of [cougar, ...wolves]) if (a) (a.hunger = 1), (a.preyWait = 0);
  const log = [];
  let last = '';
  for (let step = 0; step < 1500; step++) {
    wildlife.update(0.1, wildlife.ctx);
    const s = [cougar, ...wolves].map((a) => `${a?.kind}:${a?.chase?.phase ?? '-' + (a?.chaseEnded ?? '')}:${a?.state}${a?.hunting ? '!' : ''}${a?.stalking ? '?' : ''}`).join(' ') + ' | deer ' + deer.filter((d) => d?.alive).length + ' sheep ' + sheep.filter((d) => d?.alive).length;
    if (s !== last) log.push(`${(step / 10).toFixed(1)}s ${s}`), (last = s);
    if (step % 100 === 0) await new Promise((r) => setTimeout(r, 0));
  }
  const look = cougar.chase?.prey ?? deer.find((d) => !d.alive) ?? cougar;
  const yaw = Math.atan2(-(look.x - p.x), -(look.z - p.z));
  controls.euler.set(-0.05, yaw, 0, 'YXZ');
  camera.quaternion.setFromEuler(controls.euler);
  return { log: log.slice(0, 60), spawned: [deer.length, !!cougar, sheep.length, wolves.length] };
});
console.log(r.log.join('\n'));
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}.png` });
console.log('errors', errs);
await browser.close();
