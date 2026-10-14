// The landmarks: to each of a few (the nearest of their kind), a shot from
// a little way off and above; that it's found, and the map marks it.
//   node tools/_landmarks.mjs out kind1,kind2,...
import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const out = process.argv[2] ?? 'lm';
// (kind, or kind:x:z for one known to be there.)
const kinds = (process.argv[3] ?? 'boneField,standingStones,greatSinkhole,elderTree').split(',');
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 900, height: 560 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message + ' ' + (e.stack ?? '').split('\n').slice(1, 3).join(' ')));
await page.addInitScript(() => localStorage.setItem('facet-lands:quality', 'low'));
for (const spec of kinds) {
  const [kind, kx, kz] = spec.split(':');
  const cx = kx ? Number(kx) : 399, cz = kz ? Number(kz) : 1025;
  await page.goto(`http://localhost:4173/?seed=polaris&x=${cx}&z=${cz}&hide&hour=14&weather=clear&vd=3&season=1.5`, { timeout: 180000 });
  await page.waitForFunction(() => window.world?.chunks && window.world.chunks.pendingCount === 0, null, { timeout: 600000, polling: 1000 });
  const site = await page.evaluate(([kind, cx, cz, exact]) => {
    const g = window.world.generator, all = g.landmarks.near(cx, cz, exact ? 200 : 4000).filter((s) => s.kind === kind);
    all.sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz));
    return all[0] ?? null;
  }, [kind, cx, cz, !!kx]);
  if (!site) { console.log(kind, 'none near'); continue; }
  const dist = { greatSinkhole: 55, crystalLake: 60, sunkenForest: 60, eagleSpire: 70, elderTree: 50, stoneArch: 50 }[kind] ?? 30;
  await page.goto(`http://localhost:4173/?seed=polaris&x=${Math.round(site.x + dist)}&z=${Math.round(site.z + dist * 0.6)}&hide&hour=14&weather=clear&vd=3&season=1.5`, { timeout: 180000 });
  await page.waitForFunction(() => window.world?.chunks && window.world.chunks.pendingCount === 0, null, { timeout: 600000, polling: 1000 });
  await page.waitForTimeout(6000);
  const r = await page.evaluate(async (site) => {
    const { camera, controls, landmarks, game, generator } = window.world;
    controls.setMode('fly');
    const gy = generator.getHeight(site.x, site.z);
    const up = site.kind === 'greatSinkhole' ? 40 : site.kind === 'eagleSpire' ? 25 : 14;
    camera.position.y = Math.max(camera.position.y, gy + up);
    const yaw = Math.atan2(-(site.x - camera.position.x), -(site.z - camera.position.z));
    const pitch = -Math.atan2(camera.position.y - gy - 4, Math.hypot(site.x - camera.position.x, site.z - camera.position.z));
    controls.euler.set(pitch, yaw, 0, 'YXZ');
    camera.quaternion.setFromEuler(controls.euler);
    for (let k = 0; k < 40 && !landmarks.built.has(site.key); k++) await new Promise((r) => setTimeout(r, 500));
    const b = landmarks.built.get(site.key);
    return { built: !!b, solids: b?.solids.length, water: b?.waters?.[0] ? +b.waters[0].level.toFixed(1) : null, ground: +gy.toFixed(1), rim: +generator.getHeight(site.x + 40, site.z).toFixed(1) };
  }, site);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}-${kind}.png` });
  // Walk up to it: found?
  const f = await page.evaluate(async (site) => {
    const { camera, controls, game, generator } = window.world;
    controls.setMode('walk');
    camera.position.set(site.x + 18, generator.getHeight(site.x + 18, site.z) + 2, site.z);
    await new Promise((r) => setTimeout(r, 4000));
    return { found: game.landmarksFound.has(site.key), map: game.landmarksForMap(site.x, site.z, 500).length };
  }, site);
  console.log(kind, Math.round(site.x), Math.round(site.z), JSON.stringify(r), JSON.stringify(f));
}
console.log('errors', errs);
await browser.close();
