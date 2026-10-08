// What a frame draws: draw calls and triangles, the main pass and the
// shadow pass apart, and what casts shadows, by kind of object.
//   node tools/_drawstats.mjs [quality seed x z]
import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const [quality = 'high', seed = 'polaris', x = '300', z = '-200'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.addInitScript((q) => localStorage.setItem('facet-lands:quality', q), quality);
await page.goto(`http://localhost:4173/?seed=${seed}&x=${x}&z=${z}&up=0&hour=13&weather=clear`, { timeout: 180000 });
await page.waitForFunction(() => window.world?.chunks && window.world.chunks.pendingCount === 0, null, { timeout: 900000, polling: 1000 });
await page.waitForTimeout(3000);
const r = await page.evaluate(() => {
  const { renderer, scene, camera } = window.world;
  const info = renderer.info;
  info.autoReset = false;
  const pass = (shadows) => {
    renderer.shadowMap.autoUpdate = shadows;
    renderer.shadowMap.needsUpdate = shadows;
    info.reset();
    renderer.render(scene, camera);
    return { calls: info.render.calls, tris: info.render.triangles };
  };
  const both = pass(true), main = pass(false);
  renderer.shadowMap.autoUpdate = true;
  info.autoReset = true;
  // Shadow casters, by name, and instance counts.
  const casters = {};
  let visible = 0;
  scene.traverseVisible((o) => {
    if (!o.isMesh) return;
    visible++;
    if (!o.castShadow) return;
    const k = (o.name || o.parent?.name || 'mesh').replace(/[0-9,-]+/g, '').trim().slice(0, 24);
    const c = (casters[k] ??= { meshes: 0, instances: 0 });
    c.meshes++;
    c.instances += o.isInstancedMesh ? o.count : 1;
  });
  const lights = [];
  scene.traverse((o) => o.isLight && o.castShadow && lights.push({ type: o.type, map: o.shadow.mapSize.x }));
  return { both, main, shadowPass: { calls: both.calls - main.calls, tris: both.tris - main.tris }, visibleMeshes: visible, pixelRatio: renderer.getPixelRatio(), lights,
    topCasters: Object.entries(casters).sort((a, b) => b[1].meshes - a[1].meshes).slice(0, 12) };
});
console.log(JSON.stringify(r, null, 1));
await browser.close();
