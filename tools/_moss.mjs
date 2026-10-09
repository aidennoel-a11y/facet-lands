// A close look at a mossy trunk's north side.   node tools/_moss.mjs out.png [seed x z]
import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const [out = 'moss.png', seed = 'polaris', x = '300', z = '-200'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto(`http://localhost:4173/?seed=${seed}&x=${x}&z=${z}&up=25&hide&hour=10&vd=2&weather=clear`, { timeout: 180000 });
await page.waitForFunction(() => window.world?.chunks && window.world.chunks.pendingCount === 0, null, { timeout: 600000, polling: 1000 });
await page.waitForTimeout(3000);
const found = await page.evaluate(() => {
  const w = window.world, T = w.THREE, cam = w.camera, m = new T.Matrix4(), p = new T.Vector3();
  const fr = (v) => v - Math.floor(v);
  let best = null;
  w.scene.traverse((o) => {
    if (!o.isInstancedMesh || !o.geometry.attributes.aCrown) return;
    for (let i = 0; i < o.count; i++) {
      o.getMatrixAt(i, m); p.setFromMatrixPosition(m).applyMatrix4(o.matrixWorld);
      const r = fr(Math.sin(p.x * 12.9898 + p.z * 78.233) * 43758.5453);
      if (fr(r * 13.7) < 0.9) continue;
      const d = Math.hypot(p.x - cam.position.x, p.z - cam.position.z);
      if (/^(oak|maple|beech|birch|aspen|elm|ash|chestnut)$/i.test(o.name) && (!best || d < best.d)) best = { d, x: p.x, y: p.y, z: p.z, name: o.name, s: m.getMaxScaleOnAxis() };
    }
  });
  if (!best) return null;
  // Stand to the north-east, looking back at the trunk.
  cam.position.set(best.x + 2.6, best.y + 0.9, best.z - 2.6);
  w.controls.euler.set(-0.1, Math.atan2(2.6, -2.6), 0); cam.quaternion.setFromEuler(w.controls.euler);
  return best;
});
console.log(found);
await page.waitForTimeout(4000);
await page.evaluate(() => { const w = window.world, cam = w.camera; return [cam.position.toArray(), window.world.trees && 0]; }).then(console.log);
await page.screenshot({ path: out });
await browser.close();
