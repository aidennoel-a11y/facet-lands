// A wildfire set in the grass, run on a while: how far it spreads, what it costs, and how it looks.   node tools/_wildfire.mjs out [x z]
import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const [out = 'wildfire', x = '399', z = '1025'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 560 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto(`http://localhost:4173/?seed=polaris&x=${x}&z=${z}&up=40&vd=1&hide&hour=17&weather=clear`, { timeout: 180000 });
await page.waitForFunction(() => window.world?.chunks && window.world.chunks.pendingCount === 0, null, { timeout: 600000, polling: 1000 });
const r = await page.evaluate(() => {
  const { camera, fires, generator: g, THREE } = window.world, p = camera.position;
  const x = p.x, z = p.z - 40, ground = (px, pz) => g.getBaseHeight(px, pz);
  const fuel = fires.fuelAt(x, z);
  window.world.game.felling.day = 10;
  fires.ignite(x, ground(x, z), z, ground);
  const ctx = { time: 0, day: 10, wind: { x: 3, z: -2 }, rain: 0, light: new THREE.Color(1, 1, 1), night: 0, camera, sound: null, pan: () => 0, ground };
  const log = [];
  let worst = 0;
  for (let s = 0; s < 480; s++) {
    ctx.time += 0.25;
    const t0 = performance.now();
    fires.update(0.25, ctx);
    worst = Math.max(worst, performance.now() - t0);
    if (s % 80 === 79) {
      let burnt = 0;
      for (const c of fires.cells.values()) if (c.state === 2) burnt++;
      log.push({ t: ctx.time, burning: fires.burning.size, burnt });
    }
  }
  camera.position.set(x + 60, ground(x, z) + 45, z + 60);
  camera.lookAt(x, ground(x, z), z);
  window.world.controls.euler.setFromQuaternion(camera.quaternion, 'YXZ');
  const f = window.world.game.felling;
  const snags = f.stumps.filter((s) => s.burnt).length, removed = window.world.trees.removed.size;
  f.regrow(10 + 3.5);
  const mid = { snagMeshes: f.stumps.filter((s) => s.burnt && s.mesh).length, growing: f.stumps.filter((s) => s.burnt).length };
  f.regrow(10 + 9);
  return { fuel, log, worstMs: worst.toFixed(1), freeFlames: fires.freeFlames.length, snags, removed, mid, after: { left: f.stumps.filter((s) => s.burnt).length, removed: window.world.trees.removed.size } };
});
console.log(JSON.stringify(r));
await page.waitForTimeout(3000);
await page.screenshot({ path: `${out}.png` });
await browser.close();
