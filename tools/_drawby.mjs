// What's drawn where you are, by mesh name: triangles and draw calls, and the lights.   node tools/_drawby.mjs seed x z y [vd]
import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const [seed = 'polaris', x = '0', z = '0', y = '-60', vd = ''] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto(`http://localhost:4173/?seed=${seed}&x=${x}&z=${z}&y=${y}&hide&hour=15${vd ? '&vd=' + vd : ''}&weather=clear`, { timeout: 180000 });
await page.waitForFunction(() => window.world?.chunks && window.world.chunks.pendingCount === 0, null, { timeout: 900000, polling: 1000 });
for (let k = 0; k < 240; k++) {
  if (k > 30 && k % 10 === 0) { const st = await page.evaluate(() => { const c = window.world.generator.caves.cache; let r = 0, a = 0; for (const e of c.values()) { a++; if (e.ready) r++; } return [r, a]; }); if (st[1] > 20 && st[0] === st[1]) break; } await page.evaluate((y) => { window.world.camera.position.y = +y; }, y); await page.waitForTimeout(500); }
console.log(await page.evaluate(() => {
  const { scene, renderer, camera } = window.world;
  const by = new Map();
  scene.traverseVisible((m) => {
    if (!(m.isMesh || m.isPoints || m.isLine)) return;
    const g = m.geometry; const n = (g.index ? g.index.count : g.attributes.position?.count ?? 0) / 3;
    let p = m, path = m.name || '?';
    while (p.parent && p.parent !== scene) p = p.parent;
    const key = `${p.name || p.type}/${m.name || m.type}`;
    const r = by.get(key) ?? { tris: 0, draws: 0 };
    r.tris += n * (m.isInstancedMesh ? m.count : 1); r.draws++;
    by.set(key, r);
  });
  const rows = [...by].sort((a, b) => b[1].tris - a[1].tris).slice(0, 30).map(([k, r]) => `${k} ${Math.round(r.tris / 1000)}k tris, ${r.draws} meshes`);
  let lights = 0; scene.traverse((o) => { if (o.isLight && o.visible && o.intensity > 0) lights++; });
  return JSON.stringify({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, lights, under: camera.position.y, underground: window.world.chunks.underground, chunks: window.world.chunks.chunks?.size }, null, 0) + '\n' + rows.join('\n');
}));
await browser.close();
