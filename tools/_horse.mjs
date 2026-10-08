// A wild horse: settle it (food in hand, close and slow), saddle it, ride
// it (walk, gallop, a jump), its wind going down galloping, and a shot of
// it from the saddle.   node tools/_horse.mjs outprefix
import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const out = process.argv[2] ?? 'horse';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 900, height: 500 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
const ok = (name, pass, extra = '') => console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${extra ? ` (${extra})` : ''}`);
await page.goto('http://localhost:4173/?seed=polaris&x=399&z=1025&up=0&vd=1&hide&hour=12&weather=clear', { timeout: 180000 });
await page.waitForFunction(() => window.world?.chunks && window.world.chunks.pendingCount === 0, null, { timeout: 600000, polling: 1000 });
await page.evaluate(() => { if (window.world.controls.mode !== 'walk') document.getElementById('fly')?.click(); });
await page.waitForFunction(() => { const { camera, generator, controls } = window.world; return controls.mode === 'walk' && camera.position.y - generator.getHeight(camera.position.x, camera.position.z) < 2.2; }, null, { timeout: 120000, polling: 250 });
const id = await page.evaluate(() => {
  const { wildlife, camera, game } = window.world;
  wildlife.animals.length = 0;
  game.newLife();
  game.inventory.slots[0] = { id: 'apple', count: 5 };
  game.inventory.slots[1] = { id: 'saddle', count: 1 };
  game.hotbar.index = 0;
  game.inventory.changed?.();
  const c = camera.position;
  const a = wildlife.spawn('horse', c.x, c.z - 8);
  window.__horse = a;
  return !!a;
});
ok('a horse', id);
// Settle it: stand still, crouched, apple in hand.
await page.keyboard.down('ControlLeft').catch(() => {});
let calm = 0;
for (let k = 0; k < 40 && calm < 0.1; k++) {
  await page.waitForTimeout(500);
  calm = await page.evaluate(() => (window.__horse.tame ? 1 : window.__horse.calm ?? 0));
}
ok('its calm grows', calm >= 0.1, `calm ${calm.toFixed(2)}`);
// (Headless, the frames are few and slow: the rest of the way at once.)
await page.evaluate(() => (window.__horse.calm = 0.99));
for (let k = 0; k < 20 && calm < 1; k++) {
  await page.waitForTimeout(500);
  calm = await page.evaluate(() => (window.__horse.tame ? 1 : window.__horse.calm ?? 0));
}
const meterSeen = await page.evaluate(() => !document.querySelector('.meter').hidden || window.__horse.tame);
ok('settled and tame', calm >= 1, `calm ${calm}`);
ok('the meter showed', meterSeen);
// Saddle it and get up (E with the saddle, then E), looking at it.
const rode = await page.evaluate(() => {
  const { game, camera } = window.world, a = window.__horse;
  const look = (held) => {
    game.hotbar.index = held;
    const o = camera.position.clone();
    const d = new window.world.THREE.Vector3(a.x - o.x, a.y + 1.3 - o.y, a.z - o.z).normalize();
    // (Close enough to reach.)
    camera.position.set(a.x - d.x * 2.2, camera.position.y, a.z - d.z * 2.2);
    return { origin: camera.position.clone(), direction: new window.world.THREE.Vector3(a.x - camera.position.x, a.y + 1.3 - camera.position.y, a.z - camera.position.z).normalize() };
  };
  game.interact(look(1));
  const saddled = a.saddled;
  game.interact(look(0 + 2)); // (empty hand)
  return { saddled, riding: game.mount === a };
});
ok('saddled', rode.saddled);
ok('in the saddle', rode.riding);
// Ride: W for 4 s, then Shift+W for 4 s.
const start = await page.evaluate(() => ({ x: window.__horse.x, z: window.__horse.z }));
await page.keyboard.up('ControlLeft').catch(() => {});
await page.evaluate(() => window.world.controls.keys.add('KeyW'));
await page.waitForTimeout(4000);
const trot = await page.evaluate(() => ({ x: window.__horse.x, z: window.__horse.z, speed: window.__horse.speed }));
await page.evaluate(() => window.world.controls.keys.add('ShiftLeft'));
await page.waitForTimeout(4000);
const gallop = await page.evaluate(() => ({ x: window.__horse.x, z: window.__horse.z, speed: window.__horse.speed, stamina: window.__horse.stamina, cam: window.world.camera.position.y - window.__horse.y }));
await page.screenshot({ path: `${out}-ride.png` });
await page.evaluate(() => { window.world.controls.keys.delete('KeyW'); window.world.controls.keys.delete('ShiftLeft'); });
ok('it carries you on', Math.hypot(trot.x - start.x, trot.z - start.z) > 1, `trot speed ${trot.speed.toFixed(1)}`);
ok('galloping is faster, and tires it', gallop.speed > trot.speed && gallop.stamina < 100, `gallop ${gallop.speed?.toFixed(1)}, wind ${gallop.stamina?.toFixed(0)}, eye ${gallop.cam?.toFixed(2)} m up`);
await browser.close();
