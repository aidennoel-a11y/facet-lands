// The Lost Keep: gone to, looked at; the trophies set in its altar, the gate opening.   node tools/_keep.mjs out [seed]
import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const [out = 'keep', seed = 'polaris'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 560 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
page.on('console', (m) => m.text().startsWith('debug') && console.log(m.text()));
await page.goto(`http://localhost:4173/?seed=${seed}&up=0&vd=1&hide&hour=10&weather=clear`, { timeout: 180000 });
await page.waitForFunction(() => window.world?.chunks && window.world.chunks.pendingCount === 0, null, { timeout: 600000, polling: 1000 });
const k = await page.evaluate(() => {
  const { camera, controls, generator: g, game } = window.world;
  const keep = game.keepAt();
  if (controls.mode === 'walk') document.getElementById('fly')?.click();
  camera.position.set(keep.x, g.getHeight(keep.x, keep.z) + 40, keep.z);
  return { x: Math.round(keep.x), z: Math.round(keep.z), rot: keep.rot };
});
console.log('keep at', JSON.stringify(k));
for (let i = 0; i < 3; i++) { await page.waitForTimeout(4000); await page.waitForFunction(() => window.world.chunks.pendingCount === 0, null, { timeout: 600000, polling: 1000 }); }
// Out before the gate, looking at it.
const look = async () => page.evaluate((k) => {
  const { camera, controls, generator: g } = window.world;
  const ca = Math.cos(k.rot), sa = Math.sin(k.rot), u = -40, v = 8, x = k.x + ca * u + sa * v, z = k.z - sa * u + ca * v;
  camera.position.set(x, g.getHeight(x, z) + 15, z);
  camera.lookAt(k.x, g.getHeight(k.x, k.z) + 9, k.z);
  controls.euler.setFromQuaternion(camera.quaternion, 'YXZ');
}, k);
await look();
await page.waitForTimeout(4000);
await page.screenshot({ path: `${out}-shut.png` });
const res = await page.evaluate(async () => {
  const { game, camera, THREE } = window.world;
  const altar = game.structures.list.find((s) => s.type === 'keepAltar');
  if (!altar) return { altar: false, structures: game.structures.list.map((s) => s.ruinKey).filter(Boolean) };
  const { RELICS } = await import('/src/survival/items.js').catch(() => ({}));
  const ids = ['grizzlyPelt', 'alphaFang', 'paleFur', 'greatAntlers', 'greatHide', 'crocHide', 'lionPelt', 'tigerPelt', 'venomSac', 'boarTusk', 'caveBearPelt', 'broodHeart'];
  // Ten of them first, then the rest.
  const give = (list) => (game.inventory.slots.fill(null), list.forEach((id) => game.inventory.add({ id, count: 1 })));
  const at = new THREE.Vector3(altar.x, altar.y + 0.9, altar.z), from = at.clone().add(new THREE.Vector3(0, 1.0, 2.2));
  const ray = () => ({ origin: from.clone(), direction: at.clone().sub(from).normalize() });
  give(ids.slice(0, 8));
  const r0 = ray(), pk = game.structures.pick(r0.origin, r0.direction, 4);
  console.log('debug', JSON.stringify({ pick: pk?.structure.type, d: pk?.distance, count: game.inventory.count('grizzlyPelt'), mode: game.mode }));
  game.interact(ray());
  const first = { set: altar.offered.length, open: game.keep.open };
  give(ids.slice(8));
  game.interact(ray());
  const heart = game.structures.list.find((s) => s.ruinKey === 'keep:heart');
  return { altar: true, altarUp: +(altar.y - window.world.generator.getHeight(altar.x, altar.z)).toFixed(1), first, then: { set: altar.offered.length, won: game.keep.won, heart: !!heart, items: heart?.contents.slots.filter(Boolean).length }, stones: altar.stones.filter((m) => m.visible).length };
});
console.log(JSON.stringify(res));
await look();
await page.waitForTimeout(3000);
await page.screenshot({ path: `${out}-open.png` });
await browser.close();
