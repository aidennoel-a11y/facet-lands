// What's drawn underground: the visible top-level objects and their triangles.   node tools/_underdraw.mjs x z y
import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const [x = '2840', z = '1872', y = '-60.5'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
await page.goto(`http://localhost:4173/?seed=polaris&x=${x}&z=${z}&y=${y}&hide&hour=12&vd=3&weather=clear`, { timeout: 180000 });
await page.waitForFunction(() => window.world?.chunks && window.world.chunks.pendingCount === 0, null, { timeout: 600000, polling: 1000 });
await page.waitForTimeout(8000);
console.log(await page.evaluate(() => {
  const { scene, renderer } = window.world;
  const rows = [];
  for (const o of scene.children) {
    let tris = 0, vis = o.visible;
    o.traverseVisible((m) => { if (m.isMesh || m.isPoints) { const g = m.geometry; const n = (g.index ? g.index.count : g.attributes.position?.count ?? 0) / 3; tris += n * (m.isInstancedMesh ? m.count : 1); } });
    rows.push(`${o.name || o.type}${vis ? '' : '(hidden)'} ${Math.round(tris)}`);
  }
  return JSON.stringify({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, rows: rows.slice(0, 200), under: window.world.camera.position.y });
}));
await browser.close();
