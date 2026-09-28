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
import { createRiverLayer, mistLight } from './world/layers/RiverLayer.js';
import { createReedLayer } from './world/layers/ReedLayer.js';
import { createLilyLayer } from './world/layers/LilyLayer.js';
import { createVentLayer } from './world/layers/VentLayer.js';
import { createGeyserLayer } from './world/layers/GeyserLayer.js';
import { createCoralLayer } from './world/layers/CoralLayer.js';
import { createLeafLayer } from './world/layers/LeafLayer.js';
import { createSeaCoastLayer } from './world/layers/SeaCoastLayer.js';
import { createKelpLayer } from './world/layers/KelpLayer.js';
import { createLogLayer } from './world/layers/LogLayer.js';
import { createFlowerLayer } from './world/layers/FlowerLayer.js';
import { createSnowLayer } from './world/layers/SnowLayer.js';
import { createUnderstoryLayer } from './world/layers/UnderstoryLayer.js';
import { createLavaLayer } from './world/layers/LavaLayer.js';
import { createFarTreeLayer } from './world/layers/FarTreeLayer.js';
import { Torches } from './items/Torches.js';
import { Hotbar } from './ui/Hotbar.js';
import { PlayerControls } from './controls/PlayerControls.js';
import { PlayerBody } from './player/PlayerBody.js';
import { DayNight } from './render/DayNight.js';
import { RayEffects } from './render/RayEffects.js';
import { Clouds } from './world/Clouds.js';
import { Weather, WEATHER } from './render/Weather.js';
import { Lightning, panTowards, Rain } from './render/Storm.js';
import { Sound } from './render/Sound.js';
import { Showers } from './render/Showers.js';
import { PRINT, Traces } from './render/Traces.js';
import { Fish } from './wildlife/Fish.js';
import { ShootingStars } from './render/ShootingStars.js';
import { Sandstorm, Volcanoes, Wildfires } from './render/Phenomena.js';
import { Seasons, seasonalTerrain, seasonUniforms } from './render/Seasons.js';
import { describeWind, gustAt, updateWind, windDirection, windStrength } from './render/wind.js';
import { FallingLeaves } from './render/FallingLeaves.js';
import { Wildlife } from './wildlife/Wildlife.js';
import { Insects } from './wildlife/Insects.js';
import { sparkleUniforms } from './render/waterSparkle.js';
import { addCloudShadow, cloudShadowUniforms } from './render/cloudShadow.js';
import { Minimap } from './ui/Minimap.js';
import { BiomeMap } from './ui/BiomeMap.js';

// --- Renderer, scene, camera -------------------------------------------------
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
// Shadows fade out over the outer edge of the sun's shadow map, rather
// than stopping on a line across the land.
THREE.ShaderChunk.shadowmap_pars_fragment = THREE.ShaderChunk.shadowmap_pars_fragment.replaceAll(
  '\t\t\treturn mix( 1.0, shadow, shadowIntensity );',
  '\t\t\tvec2 shadowEdge = abs( shadowCoord.xy * 2.0 - 1.0 );\n\t\t\treturn mix( 1.0, shadow, shadowIntensity * ( 1.0 - smoothstep( 0.78, 0.97, max( shadowEdge.x, shadowEdge.y ) ) ) );',
);

const scene = new THREE.Scene();
const drawDistance = WORLD.viewDistance * WORLD.chunkSize;
scene.fog = new THREE.Fog(0xd6e8f7, drawDistance * 0.45, drawDistance * 0.95);

const camera = new THREE.PerspectiveCamera(60, 1, 0.3, drawDistance * 1.5);

// Sky dome, sun, moon, stars, lighting and shadows, driven by the time of day.
const dayNight = new DayNight(scene, WORLD, drawDistance * 1.2);
// The sun sets on the horizon you can see (lower, from up high): the land
// out to where the fog hides it, or the sea.
dayNight.groundAt = (x, z) => Math.max(generator.getBaseHeight(x, z), WORLD.seaLevel);
dayNight.horizonDistance = drawDistance * 0.9;
const clouds = new Clouds(scene);
windDirection.value.set(clouds.wind.x, clouds.wind.z).normalize(); // (the gusts roll the way the clouds drift)
// The weather: cloud cover, rain and thunderstorms, changing by itself.
const weather = new Weather('fair');
const rain = new Rain(scene);
const lightning = new Lightning(scene);
const sound = new Sound();

// Ray-marched ambient occlusion and light shafts, drawn after the scene.
const rayEffects = new RayEffects(renderer);
const light = { direction: dayNight.shaftDirection, color: dayNight.shaftColor, strength: 1, reach: 1.6 };

// --- Terrain -----------------------------------------------------------------
// Double-sided so that, from inside a cave, a lip of ground overhanging the
// mouth shows as ground rather than letting the sky through.
const terrainMaterial = seasonalTerrain(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), WORLD.seaLevel);
// The seasons turn over every few game days (see Seasons).
const seasons = new Seasons(WORLD.daysPerSeason);
// A heightfield has no back faces, so render its front faces into the shadow map.
terrainMaterial.shadowSide = THREE.FrontSide;
let generator = new TerrainGenerator(WORLD.seed, WORLD);
const chunks = new ChunkManager(scene, generator, WORLD, terrainMaterial);
const water = createWaterLayer({ skyColor: dayNight.horizon, skyTop: dayNight.top });
const rocks = createRockLayer(WORLD);
const trees = createTreeLayer({ rocks });
const grass = createGrassLayer(WORLD);
chunks.addLayer(water);
const rivers = createRiverLayer(dayNight.horizon, dayNight.top);
// Leaves drifting down from the trees round about (see FallingLeaves).
const fallingLeaves = new FallingLeaves(scene);
// The animals (deer, bison, rabbits, birds), and the bees, their nests and the fireflies.
const wildlife = new Wildlife(scene, addCloudShadow);
const traces = new Traces(scene);
const fish = new Fish(scene, addCloudShadow);
const shootingStars = new ShootingStars(scene);
// Lightning may set the land alight where it strikes: dry ground with
// something on it to burn (not sand, snow, bare rock or water).
lightning.onStrike = (x, y, z, distance) => {
  if (distance > 1300 || y < WORLD.seaLevel + 2 || waterAt(x, z, true)) return;
  const w = generator.getBiomeWeights(x, z, {});
  if (w.desert > 0.4 || seasonUniforms.uWinter.value * generator.getSeasonality(x, z) > 0.4) return;
  const summer = 1 - seasonUniforms.uSpring.value - seasonUniforms.uWinter.value;
  if (Math.random() < 0.18 + 0.2 * summer + 0.15 * w.savanna) fires.ignite(x, y, z, (px, pz) => generator.getBaseHeight(px, pz));
};
const fires = new Wildfires(scene);
const volcanoes = new Volcanoes(scene);
const sandstorm = new Sandstorm(scene, Rain);
const ambientLight = new THREE.Color();
const insects = new Insects(scene, addCloudShadow);
chunks.addLayer(rivers);
chunks.addLayer(createReedLayer(WORLD));
chunks.addLayer(createLilyLayer(WORLD));
chunks.addLayer(createVentLayer(WORLD));
chunks.addLayer(createGeyserLayer(WORLD));
chunks.addLayer(createCoralLayer(WORLD));
chunks.addLayer(createLeafLayer());
chunks.addLayer(createLavaLayer(WORLD));
chunks.addLayer(createSeaCoastLayer(WORLD, terrainMaterial));
chunks.addLayer(createKelpLayer(WORLD));
const logs = createLogLayer(WORLD);
chunks.addLayer(logs);
chunks.addLayer(createFlowerLayer(WORLD));
chunks.addLayer(createUnderstoryLayer(WORLD));
chunks.addLayer(trees);
const farTrees = createFarTreeLayer(WORLD);
scene.add(farTrees.group);
chunks.addLayer(farTrees);
chunks.addLayer(grass);
const caves = createCaveLayer(WORLD);
chunks.addLayer(caves);
chunks.addLayer(createEntranceLayer(WORLD, caves.material));
chunks.addLayer(rocks);
chunks.addLayer(createSnowLayer(WORLD, rocks)); // (after the rocks: it caps their boulders)
// The clouds' shadows slide over the land, the trees, grass, rocks and water (see cloudShadow).
for (const m of [terrainMaterial, trees.material, trees.leafMaterial, grass.material, rocks.material, farTrees.material, logs.material, water.material, rivers.material]) if (m) addCloudShadow(m);

/**
 * What you'd stand on at (x, z) from feet height `feetY`: the terrain, or a
 * cave floor underground. The cave system reads the same procedural field
 * the cave meshes are built from, so floors, walls and roofs match them.
 */
function groundAt(x, feetY, z) {
  const g = generator.caves.groundAt(x, feetY, z, chunks.groundHeightAt(x, z));
  // Boulders are solid: you stand on their tops (and walk into their sides as walls).
  if (!g.inCave) g.height = Math.max(g.height, rocks.surfaceAt(x, z), logs.surfaceAt(x, z));
  // The roofs of sea caves and spans of sea arches: stood on from above,
  // swum or walked under from below.
  const over = g.height < WORLD.seaLevel + 40 ? generator.overhangAt(x, z) : null;
  if (over && feetY > over.bottom) g.height = Math.max(g.height, over.top);
  // A frozen lake or pond: you walk out on the ice.
  if (!g.inCave) {
    const water = waterAt(x, z, true);
    if (water?.frozen) g.height = Math.max(g.height, water.level);
  }
  return g;
}

/**
 * The water's surface at (x, z) and its current: { level, fx, fz, speed },
 * or null on dry land. The sea or a lake where the land dips under it; a
 * river, stream or pond where one runs (the higher of the two). Frozen
 * over (a lake or pond in a cold winter, as the water draws its ice) it's
 * no water to swim in, but ice to walk on: null, unless `ice` is asked for,
 * then with `frozen` set.
 */
function waterAt(x, z, ice = false) {
  const ground = chunks.groundHeightAt(x, z);
  let found = ground < WORLD.seaLevel ? { level: WORLD.seaLevel, fx: 0, fz: 0, speed: 0, lake: true } : null;
  const r = generator.rivers.waterAt(x, z, 0);
  if (r && (!found || r.level > found.level)) found = { level: r.level, fx: r.fx, fz: r.fz, speed: r.pond ? 0 : 0.6 + Math.min(2.4, Math.max(0, r.drop) * 6), pond: r.pond, hot: r.tint === 2 };
  if (found && (found.lake || (found.pond && !found.hot))) {
    const winter = smooth(0.35, 0.8, seasonUniforms.uWinter.value);
    if (winter > 0.5) {
      const cold = generator.getSeasonality(x, z) * (found.lake ? 1 - generator.getOceanness(x, z) : 1);
      found.frozen = winter * cold > 0.6;
    }
  }
  if (found?.frozen && !ice) return null;
  return found;
}

// --- Tracks and splashes --------------------------------------------------------
const printColour = new THREE.Color(), SNOW_PRINT = new THREE.Color(0.42, 0.48, 0.62);
const printNormal = new THREE.Vector3();
/**
 * What the ground at (x, z) takes a footprint in: 'snow', 'sand' or
 * 'mud' (with the print's colour in printColour), or null (grass, rock).
 */
function printGround(x, z, y) {
  const cold = generator.getSeasonality(x, z);
  const jitter = generator.getColorJitter(x, z);
  generator.surfaceColor(x, z, y + jitter, 1, printColour, jitter);
  const c = printColour;
  const snowy = (seasonUniforms.uSnowfall.value > 0.3 && cold > 0.3) || seasonUniforms.uWinter.value * cold > 0.55 || Math.min(c.r, c.g, c.b) > 0.78;
  if (snowy) return printColour.copy(SNOW_PRINT).multiplyScalar(0.5 + 0.5 * Math.min(1, dayNight.hemi.intensity)), 'snow';
  const w = generator.getBiomeWeights(x, z, {});
  const shore = y < WORLD.seaLevel + 5.5 ? generator.getShore(x, z, y) : null;
  const river = generator.rivers.at(x, z, 3.5);
  const muddy = (river && river.d < river.half + 3.5) || w.wetland > 0.5;
  const sandy = w.desert > 0.5 || shore?.kind === 'sand';
  if (!muddy && !sandy) return null;
  printColour.multiplyScalar(muddy ? 0.45 : 0.6);
  return muddy ? 'mud' : 'sand';
}
function groundNormal(x, z) {
  const e = 0.5;
  return printNormal.set(chunks.groundHeightAt(x - e, z) - chunks.groundHeightAt(x + e, z), 2 * e, chunks.groundHeightAt(x, z - e) - chunks.groundHeightAt(x, z + e)).normalize();
}
/**
 * A footfall at (x, z) heading `heading` (the player's boot, or an
 * animal's hoof or paw): a print in soft ground, a splash in water.
 */
function footfall(x, z, heading, shape, size, loud = 0.5) {
  const water = waterAt(x, z, true);
  const y = chunks.groundHeightAt(x, z);
  if (!Number.isFinite(y) || water?.frozen) return; // (none on the ice)
  if (water && water.level > y + 0.02) {
    traces.splash(x, water.level, z, 5 + Math.round(loud * 6), 1.2 + loud * 1.6, 0.5 + loud * 0.6);
    if (Math.hypot(x - camera.position.x, z - camera.position.z) < 25) sound.call('splash', panTowards(camera, x, z), 0.25 + 0.4 * loud);
    return;
  }
  const kind = printGround(x, z, y);
  if (kind) traces.print(x, y, z, heading, shape, size, kind, printColour, groundNormal(x, z));
}
// The player's steps and strokes.
const walker = { x: null, z: null, left: false, wet: false, stroke: 0 };
function playerTraces(dt) {
  const pos = camera.position;
  if (walker.x === null) (walker.x = pos.x), (walker.z = pos.z);
  const moved = Math.hypot(pos.x - walker.x, pos.z - walker.z);
  const water = controls.mode === 'walk' ? waterAt(pos.x, pos.z) : null;
  const feet = pos.y - controls.eyeHeight;
  const inWater = !!water && feet < water.level + 0.05;
  // Into the water from above: a big splash.
  if (inWater && !walker.wet && controls.velocityY < -3) {
    traces.splash(pos.x, water.level, pos.z, 30, 4, 2.2);
    sound.call('bigsplash', 0, 0.8);
  }
  walker.wet = inWater;
  if (controls.swimming) {
    walker.stroke -= dt;
    if (walker.stroke <= 0 && moved > 0.3) {
      walker.stroke = 0.7;
      traces.splash(pos.x, water ? water.level : pos.y, pos.z, 4, 1.3, 1.1);
      sound.call('splash', 0, 0.3);
    }
    if (moved > 0.3) (walker.x = pos.x), (walker.z = pos.z);
    return;
  }
  if (moved > 20) (walker.x = pos.x), (walker.z = pos.z); // (flown or teleported)
  if (controls.mode !== 'walk' || !controls.grounded || moved < 0.7) return;
  const heading = Math.atan2(pos.x - walker.x, pos.z - walker.z);
  walker.left = !walker.left;
  const side = walker.left ? 0.13 : -0.13;
  footfall(pos.x + Math.cos(heading) * side, pos.z - Math.sin(heading) * side, heading, PRINT.boot, 0.34, 0.6);
  walker.x = pos.x;
  walker.z = pos.z;
}
const ANIMAL_PRINTS = { deer: [PRINT.hoof, 0.11], bison: [PRINT.hoof, 0.17], blackBear: [PRINT.paw, 0.22], grizzly: [PRINT.paw, 0.26], rabbit: [PRINT.rabbit, 0.09] };

// Start somewhere with mountains in view: scan a few spots for a tall one.
function placeCamera() {
  let best = { x: 0, z: 0, h: -Infinity };
  for (let i = 0; i < 400; i++) {
    const x = (i % 20) * 160 - 1600;
    const z = Math.floor(i / 20) * 160 - 1600;
    const h = generator.getBaseHeight(x, z); // (the land before rivers: quick, and near enough)
    if (h > best.h) best = { x, z, h };
  }
  // Stand off to the south-east of the peak, looking at it.
  const x = best.x + 300;
  const z = best.z + 360;
  camera.position.set(x, Math.max(generator.getBaseHeight(x, z) + 50, 70), z);
  controls.lookAt(new THREE.Vector3(best.x, best.h * 0.5, best.z));
}

const controls = new PlayerControls(camera, canvas, {
  groundAt,
  seaLevel: WORLD.seaLevel,
  waterAt,
  collide: (position, radius) => {
    trees.collide(position, radius, WORLD.chunkSize);
    generator.caves.collide(position, radius, position.y - controls.eyeHeight);
  },
});
placeCamera();
const body = new PlayerBody(scene);
const torches = new Torches(scene);
torches.loadWorld(WORLD.seed);

// --- HUD -----------------------------------------------------------------------
const minimap = new Minimap(document.getElementById('minimap'));
minimap.worker = (message) => chunks.task(message); // redrawn off the main thread

// The big map (B): the country for kilometres round; click to fly there.
const bigMap = new BiomeMap({
  task: (message) => chunks.task(message),
  where: () => {
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    return { x: camera.position.x, z: camera.position.z, heading: Math.atan2(dir.x, -dir.z) };
  },
  teleport: (x, z) => {
    if (!ui.fly.checked) ui.fly.click();
    camera.position.set(x, Math.max(generator.getBaseHeight(x, z), WORLD.seaLevel) + 45, z);
  },
});
const ui = {
  seed: document.getElementById('seed'),
  seedForm: document.getElementById('seed-form'),
  randomSeed: document.getElementById('random-seed'),
  wireframe: document.getElementById('wireframe'),
  fly: document.getElementById('fly'),
  automove: document.getElementById('automove'),
  panel: document.querySelector('.panel'),
  fps: document.getElementById('stat-fps'),
  tris: document.getElementById('stat-tris'),
  draws: document.getElementById('stat-draws'),
  cpu: document.getElementById('stat-cpu'),
  chunks: document.getElementById('stat-chunks'),
  trees: document.getElementById('stat-trees'),
  wind: document.getElementById('stat-wind'),
  time: document.getElementById('time'),
  clock: document.getElementById('clock'),
  cycle: document.getElementById('cycle'),
  shadows: document.getElementById('shadows'),
  rays: document.getElementById('rays'),
  night: document.getElementById('night'),
  weather: document.getElementById('weather'),
  season: document.getElementById('season'),
  seasonAuto: document.querySelector('#season option[value=auto]'),
  weatherAuto: document.querySelector('#weather option[value=auto]'),
  sunset: document.getElementById('sunset'),
  sound: document.getElementById('sound'),
  mouseLock: document.getElementById('mouselock'),
  minimap: document.getElementById('minimap'),
  hotbar: document.getElementById('hotbar'),
  presets: document.querySelectorAll('[data-hour]'),
  alt: document.getElementById('stat-alt'),
  speed: document.getElementById('stat-speed'),
  biome: document.getElementById('stat-biome'),
  pos: document.getElementById('stat-pos'),
};
ui.seed.value = WORLD.seed;

function setSeed(seed) {
  WORLD.seed = seed;
  generator = new TerrainGenerator(seed, WORLD);
  chunks.setGenerator(generator);
  minimap.invalidate();
  torches.loadWorld(seed);
  wildlife.clear();
  fish.clear();
  fires.clear();
  volcanoes.clear();
  insects.clear();
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
// Weather, for testing: pin a kind of weather, or let it change by itself.
ui.weather.addEventListener('change', () => weather.set(ui.weather.value));
ui.sunset.addEventListener('change', () => weather.setSunset(ui.sunset.value));
ui.season.addEventListener('change', () => seasons.set(ui.season.value));
ui.sound.addEventListener('change', () => sound.setEnabled(ui.sound.checked));
// Holding the mouse in the middle of the screen (click, and look by moving
// it), or not (drag to look, click where you point).
ui.mouseLock?.addEventListener('change', () => controls.setMouseLock(ui.mouseLock.checked));
const WEATHER_ORDER = ['auto', ...Object.keys(WEATHER)];
ui.shadows.addEventListener('change', () => {
  dayNight.shadows = ui.shadows.checked;
});
ui.automove.addEventListener('change', () => {
  controls.autoMove = ui.automove.checked;
});
ui.fly.addEventListener('change', () => {
  const mode = ui.fly.checked ? 'fly' : 'walk';
  controls.setMode(mode);
});
window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement && e.target.type === 'text') return;
  // P (or F3) shows and hides everything on screen but the crosshair: the
  // panel, the minimap, the hotbar.
  if (e.code === 'KeyP' || e.code === 'F3') {
    e.preventDefault();
    const hide = !ui.panel.hidden;
    for (const el of [ui.panel, ui.minimap, ui.hotbar]) if (el) el.hidden = hide;
    return;
  }
  if (e.code === 'KeyX') ui.mouseLock?.click();
  if (e.code === 'KeyB') {
    if (document.pointerLockElement) document.exitPointerLock(); // (to point at the map)
    bigMap.toggle();
  }
  if (e.code === 'KeyV') ui.fly.click();
  if (e.code === 'KeyF') ui.automove.click();
  if (e.code === 'KeyG') ui.wireframe.click();
  if (e.code === 'KeyT') ui.cycle.click();
  if (e.code === 'KeyH') ui.shadows.click();
  if (e.code === 'KeyR') ui.rays.click();
  if (e.code === 'KeyN') ui.night.click();
  if (e.code === 'KeyM') ui.sound.click();
  if (e.code === 'KeyL') {
    const order = ['auto', '0', '1', '2', '3'];
    ui.season.value = order[(order.indexOf(ui.season.value) + 1) % order.length];
    seasons.set(ui.season.value);
  }
  if (e.code === 'KeyK') {
    ui.weather.value = WEATHER_ORDER[(WEATHER_ORDER.indexOf(ui.weather.value) + 1) % WEATHER_ORDER.length];
    weather.set(ui.weather.value);
  }
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
  press = { x: e.clientX, y: e.clientY, time: performance.now(), button: e.button, locked: controls.locked };
});
canvas.addEventListener('pointerup', (e) => {
  if (!press) return;
  if (press.locked) {
    // (The mouse held in the middle: the item goes where the crosshair is.)
    const r = canvas.getBoundingClientRect();
    useItem(r.left + r.width / 2, r.top + r.height / 2, press.button === 2 ? { id: 'pickup' } : hotbar.selected);
  } else if (controls.lockFailed || !controls.mouseLock || press.button === 2) {
    // (The click that takes hold of the mouse doesn't use the item too.)
    const quick = performance.now() - press.time < 400 && Math.hypot(e.clientX - press.x, e.clientY - press.y) < 6;
    if (quick) useItem(e.clientX, e.clientY, press.button === 2 ? { id: 'pickup' } : hotbar.selected);
  }
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
  const here = chunks.groundHeightAt(p.x, p.z);
  const underground = p.y < (Number.isFinite(here) ? here : generator.getBaseHeight(p.x, p.z)) - 1.5;
  const mouths = generator.caves.mouthsNear(p.x - 70, p.z - 70, p.x + 70, p.z + 70);
  const nearMouth = mouths.some((e) => Math.hypot(e.mouth.x - p.x, e.mouth.y - p.y, e.mouth.z - p.z) < 60);
  const surface = !underground || nearMouth;
  // Near a mouth you can see down the tunnel beyond it, so show all caves.
  chunks.setVisibility(surface, underground || nearMouth ? 'all' : 'mouths');
  clouds.group.visible = surface;
  farTrees.group.visible = surface;
  if (!surface) rain.mesh.visible = false;
  sheltered = underground;

  // Underground, a short dark haze replaces the sky: caves fade into darkness
  // rather than showing gaps where far-off tunnels aren't built yet.
  const toMouth = mouths.reduce((d, e) => Math.min(d, Math.hypot(e.mouth.x - p.x, e.mouth.y - p.y, e.mouth.z - p.z)), Infinity);
  caveHaze.target = underground && !ui.night.checked ? Math.min(1, Math.max(0, (toMouth - 4) / 16)) : 0;
}

let sheltered = false; // underground: no rain or lightning, sounds muffled

// Where the sun's (or moon's) shadow map reaches: only chunks there need
// sample it (see ChunkManager.setShadowVolume). A little bigger than the
// shadow camera's box, so nothing at its edge is ever missed as it moves.
const shadowFrustum = new THREE.Frustum();
const shadowMatrix = new THREE.Matrix4();
const shadowCheck = { wait: 0 };
function shadowReach(dt) {
  shadowCheck.wait -= dt;
  if (shadowCheck.wait > 0) return;
  shadowCheck.wait = 0.25;
  const light = dayNight.light;
  if (!light.castShadow || !renderer.shadowMap.enabled) {
    chunks.setShadowVolume(null);
    return;
  }
  const cam = light.shadow.camera.clone();
  cam.left *= 1.15; cam.right *= 1.15; cam.top *= 1.15; cam.bottom *= 1.15; cam.far += 100;
  light.updateMatrixWorld();
  light.target.updateMatrixWorld();
  cam.position.copy(light.position);
  cam.lookAt(light.target.position);
  cam.updateMatrixWorld();
  cam.updateProjectionMatrix();
  shadowFrustum.setFromProjectionMatrix(shadowMatrix.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
  chunks.setShadowVolume(shadowFrustum);
}

// How much the land under you has a cold winter (so snow rather than rain).
const cold = { value: 1, wait: 0 };
function coldHere(dt) {
  cold.wait -= dt;
  if (cold.wait <= 0) {
    cold.wait = 0.5;
    cold.target = generator.getSeasonality(camera.position.x, camera.position.z);
  }
  cold.value += ((cold.target ?? 1) - cold.value) * Math.min(1, dt / 3);
  return cold.value;
}

// What's around you, for the sounds of the place (see Sound.ambience):
// sampled every second from the land round about.
const around = { wait: 0, surf: { x: 0, z: 0 }, env: { woods: 0, jungle: 0, grass: 0, wetland: 0, ocean: 0, lava: 0, high: 0, snowy: 0, day: 1, dawn: 0, dusk: 0, wind: 0, rain: 0,
  exposure: 0, hollow: 0, canopy: 0, bare: 0, gust: 0, fall: 0, fallPan: 0, brook: 0, brookPan: 0, river: 0, riverPan: 0, surfPan: 0 } };
function surroundings(dt, snow) {
  const e = around.env;
  around.wait -= dt;
  if (around.wait <= 0) {
    around.wait = 1;
    const { x, z } = camera.position;
    let woods = 0, jungle = 0, grass = 0, wetland = 0, ocean = 0;
    const pts = [[0, 0], [60, 0], [-60, 0], [0, 60], [0, -60]];
    for (const [dx, dz] of pts) {
      const w = generator.getBiomeWeights(x + dx, z + dz, {});
      const forest = generator.getForestDensity(x + dx, z + dz);
      woods += (w.temperate * smoothstep(0.35, 0.7, forest) + w.blackHills * 0.7 + w.pine) / pts.length;
      grass += (w.temperate * (1 - smoothstep(0.35, 0.7, forest)) + w.savanna) / pts.length;
      jungle += w.jungle / pts.length;
      wetland += w.wetland / pts.length;
    }
    around.surf.x = around.surf.z = 0;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      for (const d of [40, 120]) {
        const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
        if (generator.getBaseHeight(px, pz) < WORLD.seaLevel - 0.5 && generator.getOceanness(px, pz) > 0.5) {
          ocean = Math.max(ocean, d < 100 ? 1 : 0.6);
          around.surf.x += Math.cos(a) / d; // (which way the sea is)
          around.surf.z += Math.sin(a) / d;
        }
      }
    }
    // The lie of the land: up on a ridge or a peak (the wind blows harder
    // and whistles), or down in a valley or a canyon (hushed).
    const here = generator.getBaseHeight(x, z);
    let ring = 0;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      for (const d of [120, 300]) ring += generator.getBaseHeight(x + Math.cos(a) * d, z + Math.sin(a) * d) / 16;
    }
    const above = camera.position.y - here;
    Object.assign(e, {
      woods, jungle, grass, wetland, ocean: ocean * (1 - smoothstep(30, 90, camera.position.y - WORLD.seaLevel)), lava: heat.lava,
      exposure: smoothstep(4, 40, here - ring) * (1 - smoothstep(40, 150, above)),
      hollow: smoothstep(4, 40, ring - here) * (1 - smoothstep(15, 80, above)),
      canopy: Math.min(1, woods + jungle) * (1 - smoothstep(12, 50, above)),
    });
  }
  const sun = dayNight.sunDir.y;
  e.day = smoothstep(-0.05, 0.12, sun);
  e.dawn = dayNight.hour < 12 ? smoothstep(-0.08, 0.02, sun) * (1 - smoothstep(0.12, 0.3, sun)) : 0;
  e.dusk = dayNight.hour > 12 ? (1 - smoothstep(0.02, 0.2, sun)) * smoothstep(-0.35, -0.1, sun) : 0;
  e.high = smoothstep(90, 220, camera.position.y);
  e.snowy = Math.max(snow, seasonUniforms.uSnowfall.value * 0.7);
  e.wind = Math.min(1, windStrength.value / 1.6);
  e.rain = weather.rain;
  e.bare = seasonUniforms.uWinter.value;
  e.gust = gustAt(camera.position.x, camera.position.z);
  e.surfPan = around.surf.x || around.surf.z ? panTowards(camera, camera.position.x + around.surf.x * 1e4, camera.position.z + around.surf.z * 1e4) : 0;
  waterSounds(dt, e);
  return e;
}

// Running water near you, for its sound: the waterfalls and the nearest
// stretch of each stream and river, looked up now and then by a chunk
// worker (which knows the rivers); how loud each is, and from which side,
// worked out every frame as you move.
const waterNear = { wait: 0, busy: false, falls: [], runs: [] };
function waterSounds(dt, e) {
  waterNear.wait -= dt;
  const p = camera.position;
  if (waterNear.wait <= 0 && !waterNear.busy && !sheltered) {
    waterNear.wait = 1.5;
    waterNear.busy = true;
    chunks
      .task({ kind: 'waterSounds', x: p.x, z: p.z })
      .then((r) => Object.assign(waterNear, r))
      .catch(() => {})
      .finally(() => (waterNear.busy = false));
  }
  let fall = 0, fallPan = 0, brook = 0, brookPan = 0, river = 0, riverPan = 0;
  for (const f of waterNear.falls) {
    const d = Math.hypot(f.x - p.x, (f.y - p.y) * 0.7, f.z - p.z);
    const v = Math.min(1, 0.35 + f.drop / 10 + f.width / 12) / (1 + (d / (10 + f.drop * 2)) ** 2);
    fall += v;
    fallPan += v * panTowards(camera, f.x, f.z);
  }
  for (const r of waterNear.runs) {
    const d = Math.hypot(r.x - p.x, (r.y - p.y) * 0.7, r.z - p.z);
    if (r.stream && r.width < 6) {
      const v = (0.35 + Math.min(0.65, r.steep * 5)) / (1 + (d / 10) ** 2);
      brook += v;
      brookPan += v * panTowards(camera, r.x, r.z);
    } else {
      const v = Math.min(1, 0.3 + r.width / 10) / (1 + (d / 22) ** 2);
      river += v;
      riverPan += v * panTowards(camera, r.x, r.z);
    }
  }
  Object.assign(e, {
    fall: Math.min(1, fall), fallPan: fall ? fallPan / fall : 0,
    brook: Math.min(1, brook), brookPan: brook ? brookPan / brook : 0,
    river: Math.min(1, river), riverPan: river ? riverPan / river : 0,
  });
}

// Heat haze: in the desert and the dune seas, in the heat of a clear
// summer day, the air shimmers off the sand (see RayEffects). (Also keeps
// track of how near molten lava is, for its sound.)
const heat = { wait: 0, hot: 0, lava: 0, value: 0 };
function heatHaze(dt) {
  heat.wait -= dt;
  if (heat.wait <= 0) {
    heat.wait = 0.5;
    const { x, z } = camera.position;
    heat.hot = smoothstep(0.4, 0.8, generator.getBiomeWeights(x, z, {}).desert);
    heat.lava = 0;
    for (const c of generator.volcanoes?.(x - 400, z - 400, x + 400, z + 400) ?? []) {
      if (c.lava) heat.lava = Math.max(heat.lava, 1 - Math.hypot(c.x - x, c.z - z) / 400);
    }
  }
  const midday = smoothstep(0.25, 0.65, dayNight.sunDir.y);
  const sunny = (1 - smoothstep(0.4, 0.8, weather.cover)) * (1 - weather.rain);
  const low = 1 - smoothstep(60, 160, camera.position.y); // (not from high above)
  const target = sheltered ? 0 : heat.hot * midday * sunny * low * (1 - seasonUniforms.uWinter.value) * (1 - 0.5 * seasonUniforms.uAutumn.value);
  heat.value += (target - heat.value) * Math.min(1, dt / 3);
  return heat.value;
}

// Weather you can see coming: rain hanging under the clouds that bring it
// (see Showers), and before a storm, lightning flickering inside it far
// off, the thunder a long, low rumble arriving seconds later.
const showers = new Showers(scene, clouds);
const far = { wait: 3 };
function farLightning(dt) {
  showers.flash = Math.max(0, showers.flash - dt * 6);
  const storm = weather.approaching.storm;
  if (storm > 0.1 && !sheltered) {
    far.wait -= dt * storm;
    if (far.wait <= 0) {
      far.wait = 2 + Math.random() * 7;
      const s = showers.pick(camera.position);
      if (s) {
        showers.flash = 1;
        showers.flashAt = s;
        const d = Math.hypot(s.x - camera.position.x, s.z - camera.position.z);
        setTimeout(() => sound.thunder(d, panTowards(camera, s.x, s.z)), (d / 343) * 1000);
      }
    }
  }
  dayNight.flash = Math.max(dayNight.flash, showers.flash * 0.12);
}

// A rainbow: as the rain clears, with the sun out and not too high, for a
// minute or so.
const bow = { rained: 0, value: 0 };
function afterRain(dt) {
  if (weather.rain > 0.3) bow.rained = 1;
  else bow.rained = Math.max(0, bow.rained - dt / 90);
  const sunUp = dayNight.sunDir.y;
  const clearing = weather.rain < 0.12 && weather.cover < 0.93 && seasonUniforms.uWinter.value < 0.6;
  const target = bow.rained > 0 && clearing && sunUp > 0.03 && sunUp < 0.65 ? Math.min(1, bow.rained * 1.5) * (1 - smoothstep(0.45, 0.65, sunUp)) : 0;
  bow.value += (target - bow.value) * Math.min(1, dt / 6);
  dayNight.rainbow = sheltered ? 0 : bow.value;
}

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// The northern lights: out on every clear winter night, and on about one
// night in three the rest of the year; strongest over cold, snowy country
// and high up.
const aurora = { value: 0 };
function northernLights(dt) {
  const winter = seasonUniforms.uWinter.value;
  const h = Math.sin(dayNight.day * 12.9898 + 4.1) * 43758.5453;
  const tonight = winter > 0.5 || h - Math.floor(h) < 0.35;
  const high = THREE.MathUtils.smoothstep(camera.position.y, 110, 220);
  const target = tonight ? Math.min(1, (0.55 + 0.45 * winter) * (0.6 + 0.4 * Math.max(cold.value, high))) : 0;
  aurora.value += ((aurora.force ?? target) - aurora.value) * Math.min(1, dt / 8);
  dayNight.aurora = aurora.value;
}

// Morning fog: on most mornings mist lies over the low country and in
// the valleys, thickest around sunrise and burnt off by mid-morning (fly
// up out of it); thinner over dry land, and always there over the
// wetlands.
const MIST = new THREE.Color(0xdfe5e8);
const mistState = { marsh: 0, dry: 0, wait: 0, value: 0, day: 0, lastHour: 0 };
function marshMist(dt) {
  mistState.wait -= dt;
  if (mistState.wait <= 0) {
    mistState.wait = 0.5;
    const p = camera.position;
    const w = generator.getBiomeWeights(p.x, p.z, {});
    mistState.marsh = sheltered ? 0 : w.wetland;
    mistState.dry = w.desert + 0.5 * w.savanna;
    mistState.desert = w.desert;
    mistState.mossy = Math.min(1, 0.55 * w.temperate + 0.9 * w.pine + w.jungle + w.wetland);
  }
  // (Moss on the trees in damp country round about.)
  seasonUniforms.uMossy.value += ((mistState.mossy ?? 0) - seasonUniforms.uMossy.value) * Math.min(1, dt / 4);
  const h = dayNight.hour;
  if (h < mistState.lastHour - 12) mistState.day++;
  mistState.lastHour = h;
  // Each morning is foggy or not (about three in five are).
  const roll = Math.abs(Math.sin(mistState.day * 12.9898 + 0.2) * 43758.5453) % 1;
  const foggy = roll < 0.6 ? 0.45 + roll * 0.6 : 0;
  const dawn = smooth(4.3, 5.8, h) * (1 - smooth(8, 9.8, h));
  const low = 1 - smooth(20, 90, camera.position.y);
  const target = mistState.marsh * low * dawn;
  mistState.value += (target - mistState.value) * Math.min(1, dt / 2);
  valleyMist(dt, foggy * dawn * (1 - 0.8 * mistState.dry));
  return mistState.value < 0.002 ? 0 : mistState.value;
}

// Mist in the valleys on a still morning: a layer lying over the low
// ground round about, some ten metres deep (see addCloudShadow), thicker
// in spring and autumn and after rain, thinned by the wind, burning off
// as the morning goes on.
const valley = { floor: null, wait: 0, amount: 0 };
function valleyMist(dt, morning) {
  valley.wait -= dt;
  if (valley.wait <= 0) {
    valley.wait = 2;
    const p = camera.position;
    // (The low ground: the lowest fifth of the land round about.)
    const heights = [];
    for (const r of [0, 120, 260, 450]) {
      for (let k = 0; k < (r ? 12 : 1); k++) {
        const a = (k / 12) * Math.PI * 2;
        const h = chunks.groundHeightAt(p.x + Math.cos(a) * r, p.z + Math.sin(a) * r);
        if (Number.isFinite(h)) heights.push(Math.max(h, WORLD.seaLevel));
      }
    }
    if (heights.length > 8) valley.target = heights.sort((a, b) => a - b)[Math.floor(heights.length * 0.2)];
  }
  if (valley.target !== undefined) valley.floor = valley.floor === null ? valley.target : valley.floor + (valley.target - valley.floor) * Math.min(1, dt / 8);
  const s = seasonUniforms;
  const damp = 1 + 0.5 * (s.uSpring.value + s.uAutumn.value) + 0.6 * s.uWet.value;
  const calm = 1 - 0.75 * smooth(0.3, 0.8, windStrength.value);
  const target = sheltered ? 0 : Math.min(0.85, morning * damp * calm);
  valley.amount += (target - valley.amount) * Math.min(1, dt / 3);
  cloudShadowUniforms.uMist.value = valley.amount;
  cloudShadowUniforms.uMistTop.value = (valley.floor ?? 0) + 10 + 6 * valley.amount;
  cloudShadowUniforms.uMistColor.value.copy(scene.fog.color).lerp(MIST_WHITE, 0.35);
}
const MIST_WHITE = new THREE.Color(0xf2f4f5);
function smooth(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
const caveHaze = { target: 0, amount: 0, color: new THREE.Color(0x07080b) };
const openFog = { near: scene.fog.near, far: scene.fog.far };
// Under the water: a murky blue-green haze closing in (darker at night and
// in the depths), the sky gone, the sounds muffled.
const UNDERWATER = new THREE.Color(0x14505c);
let underwater = false;
function applyUnderwater() {
  const w = sheltered ? null : waterAt(camera.position.x, camera.position.z);
  underwater = !!w && camera.position.y < w.level - 0.02;
  if (!underwater) {
    scene.background = null;
    return;
  }
  const depth = w.level - camera.position.y;
  const light = (0.25 + 0.75 * smoothstep(-0.1, 0.3, dayNight.sunDir.y)) * (1 - 0.5 * smoothstep(2, 25, depth));
  scene.fog.color.copy(UNDERWATER).multiplyScalar(light);
  scene.fog.near = 0.5;
  scene.fog.far = 38 - 14 * smoothstep(5, 30, depth);
  dayNight.sky.visible = false;
  scene.background = scene.fog.color;
}

// In a sandstorm the air is thick with dust: the view closes right in, all
// a brown haze, the sun gone.
const SAND = new THREE.Color(0xb89a6a);
function applySandstorm() {
  const a = sandstorm.amount;
  if (a < 0.001 || underwater || sheltered) return;
  const lum = Math.min(1, 0.3 + 0.7 * Math.min(1, dayNight.light.intensity / 2 + dayNight.hemi.intensity / 3));
  scene.fog.color.lerp(printColour.copy(SAND).multiplyScalar(lum), a);
  scene.fog.near += (1 - scene.fog.near) * a;
  scene.fog.far += (55 - scene.fog.far) * a;
  if (a > 0.85) {
    dayNight.sky.visible = false;
    scene.background = scene.fog.color;
  }
}

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
const PIXEL_RATIO = Math.min(window.devicePixelRatio, 1.5);

function resize() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  renderer.setPixelRatio(PIXEL_RATIO);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  rayEffects.setSize();
}
window.addEventListener('resize', resize);
resize();

let lastTime = performance.now();
// What the clouds need to know about the sky each frame.
const cloudSky = { cover: 0, storm: 0, glowColor: dayNight.glowColor, get glowStrength() { return dayNight.glowStrength; }, sunDir: dayNight.sunDir, viewMatrix: null,
  lightDir: dayNight.lightDirection, get lightStrength() { return dayNight.light.intensity / 2.2; } };
const dir = new THREE.Vector3();
let frames = 0;
let fpsTime = 0;

let cpuTime = 0;
renderer.info.autoReset = false; // (counted over the whole frame: see tick)

function tick(now) {
  const started = performance.now();
  renderer.info.reset();
  const elapsed = (now - lastTime) / 1000;
  const dt = Math.min(elapsed, 0.1); // big hitches shouldn't teleport the player
  lastTime = now;
  controls.update(dt);
  playerTraces(dt);
  camera.getWorldDirection(dir);
  chunks.update(camera.position, now / 1000, dir);
  weather.spring = seasonUniforms.uSpring.value;
  weather.update(dt, dayNight.hour);
  const wind = updateWind(now / 1000, 0.95 * weather.storm + 0.35 * weather.rain);
  // (Where a bolt strikes, far off: the land before rivers, which is quick to work out.)
  lightning.update(dt, weather.storm, camera, dayNight, (x, z) => generator.getBaseHeight(x, z), sound, sheltered);
  farLightning(dt);
  afterRain(dt);
  dayNight.viewDir = dir;
  dayNight.update(dt, camera.position, weather);
  // The ground gets wet in the rain (puddles), and dries off over a few minutes.
  seasonUniforms.uWet.value = Math.min(1, Math.max(0, seasonUniforms.uWet.value + (weather.rain > 0.2 ? dt / 20 : -dt / 240)));
  // Snow lies over everything after a snowfall, and stays: through the
  // depth of winter it doesn't melt at all; only in the sunshine early and
  // late in the winter (and for good once it's spring).
  const winterNow = seasonUniforms.uWinter.value;
  const snowing = weather.rain > 0.2 && winterNow > 0.5;
  const sunshine = smooth(0.05, 0.25, dayNight.sunDir.y) * (1 - smooth(0.5, 0.8, weather.cover)) * (weather.rain > 0.05 ? 0 : 1);
  const thaw = sunshine * (1 - smooth(0.6, 0.9, winterNow)) / 240 + (winterNow < 0.05 ? 1 / 120 : 0);
  seasonUniforms.uSnowfall.value = Math.min(1, Math.max(0, seasonUniforms.uSnowfall.value + (snowing ? dt / 60 : -dt * thaw)));
  shadowReach(dt);
  northernLights(dt);
  // Rain closes the view in, and so does the mist that lies over the
  // wetlands at dawn.
  const mist = marshMist(dt);
  scene.fog.near = openFog.near * (1 - 0.75 * weather.rain) * (1 - 0.85 * mist);
  scene.fog.far = openFog.far * (1 - 0.5 * weather.rain) * (1 - 0.75 * mist);
  if (mist > 0) scene.fog.color.lerp(MIST, 0.45 * mist);
  dayNight.sky.visible = true;
  applyCaveHaze(dt);
  applyUnderwater();
  applySandstorm();
  cloudSky.cover = weather.cover;
  cloudSky.storm = weather.storm;
  cloudSky.weather = weather;
  cloudSky.viewMatrix = camera.matrixWorldInverse;
  clouds.update(dt, camera.position, dayNight.horizon, generator, wind, cloudSky);
  showers.update(dt, camera, clouds.wind, wind, dayNight.horizon, scene.fog);
  seasons.update(dayNight.playing ? dt / (WORLD.dayLengthMinutes * 60) : 0, dt);
  // In a cold winter, it snows (over the lands that have one).
  const snow = seasonUniforms.uWinter.value * coldHere(dt);
  rain.update(now / 1000, camera.position, weather.rain, clouds.wind, wind, dayNight.horizon, snow);
  // Water: the sun's glitter on it (not behind cloud), rings where the rain falls; the waterfalls' mist in the daylight.
  sparkleUniforms.uSunView.value.copy(dayNight.lightDirection).transformDirection(camera.matrixWorldInverse);
  sparkleUniforms.uSunColor.value.copy(dayNight.light.color);
  sparkleUniforms.uGlitter.value = Math.min(1, dayNight.light.intensity / 2.2) * (1 - smoothstep(0.55, 0.85, weather.cover)) * (1 - weather.rain);
  sparkleUniforms.uRainfall.value = weather.rain * (1 - snow);
  mistLight.value = 0.2 + 0.8 * smoothstep(-0.1, 0.25, dayNight.sunDir.y);
  // Leaves drifting down from the trees round about.
  const autumn = seasonUniforms.uAutumn.value, spring = seasonUniforms.uSpring.value, winter = seasonUniforms.uWinter.value;
  fallingLeaves.update(dt, camera, trees.crowns, WORLD.chunkSize, (x, z) => chunks.groundHeightAt(x, z), { autumn, spring, winter, summer: Math.max(0, 1 - autumn - spring - winter) }, wind, windDirection.value, sheltered);
  body.update(controls, dt);
  torches.update(now / 1000, camera.position);
  updateVisibility();
  const haze = heatHaze(dt);
  sound.update(underwater ? 0 : weather.rain * (1 - snow), sheltered || underwater);
  const env = surroundings(dt, snow);
  // The wildlife round you.
  const life = {
    waterAt: (x, z) => waterAt(x, z),
    step: (a, x, z, running) => {
      const [shape, size] = ANIMAL_PRINTS[a.kind] ?? [PRINT.hoof, 0.12];
      footfall(x, z, a.heading, shape, size * a.scale, running ? 1 : 0.35);
    },
    camera, forward: dir, generator, ground: (x, z) => chunks.groundHeightAt(x, z), trees, rocks, chunkSize: WORLD.chunkSize, seaLevel: WORLD.seaLevel, seed: generator.seed,
    day: env.day, dawn: env.dawn, dusk: env.dusk, night: 1 - env.day, winter, spring, summer: Math.max(0, 1 - autumn - spring - winter),
    rain: weather.rain, wind, windDir: windDirection.value, meadow: Math.min(1, env.grass + env.wetland + 0.3 * env.woods),
    sheltered, sound, pan: (x, z) => panTowards(camera, x, z), tame: WORLD.tameWildlife,
  };
  wildlife.update(dt, life);
  fish.update(dt, { ...life, traces, autumn, ground: (x, z) => chunks.groundHeightAt(x, z) });
  traces.update(dt);
  // Fire, smoke and dust, lit by the light of the sky.
  ambientLight.copy(scene.fog.color).lerp(MIST_WHITE, 0.25).multiplyScalar(0.6 + 0.5 * Math.min(1, dayNight.light.intensity / 2));
  const night = dayNight._w?.night ?? 0;
  const air = { time: now / 1000, camera, generator, wind: clouds.wind, rain: weather.rain, light: ambientLight, night, sound, pan: (x, z) => panTowards(camera, x, z), ground: (x, z) => generator.getBaseHeight(x, z) };
  fires.update(dt, air);
  volcanoes.update(dt, air);
  sandstorm.update(dt, { ...air, desert: sheltered ? 0 : mistState.desert ?? 0, ground: (x, z) => chunks.groundHeightAt(x, z) || camera.position.y });
  shootingStars.update(dt, camera, sheltered || underwater ? 0 : (dayNight._w?.night ?? 0) * (1 - smooth(0.3, 0.6, weather.cover)));
  insects.update(dt, life);
  env.buzz = insects.buzz.level;
  env.buzzPan = insects.buzz.pan;
  sound.ambience(env);
  // (The ground trembles as a volcano rumbles.)
  const tremble = volcanoes.shake > 0 && !controls.swimming ? Math.sin(now * 0.05) * 0.07 * volcanoes.shake : 0;
  camera.position.y += tremble;
  camera.updateMatrixWorld();
  if (ui.rays.checked) {
    light.strength = dayNight.lightStrength;
    light.reach = dayNight.shaftReach;
    light.haze = haze;
    rayEffects.render(scene, camera, light);
  } else {
    renderer.render(scene, camera);
  }

  camera.position.y -= tremble;
  minimap.update(generator, camera.position, Math.atan2(dir.x, -dir.z), WORLD.seaLevel);

  frames++;
  fpsTime += elapsed;
  cpuTime += performance.now() - started;
  if (fpsTime >= 0.5) {
    const fps = frames / fpsTime;
    ui.fps.textContent = Math.round(fps);
    // (How long the frame's own work takes, and how much it draws (shadows
    // included): with a low FPS, a low CPU time means the graphics card is
    // the limit.)
    ui.cpu.textContent = `${(cpuTime / frames).toFixed(1)} ms`;
    ui.draws.textContent = renderer.info.render.calls;
    const tris = renderer.info.render.triangles;
    ui.tris.textContent = tris >= 1e6 ? `${(tris / 1e6).toFixed(1)}M` : `${Math.round(tris / 1e3)}k`;
    cpuTime = 0;
    frames = 0;
    fpsTime = 0;
    ui.chunks.textContent = chunks.pendingCount
      ? `${chunks.loadedCount} +${chunks.pendingCount}`
      : `${chunks.loadedCount}`;
    ui.trees.textContent = `${((trees.count + farTrees.count) / 1000).toFixed(1)}k`;
    ui.wind.textContent = describeWind(wind);
    ui.weatherAuto.textContent = `Auto · ${weather.label}`;
    ui.seasonAuto.textContent = `Auto · ${seasons.name}`;
    ui.clock.textContent = dayNight.clock;
    if (document.activeElement !== ui.time) ui.time.value = dayNight.hour.toFixed(2);
    ui.alt.textContent = `${Math.round(camera.position.y)} m`;
    // (Where you are, so a screenshot says where to look.)
    if (ui.pos) ui.pos.textContent = `x ${Math.round(camera.position.x)} · z ${Math.round(camera.position.z)}`;
    ui.speed.textContent = `${Math.round(controls.currentSpeed)} m/s`;
    // (Worked out by a chunk worker, which knows the rivers already: the
    // main thread never has to.)
    if (sheltered) ui.biome.textContent = 'Cave';
    else if (!describing) {
      describing = true;
      const { x, z } = camera.position;
      chunks
        .task({ kind: 'describe', x, z })
        .catch(() => generator.describe(x, z))
        .then((label) => {
          if (!sheltered) ui.biome.textContent = label;
        })
        .finally(() => (describing = false));
    }
  }
  requestAnimationFrame(tick);
}
let describing = false;
requestAnimationFrame(tick);

// Exposed for tinkering from the dev console.
window.world = { THREE, traces, fish, fires, volcanoes, sandstorm, renderer, scene, camera, chunks, farTrees, trees, fallingLeaves, cloudShadowUniforms, wildlife, insects, water, rivers, controls, dayNight, clouds, weather, seasons, rain, lightning, sound, showers, aurora, bow, rayEffects, torches, hotbar, groundAt, get generator() { return generator; }, WORLD };
