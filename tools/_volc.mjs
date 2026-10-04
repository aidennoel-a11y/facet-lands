// Shoots the volcano nearest (x, z) on a seed, from off its flank (along
// its flow, if it has one).  node tools/_volc.mjs seed x z [hour] [out.png] [dist] [angleOff] [heightFrac]
import { createRequire } from 'module';
import { execSync } from 'child_process';
import { TerrainGenerator } from '../src/world/TerrainGenerator.js';
import { WORLD } from '../src/config.js';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const [seed, x, z, hour = '15', out = 'volc.png', distK = '1.25', off = '0.5', hk = '0.55'] = process.argv.slice(2);
const g = new TerrainGenerator(seed, WORLD);
const c = g.volcanoes(+x - 3000, +z - 3000, +x + 3000, +z + 3000).sort((p, q) => Math.hypot(p.x - x, p.z - z) - Math.hypot(q.x - x, q.z - z))[0];
let cx, cz, cy, yaw, pitch;
if (+distK < 0) {
  // Close by the live flow, `-distK` × R down it from the summit, looking along and down at it.
  const d = +distK < -5 ? -distK : -distK * c.R, p = g.lavaPath(c, d); // (metres, or a fraction of its radius)
  const fx = c.x + Math.cos(p.angle) * d, fz = c.z + Math.sin(p.angle) * d;
  const side = p.angle + Math.PI / 2;
  cx = fx + Math.cos(side) * 14 + Math.cos(p.angle) * 18;
  cz = fz + Math.sin(side) * 14 + Math.sin(p.angle) * 18;
  const fy = g.getBaseHeight(fx, fz);
  cy = Math.max(g.getBaseHeight(cx, cz), fy) + +hk;
  const dx = fx - cx, dz = fz - cz;
  yaw = Math.atan2(-dx, -dz);
  pitch = Math.atan2(fy - cy, Math.hypot(dx, dz));
} else {
  const a = (c.flows[0]?.a ?? 0) + +off, dist = c.R * +distK;
  cx = c.x + Math.cos(a) * dist;
  cz = c.z + Math.sin(a) * dist;
  const top = g.getBaseHeight(c.x, c.z);
  cy = top + c.H * +hk;
  const dx = c.x - cx, dz = c.z - cz;
  yaw = Math.atan2(-dx, -dz);
  pitch = Math.atan2(top - cy, Math.hypot(dx, dz));
}
console.log(c.state, c.lake ? 'lake' : '', Math.round(c.x), Math.round(c.z), c.active ? JSON.stringify(g.lavaEnd(c)) : '');
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(`http://localhost:4173/?seed=${seed}&x=${cx}&z=${cz}&y=${cy}&yaw=${yaw}&pitch=${pitch}&vd=3&hide&hour=${hour}`, { timeout: 180000 });
await page.waitForFunction(() => window.world?.chunks, null, { timeout: 200000 });
await page.waitForTimeout(70000);
await page.screenshot({ path: out });
console.log('errors', errs.slice(0, 4));
await browser.close();
