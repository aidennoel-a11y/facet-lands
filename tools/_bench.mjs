// What one picture costs to draw, held still: the full frame, and without
// the sun's shadows redrawn (so the shadows' share).   node tools/_bench.mjs label seed x z [y|cave] [yaw] [pitch] [hour]
import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const [label = 'forest', seed = 'polaris', x = '399', z = '1025', y = '', yaw = '0', pitch = '-0.1', hour = '13'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto(`http://localhost:4173/?seed=${seed}&x=${x}&z=${z}&up=2&hide&hour=${hour}&weather=clear`, { timeout: 180000 });
await page.waitForFunction(() => window.world?.chunks && window.world.chunks.pendingCount === 0, null, { timeout: 900000, polling: 1000 });
const place = async () => page.evaluate(([y, yaw, pitch]) => {
  const { camera, controls, generator: g } = window.world, p = camera.position;
  if (y === 'cave') {
    const f = g.caves.field, ch = f.chamberAt(p.x, p.z);
    p.y = ch ? f.chamberFloor(ch.c, p.x, p.z) + 4 : p.y;
  } else if (y) p.y = +y;
  controls.euler.set(+pitch, +yaw, 0, 'YXZ');
  camera.quaternion.setFromEuler(controls.euler);
  return p.y;
}, [y, yaw, pitch]);
const py = await place();
const hold = async (ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { await page.evaluate((py) => { window.world.camera.position.y = py; }, py); await page.waitForTimeout(250); } };
await hold(8000);
for (let k = 0; k < 40; k++) {
  const busy = await page.evaluate(() => { let n = 0; const c = window.world.generator.caves?.cache; if (c) for (const e of c.values()) if (!e.ready) n++; return n + window.world.chunks.pendingCount; });
  if (!busy) break;
  await hold(1500);
}
await hold(3000);
const r = await page.evaluate(async (py) => {
  const { renderer, scene, camera } = window.world, gl = renderer.getContext();
  const px = new Uint8Array(4);
  // (The game's own loop is stopped while timing: only these draws.)
  const loop = renderer.getAnimationLoop?.();
  const raf = window.requestAnimationFrame;
  window.requestAnimationFrame = () => 0;
  await new Promise((d) => setTimeout(d, 300));
  camera.position.y = py;
  const time = (n, shadows) => {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      renderer.shadowMap.autoUpdate = false;
      renderer.shadowMap.needsUpdate = shadows;
      const far = window.world.dayNight?.farLight;
      if (far) far.shadow.needsUpdate = shadows && i % 2 === 0; // (the far shadow map every other frame, as in play)
      renderer.info.reset();
      const t = performance.now();
      renderer.render(scene, camera);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      sum += performance.now() - t;
    }
    return sum / n;
  };
  time(2, true);
  const full = time(6, true);
  const info = { calls: renderer.info.render.calls, tris: renderer.info.render.triangles };
  const noShadow = time(6, false);
  const info2 = { calls: renderer.info.render.calls, tris: renderer.info.render.triangles };
  window.requestAnimationFrame = raf;
  return { full: +full.toFixed(0), noShadow: +noShadow.toFixed(0), shadows: +(full - noShadow).toFixed(0), drawsWithShadow: info.calls, trisWithShadow: info.tris, draws: info2.calls, tris: info2.tris, programs: renderer.info.programs.length };
}, py);
console.log(label, JSON.stringify(r));
await page.screenshot({ path: `${label}.png` });
await browser.close();
