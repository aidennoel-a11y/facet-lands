// The four building sets, a little house of each (floor, walls, stairs up,
// a floor a storey up, roof), the two new beds; then a walk up a flight.   node tools/_buildsets.mjs out
import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const out = process.argv[2] ?? 'sets';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 600 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto('http://localhost:4173/?seed=polaris&x=399&z=1025&up=0&vd=1&hide&hour=10&weather=clear', { timeout: 180000 });
await page.waitForFunction(() => window.world?.chunks && window.world.chunks.pendingCount === 0, null, { timeout: 600000, polling: 1000 });
const res = await page.evaluate(() => {
  const { game, camera, THREE } = window.world, st = game.structures, p = camera.position.clone();
  const ground = (x, z) => window.world.chunks.groundHeightAt(x, z);
  const water = () => null;
  const log = [];
  const put = (type, x, z, rot = 0, y = null) => {
    const plan = st.plan(type, new THREE.Vector3(x, y ?? ground(x, z) + 0.5, z), rot, ground, water);
    log.push(`${type}:${plan.ok ? 'ok' : plan.why}${plan.upper ? ':upper' : ''}`);
    return st.build({ ...plan, ok: true });
  };
  const SETS = [
    ['logFloor', 'logWall', 'logStairs', 'logRoof'],
    ['woodFloor', 'plankWall', 'plankStairs', 'shingleRoof'],
    ['stoneFloor', 'stoneWall', 'stoneStairs', 'slateRoof'],
    ['cutStoneFloor', 'cutStoneWall', 'cutStairs', 'tileRoof'],
  ];
  const stairs = [];
  SETS.forEach(([floor, wall, stair, roof], k) => {
    const cx = p.x - 15 + k * 10, cz = p.z - 16;
    const f = put(floor, cx, cz, 0);
    put(floor, cx, cz + 4.1, 0); // (a second floor square beside it)
    put(wall, cx, cz - 2.1, 0); // (back wall, on the floor's edge)
    put(wall, cx - 2.1, cz, Math.PI / 2);
    put(wall, cx + 2.1, cz, Math.PI / 2);
    // A floor up a storey: aimed at the top of the walls.
    put(floor, cx, cz, 0, f.y + 3.4);
    // Stairs on the second square, up to it.
    stairs.push(put(stair, cx, cz + 4.1, Math.PI));
    put(roof, cx, cz, 0, f.y + 3.4);
  });
  put('bedroll', p.x - 4, p.z - 6, 0.3);
  put('fancyBed', p.x + 1, p.z - 6, 0);
  camera.position.set(p.x + 2, ground(p.x, p.z) + 7, p.z + 8);
  camera.lookAt(p.x - 2, ground(p.x, p.z) + 1, p.z - 16);
  window.world.controls.euler.setFromQuaternion(camera.quaternion, 'YXZ');
  window.__stairs = stairs.map((s) => ({ x: s.x, y: s.y, z: s.z, rot: s.rot, type: s.type }));
  return { log, stairs: window.__stairs };
});
console.log(JSON.stringify(res.log));
await page.waitForTimeout(5000);
await page.screenshot({ path: `${out}.png` });
// Up a flight: stand at its foot, walk on.
const walk = await page.evaluate(async () => {
  const { camera, controls, game } = window.world, s = window.__stairs[0];
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  if (controls.mode !== 'walk') document.getElementById('fly')?.click();
  const bx = Math.sin(s.rot), bz = Math.cos(s.rot);
  // (Its foot at -z in its own frame: 2 m back from the middle, then a step more.)
  camera.position.set(s.x - bx * 2.8, s.y + controls.eyeHeight + 0.1, s.z - bz * 2.8);
  controls.euler.set(0, Math.atan2(-bx, -bz), 0, 'YXZ');
  camera.quaternion.setFromEuler(controls.euler);
  const y0 = camera.position.y - controls.eyeHeight;
  controls.keys.add('KeyW');
  const ys = [];
  for (let k = 0; k < 12; k++) { await wait(700); ys.push(+(camera.position.y - controls.eyeHeight - s.y).toFixed(2)); }
  controls.keys.delete('KeyW');
  return { start: +(y0 - s.y).toFixed(2), heights: ys, floorAtTop: game.structures.floorTop(s.x + bx * 1.9, s.z + bz * 1.9) - s.y };
});
console.log('walk', JSON.stringify(walk));
await browser.close();
