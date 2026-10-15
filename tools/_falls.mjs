// The Cascades' falls: a shot of each, from out in front of the cliff.
//   node tools/_falls.mjs out x:z:dx:dz:drop[:dist] ...  (a drop's lip, the way it faces, its height)
import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const out = process.argv[2] ?? 'falls';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 900, height: 560 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message + ' ' + (e.stack ?? '').split('\n').slice(1, 3).join(' ')));
await page.addInitScript(() => localStorage.setItem('facet-lands:quality', 'low'));
let n = 0;
for (const spec of process.argv.slice(3)) {
  const [x, z, dx, dz, drop, dist0, up = 0] = spec.split(':').map(Number);
  const dist = dist0 || 30 + drop * 0.8;
  const cx = x + dx * dist - dz * dist * 0.35, cz = z + dz * dist + dx * dist * 0.35;
  await page.goto(`http://localhost:4173/?seed=polaris&x=${Math.round(cx)}&z=${Math.round(cz)}&hide&hour=14&weather=clear&vd=3&season=0.5`, { timeout: 180000 });
  await page.waitForFunction(() => window.world?.chunks && window.world.chunks.pendingCount === 0, null, { timeout: 600000, polling: 1000 });
  await page.waitForTimeout(5000);
  const r = await page.evaluate(async ([x, z, dx, dz, drop, cx, cz, up]) => {
    const { camera, controls, landmarks, generator } = window.world;
    controls.setMode('fly');
    const top = generator.getHeight(x - dx * 2, z - dz * 2);
    camera.position.set(cx, Math.max(generator.getHeight(cx, cz) + 3, top - drop * 0.45 + 4) + up, cz);
    const tx = x + dx * 2, tz = z + dz * 2, ty = top - drop * 0.5;
    const yaw = Math.atan2(-(tx - cx), -(tz - cz));
    const pitch = Math.atan2(ty - camera.position.y, Math.hypot(tx - cx, tz - cz));
    controls.euler.set(pitch, yaw, 0, 'YXZ');
    camera.quaternion.setFromEuler(controls.euler);
    for (let k = 0; k < 60 && ![...landmarks.built.values()].some((b) => b.site.kind === 'falls' && b.site.drops?.some((d) => Math.abs(d.x - x) < 2 && Math.abs(d.z - z) < 2)); k++) await new Promise((r) => setTimeout(r, 500));
    return { top: +top.toFixed(1), built: [...landmarks.built.values()].filter((b) => b.site.kind === 'falls').length, biome: generator.getBiomeName?.(x, z) };
  }, [x, z, dx, dz, drop, cx, cz, up]);
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${out}-${n++}.png` });
  console.log(spec, JSON.stringify(r));
}
console.log('errors', errs);
await browser.close();
