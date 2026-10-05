// The red glow near lava: how strong at a few distances from a live flow.
import { createRequire } from 'module';
import { execSync } from 'child_process';
import { TerrainGenerator } from '../src/world/TerrainGenerator.js';
import { WORLD } from '../src/config.js';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const [seed, x, z] = process.argv.slice(2);
const g = new TerrainGenerator(seed, WORLD);
const c = g.volcanoes(+x - 100, +z - 100, +x + 100, +z + 100)[0];
const d = c.R * 1.0, p = g.lavaPath(c, d);
const fx = c.x + Math.cos(p.angle) * d, fz = c.z + Math.sin(p.angle) * d;
const side = p.angle + Math.PI / 2;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
await page.goto(`http://localhost:4173/?seed=${seed}&x=${fx}&z=${fz}&vd=2&hide&hour=12`, { timeout: 180000 });
await page.waitForFunction(() => window.world?.chunks, null, { timeout: 200000 });
await page.waitForTimeout(20000);
for (const off of [60, 20, 10, 4, 0]) {
  const px = fx + Math.cos(side) * (p.half + off), pz = fz + Math.sin(side) * (p.half + off);
  const r = await page.evaluate(([px, pz]) => {
    const w = window.world, cam = w.camera;
    cam.position.set(px, w.chunks.groundHeightAt(px, pz) + w.controls.eyeHeight, pz);
    return new Promise((res) => setTimeout(() => res({ glow: +document.querySelector('.lava-glow').style.opacity, near: w.generator.lavaNear(px, pz) }), 2500));
  }, [px, pz]);
  console.log(`${off} m from the flow's edge: glow ${r.glow}, lava ${r.near ? r.near.d.toFixed(1) + ' m off' : 'none'}`);
}
await browser.close();
