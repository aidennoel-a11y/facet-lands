import * as THREE from 'three';
import { WORLD } from './config.js';
import { TerrainGenerator } from './world/TerrainGenerator.js';
import { ChunkManager } from './world/ChunkManager.js';
import { createWaterLayer } from './world/layers/WaterLayer.js';
import { createTreeLayer } from './world/layers/TreeLayer.js';
import { createGrassLayer } from './world/layers/GrassLayer.js';
import { caveNightVision, createCaveLayer } from './world/layers/CaveLayer.js';
import { createRockLayer } from './world/layers/RockLayer.js';
import { createEntranceLayer } from './world/layers/EntranceLayer.js';
import { createRiverLayer } from './world/layers/RiverLayer.js';
import { Torches } from './items/Torches.js';
import { Hotbar } from './ui/Hotbar.js';
import { PlayerControls } from './controls/PlayerControls.js';
import { PlayerBody } from './player/PlayerBody.js';
import { DayNight } from './render/DayNight.js';
import { RayEffects } from './render/RayEffects.js';
import { Clouds } from './world/Clouds.js';
import { describeWind, updateWind } from './render/wind.js';
import { Minimap } from './ui/Minimap.js';

// --- Renderer, scene, camera -------------------------------------------------
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
const drawDistance = WORLD.viewDistance * WORLD.chunkSize;
scene.fog = new THREE.Fog(0xd6e8f7, drawDistance * 0.45, drawDistance * 0.95);

const camera = new THREE.PerspectiveCamera(60, 1, 0.3, drawDistance * 1.5);

// Sky dome, sun, moon, stars, lighting and shadows, driven by the time of day.
const dayNight = new DayNight(scene, WORLD, drawDistance * 1.2);
const clouds = new Clouds(scene);

// Ray-marched ambient occlusion and light shafts, drawn after the scene.
const rayEffects = new RayEffects(renderer);
const light = { direction: dayNight.lightDirection, color: dayNight.light.color, strength: 1 };

// --- Terrain -----------------------------------------------------------------
// Double-sided so that, from inside a cave, a lip of ground overhanging the
// mouth shows as ground rather than letting the sky through.
const terrainMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
// A heightfield has no back faces, so render its front faces into the shadow map.
terrainMaterial.shadowSide = THREE.FrontSide;
let generator = new TerrainGenerator(WORLD.seed, WORLD);
const chunks = new ChunkManager(scene, generator, WORLD, terrainMaterial);
const water = createWaterLayer({ skyColor: dayNight.horizon });
const trees = createTreeLayer();
const grass = createGrassLayer(WORLD);
chunks.addLayer(water);
chunks.addLayer(createRiverLayer(water));
chunks.addLayer(trees);
chunks.addLayer(grass);
const caves = createCaveLayer(WORLD);
chunks.addLayer(caves);
chunks.addLayer(createEntranceLayer(WORLD, caves.material));
const rocks = createRockLayer(WORLD);
chunks.addLayer(rocks);

/**
 * What you'd stand on at (x, z) from feet height `feetY`: the terrain, or a
 * cave floor underground. The cave system reads the same procedural field
 * the cave meshes are built from, so floors, walls and roofs match them.
 */
function groundAt(x, feetY, z) {
  return generator.caves.groundAt(x, feetY, z, chunks.groundHeightAt(x, z));
}

// Start somewhere with mountains in view: scan a few spots for a tall one.
function placeCamera() {
  let best = { x: 0, z: 0, h: -Infinity };
  for (let i = 0; i < 400; i++) {
    const x = (i % 20) * 160 - 1600;
    const z = Math.floor(i / 20) * 160 - 1600;
    const h = generator.getHeight(x, z);
    if (h > best.h) best = { x, z, h };
  }
  // Stand off to the south-east of the peak, looking at it.
  const x = best.x + 300;
  const z = best.z + 360;
  camera.position.set(x, Math.max(generator.getHeight(x, z) + 50, 70), z);
  controls.lookAt(new THREE.Vector3(best.x, best.h * 0.5, best.z));
}

const controls = new PlayerControls(camera, canvas, {
  groundAt,
  seaLevel: WORLD.seaLevel,
  collide: (position, radius) => {
    trees.collide(position, radius, WORLD.chunkSize);
    rocks.collide(position, radius);
    generator.caves.collide(position, radius, position.y - controls.eyeHeight);
  },
});
placeCamera();
const body = new PlayerBody(scene);
const torches = new Torches(scene);
torches.loadWorld(WORLD.seed);

// --- HUD -----------------------------------------------------------------------
const minimap = new Minimap(document.getElementById('minimap'));
const ui = {
  seed: document.getElementById('seed'),
  seedForm: document.getElementById('seed-form'),
  randomSeed: document.getElementById('random-seed'),
  wireframe: document.getElementById('wireframe'),
  fly: document.getElementById('fly'),
  automove: document.getElementById('automove'),
  keys: document.querySelector('.keys'),
  fps: document.getElementById('stat-fps'),
  chunks: document.getElementById('stat-chunks'),
  trees: document.getElementById('stat-trees'),
  wind: document.getElementById('stat-wind'),
  time: document.getElementById('time'),
  clock: document.getElementById('clock'),
  cycle: document.getElementById('cycle'),
  shadows: document.getElementById('shadows'),
  rays: document.getElementById('rays'),
  night: document.getElementById('night'),
  presets: document.querySelectorAll('[data-hour]'),
  alt: document.getElementById('stat-alt'),
  speed: document.getElementById('stat-speed'),
};
ui.seed.value = WORLD.seed;

function setSeed(seed) {
  WORLD.seed = seed;
  generator = new TerrainGenerator(seed, WORLD);
  chunks.setGenerator(generator);
  minimap.invalidate();
  torches.loadWorld(seed);
  placeCamera();
}

ui.seedForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const value = ui.seed.value.trim() || 'polaris';
  ui.seed.value = value;
  setSeed(value);
});
ui.randomSeed.addEventListener('click', () => {
  const value = Math.random().toString(36).slice(2, 8);
  ui.seed.value = value;
  setSeed(value);
});
ui.wireframe.addEventListener('change', () => {
  for (const m of [terrainMaterial, water.material, trees.material, trees.leafMaterial, grass.material, caves.material, rocks.material, ...clouds.materials]) {
    m.wireframe = ui.wireframe.checked;
  }
});
ui.time.addEventListener('input', () => {
  dayNight.hour = Number(ui.time.value);
  ui.clock.textContent = dayNight.clock;
});
ui.cycle.addEventListener('change', () => {
  dayNight.playing = ui.cycle.checked;
});
for (const button of ui.presets) {
  button.addEventListener('click', () => {
    dayNight.hour = Number(button.dataset.hour);
    ui.time.value = dayNight.hour;
    ui.clock.textContent = dayNight.clock;
  });
}
// Night vision, for testing: a soft green-white light everywhere, caves
// no longer dimmed and no underground haze.
const nightVisionLight = new THREE.AmbientLight(0xd4ffdc, 0);
scene.add(nightVisionLight);
ui.night.addEventListener('change', () => {
  nightVisionLight.intensity = ui.night.checked ? 1.6 : 0;
  caveNightVision.value = ui.night.checked ? 1 : 0;
});
ui.shadows.addEventListener('change', () => {
  dayNight.shadows = ui.shadows.checked;
});
ui.automove.addEventListener('change', () => {
  controls.autoMove = ui.automove.checked;
});
ui.fly.addEventListener('change', () => {
  const mode = ui.fly.checked ? 'fly' : 'walk';
  controls.setMode(mode);
  ui.keys.dataset.mode = mode;
});
window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement && e.target.type === 'text') return;
  if (e.code === 'KeyV') ui.fly.click();
  if (e.code === 'KeyF') ui.automove.click();
  if (e.code === 'KeyG') ui.wireframe.click();
  if (e.code === 'KeyT') ui.cycle.click();
  if (e.code === 'KeyH') ui.shadows.click();
  if (e.code === 'KeyR') ui.rays.click();
  if (e.code === 'KeyN') ui.night.click();
});

// --- Hotbar and placing things --------------------------------------------------
const hotbar = new Hotbar(document.getElementById('hotbar'), [
  { id: 'torch', name: 'Torch', icon: 'torch' },
  { id: 'pickup', name: 'Pick up torch', icon: 'pickup' },
]);

// Scroll through the hotbar while walking (flying uses the wheel for speed).
canvas.addEventListener(
  'wheel',
  (e) => {
    if (controls.mode === 'walk') hotbar.step(e.deltaY > 0 ? 1 : -1);
  },
  { passive: true },
);

// A quick click or tap (not a drag to look around) uses the selected item
// where you point; right-click always picks a torch back up.
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let press = null;
canvas.addEventListener('pointerdown', (e) => {
  press = { x: e.clientX, y: e.clientY, time: performance.now(), button: e.button };
});
canvas.addEventListener('pointerup', (e) => {
  if (!press) return;
  const quick = performance.now() - press.time < 400 && Math.hypot(e.clientX - press.x, e.clientY - press.y) < 6;
  if (quick) useItem(e.clientX, e.clientY, press.button === 2 ? { id: 'pickup' } : hotbar.selected);
  press = null;
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

/** Terrain and cave meshes you can put things on, near the camera. */
function solidTargets() {
  const size = WORLD.chunkSize;
  const ccx = Math.floor(camera.position.x / size);
  const ccz = Math.floor(camera.position.z / size);
  const reachChunks = controls.mode === 'walk' ? 1 : 2;
  const out = [];
  for (const chunk of chunks.chunks.values()) {
    const near = Math.abs(chunk.cx - ccx) <= reachChunks && Math.abs(chunk.cz - ccz) <= reachChunks;
    chunk.group.traverse((o) => {
      // Caves can reach far from the chunk that owns them, so always include those.
      if (o.userData.solid && (near || o.name.startsWith('cave'))) out.push(o);
    });
  }
  return out;
}

function useItem(clientX, clientY, item) {
  if (!item) return;
  const rect = canvas.getBoundingClientRect();
  pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const reach = controls.mode === 'walk' ? 8 : 150;

  if (item.id === 'pickup') {
    if (!torches.removeAlongRay(raycaster.ray, reach)) hotbar.flash('Point at a torch to pick it up');
    return;
  }
  raycaster.far = reach;
  const hit = raycaster.intersectObjects(solidTargets(), false)[0];
  if (!hit) {
    hotbar.flash(controls.mode === 'walk' ? 'Too far away: get closer' : 'Point at the ground');
    return;
  }
  const normal = hit.face.normal.clone();
  if (hit.instanceId !== undefined) {
    // Rocks are instanced: turn the normal by that rock's own transform too.
    const instance = new THREE.Matrix4();
    hit.object.getMatrixAt(hit.instanceId, instance);
    normal.transformDirection(instance);
  }
  normal.transformDirection(hit.object.matrixWorld);
  if (normal.dot(raycaster.ray.direction) > 0) normal.negate(); // caves are seen from inside
  if (item.id === 'torch' && !torches.place(hit.point, normal)) hotbar.flash("Torches can't hang from a ceiling");
}

// --- What to draw ---------------------------------------------------------------
// three.js already skips anything outside the view. On top of that, caves are
// sealed in rock: from the surface you can only see into them through a mouth,
// and from deep inside you can't see the surface at all. So skip drawing what
// the rock hides.
function updateVisibility() {
  const p = camera.position;
  const underground = p.y < generator.getHeight(p.x, p.z) - 1.5;
  const mouths = generator.caves.mouthsNear(p.x - 70, p.z - 70, p.x + 70, p.z + 70);
  const nearMouth = mouths.some((e) => Math.hypot(e.mouth.x - p.x, e.mouth.y - p.y, e.mouth.z - p.z) < 60);
  const surface = !underground || nearMouth;
  // Near a mouth you can see down the tunnel beyond it, so show all caves.
  chunks.setVisibility(surface, underground || nearMouth ? 'all' : 'mouths');
  clouds.group.visible = surface;

  // Underground, a short dark haze replaces the sky: caves fade into darkness
  // rather than showing gaps where far-off tunnels aren't built yet.
  const toMouth = mouths.reduce((d, e) => Math.min(d, Math.hypot(e.mouth.x - p.x, e.mouth.y - p.y, e.mouth.z - p.z)), Infinity);
  caveHaze.target = underground && !ui.night.checked ? Math.min(1, Math.max(0, (toMouth - 4) / 16)) : 0;
}

const caveHaze = { target: 0, amount: 0, color: new THREE.Color(0x07080b) };
const openFog = { near: scene.fog.near, far: scene.fog.far };
function applyCaveHaze(dt) {
  caveHaze.amount += (caveHaze.target - caveHaze.amount) * Math.min(1, dt * 3);
  const a = caveHaze.amount;
  if (a < 0.001) return;
  scene.fog.near = openFog.near + (12 - openFog.near) * a;
  scene.fog.far = openFog.far + (170 - openFog.far) * a;
  scene.fog.color.lerp(caveHaze.color, a);
  dayNight.sky.visible = a < 0.98;
}

// --- Loop --------------------------------------------------------------------
function resize() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  rayEffects.setSize();
}
window.addEventListener('resize', resize);
resize();

let lastTime = performance.now();
const dir = new THREE.Vector3();
let frames = 0;
let fpsTime = 0;

function tick(now) {
  const elapsed = (now - lastTime) / 1000;
  const dt = Math.min(elapsed, 0.1); // big hitches shouldn't teleport the player
  lastTime = now;
  controls.update(dt);
  camera.getWorldDirection(dir);
  chunks.update(camera.position, now / 1000, dir);
  const wind = updateWind(now / 1000);
  dayNight.update(dt, camera.position);
  scene.fog.near = openFog.near;
  scene.fog.far = openFog.far;
  dayNight.sky.visible = true;
  applyCaveHaze(dt);
  clouds.update(dt, camera.position, dayNight.horizon, generator, wind);
  body.update(controls, dt);
  torches.update(now / 1000, camera.position);
  updateVisibility();
  if (ui.rays.checked) {
    light.strength = dayNight.lightStrength;
    rayEffects.render(scene, camera, light);
  } else {
    renderer.render(scene, camera);
  }

  minimap.update(generator, camera.position, Math.atan2(dir.x, -dir.z), WORLD.seaLevel);

  frames++;
  fpsTime += elapsed;
  if (fpsTime >= 0.5) {
    ui.fps.textContent = Math.round(frames / fpsTime);
    frames = 0;
    fpsTime = 0;
    ui.chunks.textContent = chunks.pendingCount
      ? `${chunks.loadedCount} +${chunks.pendingCount}`
      : `${chunks.loadedCount}`;
    ui.trees.textContent = `${(trees.count / 1000).toFixed(1)}k`;
    ui.wind.textContent = describeWind(wind);
    ui.clock.textContent = dayNight.clock;
    if (document.activeElement !== ui.time) ui.time.value = dayNight.hour.toFixed(2);
    ui.alt.textContent = `${Math.round(camera.position.y)} m`;
    ui.speed.textContent = `${Math.round(controls.currentSpeed)} m/s`;
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// Exposed for tinkering from the dev console.
window.world = { THREE, scene, camera, chunks, controls, dayNight, clouds, rayEffects, torches, hotbar, groundAt, get generator() { return generator; }, WORLD };
