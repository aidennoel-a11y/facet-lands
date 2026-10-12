// Each of the drawing savings switched on in turn, in one place, held
// still, timed in alternation (so the machine's ups and downs fall on all
// alike): the median draw time for each.
//   node tools/_abbench.mjs label seed x z [y|cave] [yaw] [pitch] [hour]
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
const py = await page.evaluate(([y, yaw, pitch]) => {
  const { camera, controls, generator: g } = window.world, p = camera.position;
  if (y === 'cave') {
    const f = g.caves.field, ch = f.chamberAt(p.x, p.z);
    p.y = ch ? f.chamberFloor(ch.c, p.x, p.z) + 4 : p.y;
  } else if (y) p.y = +y;
  controls.euler.set(+pitch, +yaw, 0, 'YXZ');
  camera.quaternion.setFromEuler(controls.euler);
  return p.y;
}, [y, yaw, pitch]);
const hold = async (ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { await page.evaluate((py) => { window.world.camera.position.y = py; }, py); await page.waitForTimeout(250); } };
await hold(8000);
for (let k = 0; k < 40; k++) {
  const busy = await page.evaluate(() => { let n = 0; const c = window.world.generator.caves?.cache; if (c) for (const e of c.values()) if (!e.ready) n++; return n + window.world.chunks.pendingCount; });
  if (!busy) break;
  await hold(1500);
}
if (process.env.NV) await page.evaluate(() => { const nv = document.getElementById('night'); if (nv && !nv.checked) nv.click(); });
await hold(3000);
const r = await page.evaluate(async (py) => {
  const w = window.world, { renderer, scene, camera, torches, dayNight, chunks } = w, gl = renderer.getContext();
  const px = new Uint8Array(4);
  window.requestAnimationFrame = () => 0; // (the game's own loop stopped: only these draws)
  await new Promise((d) => setTimeout(d, 300));
  camera.position.y = py;
  const near = dayNight.light, far = dayNight.farLight;
  const nearSize = near.shadow.mapSize.x, nearBox = near.shadow.camera.right;
  const sort = renderer.__sort;
  const caveSet = w.generator.caves.visibleChunks(camera.position);
  const resize = (l, size, half) => {
    if (l.shadow.mapSize.x !== size) (l.shadow.mapSize.set(size, size), l.shadow.map?.dispose(), (l.shadow.map = null));
    Object.assign(l.shadow.camera, { left: -half, right: half, top: half, bottom: -half });
    l.shadow.camera.updateProjectionMatrix();
  };
  const set = ({ lights, split, order, cull }) => {
    torches.lights.forEach((l, i) => (l.visible = lights ? i < torches.tier : true));
    far.castShadow = split;
    if (split) resize(near, nearSize, nearBox);
    else resize(near, far.shadow.mapSize.x, far.shadow.camera.right), near.position.copy(far.position), near.target.position.copy(far.target.position), near.target.updateMatrixWorld();
    renderer.setOpaqueSort(order ? sort : null);
    chunks.setCaveSet(cull ? caveSet : null);
  };
  const time = (n) => {
    const out = [];
    for (let i = 0; i < n; i++) {
      renderer.shadowMap.autoUpdate = false;
      renderer.shadowMap.needsUpdate = true;
      far.shadow.needsUpdate = i % 2 === 0;
      renderer.info.reset();
      const t = performance.now();
      renderer.render(scene, camera);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      out.push(performance.now() - t);
    }
    return out;
  };
  const configs = {
    old: { lights: false, split: false, order: false, cull: false },
    lights: { lights: true, split: false, order: false, cull: false },
    'lights+split': { lights: true, split: true, order: false, cull: false },
    'lights+split+order': { lights: true, split: true, order: true, cull: false },
    all: { lights: true, split: true, order: true, cull: true },
  };
  const times = {}, info = {};
  for (const [name, c] of Object.entries(configs)) (set(c), time(2), (times[name] = []));
  for (let round = 0; round < 4; round++) {
    for (const [name, c] of Object.entries(configs)) {
      set(c);
      time(1);
      times[name].push(...time(4));
      info[name] = `${renderer.info.render.calls} draws ${(renderer.info.render.triangles / 1e6).toFixed(2)}M tris`;
    }
  }
  // (And the culled caves must look the same: every pixel compared, culled and not.)
  const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight, a = new Uint8Array(W * H * 4), b = new Uint8Array(W * H * 4);
  const shot = (cull, buf) => { set({ ...configs.all, cull }); time(2); renderer.render(scene, camera); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf); };
  shot(false, a);
  shot(true, b);
  let differ = 0;
  for (let k = 0; k < a.length; k += 4) if (Math.abs(a[k] - b[k]) + Math.abs(a[k + 1] - b[k + 1]) + Math.abs(a[k + 2] - b[k + 2]) > 6) differ++;
  const med = (a) => a.slice().sort((p, q) => p - q)[Math.floor(a.length / 2)];
  const res = {};
  for (const name of Object.keys(configs)) res[name] = `${med(times[name]).toFixed(0)} ms (${info[name]})`;
  return { tier: torches.tier, caveSet: caveSet ? caveSet.size : null, res, differ };
}, py);
console.log(label, 'lights on:', r.tier, 'cave chunks seen:', r.caveSet, 'pixels changed by the cave culling:', r.differ);
for (const [k, v] of Object.entries(r.res)) console.log('  ', k.padEnd(20), v);
await page.screenshot({ path: `${label}.png` });
await browser.close();
