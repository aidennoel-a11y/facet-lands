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
  put('stoneFloor', -6, -12);
  put('stoneFloor', -2, -12);
  put('woodFloor', 2.5, -12);
  put('stoneWall', -6, -14, 0);
  put('stoneWall', -2, -14, 0);
  put('slateRoof', -6, -12);
  put('chimney', -3, -10.5);
  put('campfire', -3, -9.4);
  put('stoneFence', 6, -9, 0);
  put('cellar', 9, -14, 0);
  put('smokingRack', 13, -10);
  put('campfire', 13, -10);
  put('chest', 2.5, -12);
  const fire = st.list.filter((s) => s.type === 'campfire');
  for (const f of fire) { f.fuel = 200; st.light?.(f) ?? (f.lit = true); }
  camera.position.set(p.x + 3, p.y + 3, p.z + 4);
  camera.lookAt(p.x + 2, p.y - 1, p.z - 12);
  window.world.controls.euler.setFromQuaternion(camera.quaternion, 'YXZ');
  return { out, floor: st.floorTop(p.x - 4, p.z - 12 + 0) };
});
console.log(JSON.stringify(res));
await page.waitForTimeout(4000);
await page.screenshot({ path: `${out}.png` });
await browser.close();
