// What the land costs: ring by ring, its chunks' triangles and memory,
// what the walkable ground keeps and how long asking it takes, and the
// share of the drawing that's the ground.   node tools/terraincost.mjs [seed x z]
import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const [seed = 'polaris', x = '300', z = '-200', quality = 'high'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
// (The quality as if picked on the title screen: here, with no graphics card, it'd pick Low.)
await page.addInitScript((q) => localStorage.setItem('facet-lands:quality', q), quality);
await page.goto(`http://localhost:4173/?seed=${seed}&x=${x}&z=${z}&up=2&hide&hour=11&loadscreen`, { timeout: 180000 });
await page.waitForFunction(() => document.querySelector('.load-screen')?.classList.contains('ls-done'), null, { timeout: 600000, polling: 500 });
await page.waitForFunction(() => window.world.chunks.pendingCount === 0, null, { timeout: 900000, polling: 500 }).catch(() => console.log('(still building)'));
const r = await page.evaluate(() => {
  const { chunks, camera, renderer, scene, groundAt } = window.world;
  const C = chunks.config.chunkSize, lods = chunks.config.lods;
  const bytes = (g) => Object.values(g.attributes).reduce((a, b) => a + b.array.byteLength, 0) + (g.index?.array.byteLength ?? 0);
  const rows = lods.map((l, i) => ({ lod: i, res: C / l.resolution, chunks: 0, tris: 0, gpuMB: 0, physMB: 0 }));
  for (const c of chunks.chunks.values()) {
    const row = rows[c.lod];
    row.chunks++;
    row.tris += c.triangles;
    if (!c.merged) row.gpuMB += bytes(c.mesh.geometry) / 1e6;
    const h = c.terrain.heights;
    row.physMB += (h.gridX.byteLength + h.gridY.byteLength + h.gridZ.byteLength) / 1e6;
  }
  let tileMB = 0;
  for (const t of chunks.tiles.values()) if (t.mesh) tileMB += bytes(t.mesh.geometry) / 1e6;
  // The walkable ground: asked where you stand, and at random spots round you.
  const p = camera.position;
  let t = performance.now();
  for (let k = 0; k < 2000; k++) groundAt(p.x + Math.sin(k) * 3, p.y - 1.6, p.z + Math.cos(k * 1.3) * 3);
  const near = (performance.now() - t) / 2000;
  t = performance.now();
  for (let k = 0; k < 2000; k++) chunks.groundHeightAt(p.x + Math.sin(k) * 60, p.z + Math.cos(k * 1.3) * 60);
  const animal = (performance.now() - t) / 2000;
  // Drawn: everything (twice: the second without the shadow map's first fill), and of it the ground:
  // the chunks' own ground near, and the tiles far, as they're drawn now.
  renderer.render(scene, camera);
  renderer.render(scene, camera);
  const all = { tris: renderer.info.render.triangles, calls: renderer.info.render.calls };
  const ground = { tris: 0, calls: 0, shadowCasters: 0 };
  for (const c of chunks.chunks.values()) {
    if (c.merged || !c.group.visible || !c.mesh.visible) continue;
    ground.tris += c.triangles;
    ground.calls++;
    if (c.mesh.castShadow) ground.shadowCasters++;
  }
  for (const t of chunks.tiles.values()) if (t.mesh?.visible) (ground.calls++, (ground.tris += t.mesh.geometry.attributes.position.count / 3));
  return { rows, tileMB, near, animal, all, ground, total: chunks.chunks.size };
});
const f = (v, d = 1) => v.toFixed(d);
console.log('level  triangle  chunks  triangles   GPU MB  kept for walking MB');
for (const w of r.rows) if (w.chunks) console.log(`  ${w.lod}      ${f(w.res, 0).padStart(3)} m  ${String(w.chunks).padStart(5)}  ${String(w.tris).padStart(10)}  ${f(w.gpuMB).padStart(7)}  ${f(w.physMB).padStart(7)}`);
console.log(`  far tiles (merged ground): ${f(r.tileMB)} MB`);
console.log(`walkable ground: ${f(r.near * 1000, 1)} µs to ask where you stand (with caves, rocks, ice), ${f(r.animal * 1000, 1)} µs for an animal's spot`);
console.log(`drawn (quality ${quality}): everything ${r.all.tris} triangles in ${r.all.calls} draw calls (shadows included); the ground ${Math.round(r.ground.tris)} triangles in ${r.ground.calls} calls, ${r.ground.shadowCasters} of its meshes casting shadows too`);
await browser.close();
