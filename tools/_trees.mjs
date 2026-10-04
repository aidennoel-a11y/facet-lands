import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const [seed, x, z] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
await page.goto(`http://localhost:4173/?seed=${seed}&x=${x}&z=${z}&vd=2&hide&hour=12`, { timeout: 180000 });
await page.waitForFunction(() => window.world?.trees?.crowns?.size > 0, null, { timeout: 200000 });
await page.waitForTimeout(15000);
console.log(await page.evaluate(([x, z]) => {
  const w = window.world, g = w.generator, out = {}, C = w.WORLD.chunkSize;
  w.scene.traverse((o) => {
    const pl = o.userData?.placed;
    if (!pl || o.userData.cx === undefined) return;
    for (const [type, list] of Object.entries(pl)) for (const t of list) {
      const wx = o.userData.cx * C + t.x, wz = o.userData.cz * C + t.z;
      if (Math.hypot(wx - x, wz - z) > 80) continue;
      const b = g.pickBiome(wx, wz, 0.5).id;
      out[`${b}:${type}`] = (out[`${b}:${type}`] ?? 0) + 1;
    }
  });
  const bw = g.getBiomeWeights(x, z, {});
  return JSON.stringify({ trees: out, weights: Object.fromEntries(Object.entries(bw).filter(([, v]) => v > 0.01).map(([k, v]) => [k, +v.toFixed(2)])) });
}, [+x, +z]));
await browser.close();
