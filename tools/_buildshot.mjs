// The things to build, set down in a row and looked at.   node tools/_buildshot.mjs out
import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const out = process.argv[2] ?? 'build';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 560 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto('http://localhost:4173/?seed=polaris&x=399&z=1025&y=16.4&up=0&vd=1&hide&hour=10&weather=clear', { timeout: 180000 });
await page.waitForFunction(() => window.world?.chunks && window.world.chunks.pendingCount === 0, null, { timeout: 600000, polling: 1000 });
const res = await page.evaluate(() => {
  const { game, camera, groundAt, THREE } = window.world, st = game.structures, p = camera.position;
  const ground = (x, z) => window.world.chunks.groundHeightAt(x, z);
  const water = () => null;
  const out = [];
  const put = (type, dx, dz, rot = 0) => {
    const plan = st.plan(type, new THREE.Vector3(p.x + dx, 0, p.z + dz), rot, ground, water);
    out.push([type, plan.ok, plan.why]);
    st.build({ ...plan, ok: true });
  };
  put('stoneFloor', -6, -12, 0);
  put('woodFloor', -2, -12, 0);
  // (Walls dropped near the floors' edges: they should snap on.)
  put('stoneWall', -6.3, -14.2, 0);
  put('stoneWindow', -2.2, -14.1, 0);
  put('woodWindow', -8.2, -12.3, Math.PI / 2);
  put('wall', 0.2, -11.7, Math.PI / 2);
  put('slateRoof', -6, -12, 0);
  put('roof', -2.2, -11.8, 0);
  put('chimney', 4, -9);
  put('campfire', 4, -7.9);
  put('stoneFence', 7, -9, 0);
  const fire = st.list.filter((s) => s.type === 'campfire');
  for (const f of fire) { f.fuel = 200; st.light?.(f) ?? (f.lit = true); }
  camera.position.set(p.x + 2, p.y + 4, p.z + 2);
  camera.lookAt(p.x - 4, p.y, p.z - 12);
  window.world.controls.euler.setFromQuaternion(camera.quaternion, 'YXZ');
  return { out: out.map((o) => o.join(':')), list: st.list.map((s) => `${s.type}@${(s.x - p.x).toFixed(1)},${(s.z - p.z).toFixed(1)},${s.y.toFixed(1)} r${s.rot.toFixed(2)}`) };
});
console.log(JSON.stringify(res));
await page.waitForTimeout(4000);
await page.screenshot({ path: `${out}.png` });
await browser.close();
