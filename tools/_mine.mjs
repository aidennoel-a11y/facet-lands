// An old mine: into its main gallery (at the given mine's first segment, a
// third of the way along), looking down it: timbers, rails, the walls.
//   node tools/_mine.mjs out x z
import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const out = process.argv[2] ?? 'mine';
const X = Number(process.argv[3] ?? 452), Z = Number(process.argv[4] ?? -91);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 900, height: 560 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message + ' ' + (e.stack ?? '').split('\n').slice(1, 3).join(' ')));
await page.addInitScript(() => localStorage.setItem('facet-lands:quality', 'low'));
await page.goto(`http://localhost:4173/?seed=polaris&x=${X}&z=${Z}&hide&hour=14&weather=clear&vd=3`, { timeout: 180000 });
await page.waitForFunction(() => window.world?.chunks && window.world.chunks.pendingCount === 0, null, { timeout: 600000, polling: 1000 });
await page.waitForTimeout(4000);
const r = await page.evaluate(async ([X, Z]) => {
  const { camera, controls, generator, mineProps, game } = window.world;
  const f = generator.caves.field;
  const m = f.minesNear(X - 50, Z - 50, X + 50, Z + 50)[0];
  if (!m) return { none: true };
  const q = m.segments[0], t = 0.35;
  const x = q.ax + (q.bx - q.ax) * t, z = q.az + (q.bz - q.az) * t, y = q.ay + (q.by - q.ay) * t;
  controls.setMode('fly');
  camera.position.set(x, y + 1.7, z);
  const yaw = Math.atan2(-(q.bx - q.ax), -(q.bz - q.az));
  controls.euler.set(-0.05, yaw, 0, 'YXZ');
  camera.quaternion.setFromEuler(controls.euler);
  await new Promise((r) => setTimeout(r, 15000));
  return { id: m.id, inside: +f.mineAt(m, x, y + 1.7, z).toFixed(2), posts: mineProps.posts.count, rails: mineProps.rails.count, chests: mineProps.chests.length, seen: [...(game.minesSeen ?? [])] };
}, [X, Z]);
console.log(JSON.stringify(r));
await page.screenshot({ path: `${out}.png` });
console.log('errors', errs);
await browser.close();
