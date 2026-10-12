// A dug plot and a patch of cut grass, looked at.   node tools/_farmshot.mjs out
import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const out = process.argv[2] ?? 'farm';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 560 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto('http://localhost:4173/?seed=polaris&x=-700&z=300&up=0&vd=1&hide&hour=11&weather=clear', { timeout: 180000 });
await page.waitForFunction(() => window.world?.chunks && window.world.chunks.pendingCount === 0, null, { timeout: 600000, polling: 1000 });
console.log(await page.evaluate(() => {
  const { game, camera, THREE } = window.world, st = game.structures, p = camera.position;
  const ground = (x, z) => window.world.chunks.groundHeightAt(x, z);
  for (const [dx, dz] of [[-2, -8], [0.4, -8]]) {
    const plan = st.plan('plot', new THREE.Vector3(p.x + dx, 0, p.z + dz), 0, ground, () => null);
    st.build({ ...plan, ok: true });
  }
  game.cutGrass(p.x + 4, p.z - 7, 1.5);
  game.cutGrass(p.x + 5.5, p.z - 7.5, 1.5);
  camera.position.set(p.x + 1, ground(p.x, p.z) + 3.2, p.z - 1);
  camera.lookAt(p.x + 1.5, ground(p.x, p.z - 8), p.z - 8);
  window.world.controls.euler.setFromQuaternion(camera.quaternion, 'YXZ');
  return JSON.stringify(window.world.generator.getBiome(p.x, p.z));
}));
await page.waitForTimeout(6000);
await page.screenshot({ path: `${out}.png` });
await browser.close();
