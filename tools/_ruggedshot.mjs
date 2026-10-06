// Far rugged land (mountains, cliffs) in finer detail, or not (&norugged):
// a shot from (x, z) looking `yaw`, and how much finer, at what cost.
//   node tools/_ruggedshot.mjs out.png x z yaw [extra query] [seed]
import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const [out = 'rugged.png', x = '6000', z = '6000', yaw = '-1.57', extra = '', seed = 'polaris'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 900, height: 500 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.addInitScript(() => localStorage.setItem('facet-lands:quality', 'high'));
await page.goto(`http://localhost:4173/?seed=${seed}&x=${x}&z=${z}&up=6&yaw=${yaw}&pitch=0.06&hide&hour=10${extra}&loadscreen`, { timeout: 180000 });
await page.waitForFunction(() => document.querySelector('.load-screen')?.classList.contains('ls-done'), null, { timeout: 900000, polling: 500 });
await page.waitForFunction(() => window.world.chunks.pendingCount === 0, null, { timeout: 1500000, polling: 1000 }).catch(() => console.log('(still building)'));
await page.waitForTimeout(3000);
const r = await page.evaluate(() => {
  const { chunks } = window.world;
  let tris = 0, finer = 0, extraTris = 0;
  const lv = [0, 0, 0];
  for (const c of chunks.chunks.values()) {
    tris += c.triangles;
    const base = chunks.config.lods[c.lod].resolution;
    if (c.resolution > base) (finer++, (extraTris += c.triangles - c.triangles * (base / c.resolution) ** 2));
  }
  for (const v of chunks.rugged.values()) lv[v]++;
  return { chunks: chunks.chunks.size, tris, finer, extraTris: Math.round(extraTris), rugged: lv };
});
console.log(JSON.stringify(r));
await page.screenshot({ path: out, timeout: 300000 });
await browser.close();
