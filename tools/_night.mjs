// Night in the woods with a torch: owls about, eyes shining.   node tools/_night.mjs out [seed x z]
import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const [out = 'night', seed = 't8d50n', x = '1600', z = '360'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.log('ERR', e.message, (e.stack ?? '').split('\n').slice(1, 3).join(' | ')));
await page.goto(`http://localhost:4173/?seed=${seed}&x=${x}&z=${z}&up=0&hide&hour=23&weather=clear`, { timeout: 180000 });
await page.waitForFunction(() => window.world?.chunks && window.world.chunks.pendingCount === 0, null, { timeout: 600000, polling: 1000 });
await page.evaluate(() => {
  const { game, controls } = window.world;
  if (controls.mode !== 'walk') document.getElementById('fly')?.click();
  game.inventory.slots[game.hotbar.index] = { id: 'torch', count: 1 };
  game.inventory.changed();
});
await page.waitForTimeout(25000);
await page.evaluate(() => {
  const { wildlife, camera, controls, generator: g } = window.world, p = camera.position;
  const a = wildlife.animals.find((a) => a.alive && a.kind !== 'crocodile' && wildlife.rigs[a.kind]?.meshes.head?.geometry.userData.eye) ?? wildlife.animals.find((a) => a.alive && wildlife.rigs[a.kind]?.meshes.head?.geometry.userData.eye);
  const yaw = controls.euler.y, fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  a.x = p.x + fx * 12; a.z = p.z + fz * 12; a.y = g.getHeight(a.x, a.z);
  a.heading = Math.atan2(p.x - a.x, p.z - a.z);
  a.state = 'idle'; a.speed = 0; a.hunting = false; a.fleeing = false; a.frozenFor = 99;
  window.__eyed = a.kind;
});
await page.waitForTimeout(4000);
const r = await page.evaluate(() => {
  const { wildlife, camera } = window.world, p = camera.position;
  const owls = wildlife.animals.filter((a) => a.kind === 'owl');
  // A deer out in front, looking this way: its eyes should shine.
  const deer = wildlife.animals.filter((a) => a.alive && wildlife.rigs[a.kind]?.meshes.head?.geometry.userData.eye).slice(0, 3).map((a) => a.kind);
  const w = window.world.wildlife, a = w.animals.find((x) => x.kind === window.__eyed && Math.hypot(x.x - p.x, x.z - p.z) < 20);
  const e = a?.hm?.elements, d = a ? Math.hypot(a.x - p.x, a.z - p.z) : 0;
  const dbg = { eyeLight: w.ctx?.eyeLight, ctxNight: w.ctx?.night, hm: !!a?.hm, look: e ? (e[8] * (p.x - a.x) + e[10] * (p.z - a.z)) / (Math.hypot(e[8], e[9], e[10]) * d) : null, hidden: w.hidden, d };
  return { dbg, placed: window.__eyed, night: window.world.game.lastCtx?.night, owls: owls.map((o) => `${o.state}@${Math.round(Math.hypot(o.x - p.x, o.z - p.z))}m`), shine: wildlife.shineMesh.count, eyedKinds: deer, animals: wildlife.animals.length };
});
console.log(JSON.stringify(r));
await page.screenshot({ path: `${out}.png` });
await browser.close();
