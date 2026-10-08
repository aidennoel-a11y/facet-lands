// The far trees: shots round a spot (High quality), and how many trees
// stand on a chunk near (full trees) and far (far trees), per kind of country.
//   node tools/_fartrees.mjs outprefix seed x z [up]
import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const [out = 'far', seed = 'qklsht', x = '-394', z = '-7905', up = '2'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 560 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.addInitScript(() => localStorage.setItem('facet-lands:quality', 'high'));
await page.goto(`http://localhost:4173/?seed=${seed}&x=${x}&z=${z}&up=${up}&pitch=-0.12&hide&hour=14&loadscreen`, { timeout: 180000 });
await page.waitForFunction(() => document.querySelector('.load-screen')?.classList.contains('ls-done'), null, { timeout: 900000, polling: 500 });
await page.waitForFunction(() => window.world.chunks.pendingCount === 0, null, { timeout: 1500000, polling: 1000 }).catch(() => console.log('(still building)'));
await page.waitForTimeout(3000);
console.log(JSON.stringify(await page.evaluate(() => {
  const { chunks } = window.world, by = {};
  for (const c of chunks.chunks.values()) {
    let n = 0;
    for (const { layer, object } of c.layerObjects) if (layer.name === 'trees' || layer.name === 'farTrees') n += object.userData.count ?? 0;
    const k = c.lod <= 1 ? 'near' : `lod${c.lod}`;
    (by[k] ??= []).push(n);
  }
  return Object.fromEntries(Object.entries(by).map(([k, v]) => [k, { chunks: v.length, avg: Math.round(v.reduce((a, b) => a + b, 0) / v.length), empty: v.filter((n) => n === 0).length }]));
})));
for (const yaw of [0, 1.57, 3.14, 4.71]) {
  await page.evaluate((yaw) => { const { controls, camera } = window.world; controls.euler.set(-0.12, yaw, 0, 'YXZ'); camera.quaternion.setFromEuler(controls.euler); }, yaw);
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${out}-${yaw}.png`, timeout: 300000 });
}
await browser.close();
