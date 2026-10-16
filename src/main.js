import * as THREE from 'three';
import './render/splitShadow.js'; // (first: the sun's shadow in two maps, before any material copies the shader code)
import { WORLD } from './config.js';
import { TerrainGenerator } from './world/TerrainGenerator.js';
import { ChunkManager } from './world/ChunkManager.js';
import { createWaterLayer } from './world/layers/WaterLayer.js';
import { createTreeLayer } from './world/layers/TreeLayer.js';
import { createGrassLayer, grassClearings, grassPushers } from './world/layers/GrassLayer.js';
import { Geese } from './render/Geese.js';
import { createWreckLayer } from './world/layers/WreckLayer.js';
import { addTilledSoil, paintTilled, tilledOrigin } from './render/tilledSoil.js';
import { GrassCut } from './render/grassCut.js';
import { CaveSpiders } from './wildlife/CaveSpiders.js';
import { fellShroom, pickShroom, shroomsCut } from './world/layers/CaveLayer.js';
import { caveFocus, caveGlowLights, caveNightVision, createCaveLayer, roostFlocks, updateCaveLife } from './world/layers/CaveLayer.js';
import { endLife, StartMenu, rememberWorld } from './ui/StartMenu.js';
import { createRockLayer } from './world/layers/RockLayer.js';
import { createRuinLayer } from './world/layers/RuinLayer.js';
import { createEntranceLayer } from './world/layers/EntranceLayer.js';
import { createRiverLayer, mistLight } from './world/layers/RiverLayer.js';
import { createReedLayer } from './world/layers/ReedLayer.js';
import { createLilyLayer } from './world/layers/LilyLayer.js';
import { createVentLayer } from './world/layers/VentLayer.js';
import { createGeyserLayer } from './world/layers/GeyserLayer.js';
import { createCoralLayer } from './world/layers/CoralLayer.js';
import { createLeafLayer } from './world/layers/LeafLayer.js';
import { createMushroomLayer } from './world/layers/MushroomLayer.js';
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
import { Game } from './survival/Game.js';
import { ITEMS, RECIPES } from './survival/items.js';
import { PlayerControls } from './controls/PlayerControls.js';
import { PlayerBody } from './player/PlayerBody.js';
import { DayNight } from './render/DayNight.js';
import { RayEffects } from './render/RayEffects.js';
import { Clouds } from './world/Clouds.js';
import { Weather, WEATHER } from './render/Weather.js';
import { Tornadoes } from './render/Tornado.js';
import { Landmarks } from './world/Landmarks.js';
import { MineProps } from './world/caves/MineProps.js';
import { Lightning, panTowards, Rain } from './render/Storm.js';
import { Sound } from './render/Sound.js';
import { Showers } from './render/Showers.js';
import { PRINT, Traces } from './render/Traces.js';
import { Fish } from './wildlife/Fish.js';
import { ShootingStars } from './render/ShootingStars.js';
import { DustDevils, Sandstorm, Volcanoes, Wildfires } from './render/Phenomena.js';
import { Seasons, seasonalTerrain, seasonUniforms } from './render/Seasons.js';
import { describeWind, gustAt, updateWind, windDirection, windStrength } from './render/wind.js';
import { FallingLeaves } from './render/FallingLeaves.js';
import { Wildlife } from './wildlife/Wildlife.js';
import { Insects } from './wildlife/Insects.js';
import { sparkleUniforms } from './render/waterSparkle.js';
import { addCloudShadow, cloudShadowUniforms } from './render/cloudShadow.js';
import { Minimap } from './ui/Minimap.js';
import { BiomeMap } from './ui/BiomeMap.js';
import { Multiplayer, Remote, packFlags } from './net/Multiplayer.js';
import { WorldSync } from './net/WorldSync.js';
import { applyQuality, MAX_VIEW } from './quality.js';

// --- Renderer, scene, camera -------------------------------------------------
// (How much to ask of this computer: see quality.js, chosen on the start menu.)
let QUALITY = applyQuality();
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: QUALITY.antialias, powerPreference: 'high-performance' }); // (the strong graphics chip, on a laptop with two)
renderer.shadowMap.enabled = true;
// The solid things close round you (within 60 m) drawn first, then the
// rest (and in each, those sharing a material together, nearest first):
// what's behind the near ground and trees is then mostly found hidden
// before its colour is worked out, not painted over. (three.js's own order
// puts the material first: trees far off before the ground at your feet.)
const nearFirst = (a, b) => {
  if (a.groupOrder !== b.groupOrder) return a.groupOrder - b.groupOrder;
  if (a.renderOrder !== b.renderOrder) return a.renderOrder - b.renderOrder;
  const ba = a.z < 60 ? 0 : 1, bb = b.z < 60 ? 0 : 1;
  if (ba !== bb) return ba - bb;
  if (a.material.id !== b.material.id) return a.material.id - b.material.id;
  if (a.z !== b.z) return a.z - b.z;
  return a.id - b.id;
};
renderer.setOpaqueSort(nearFirst);
renderer.__sort = nearFirst; // (for tools/_abbench.mjs, to time it against three.js's own order)
renderer.shadowMap.type = THREE.PCFShadowMap;
// (The soft edge of a shadow is sampled in the same pattern everywhere, not
// turned by a noise from pixel to pixel: that noise wants a frame-blending
// pass to smooth it, which this game doesn't have, and without one the
// edges look grainy and shimmer as you move.)
THREE.ShaderChunk.shadowmap_pars_fragment = THREE.ShaderChunk.shadowmap_pars_fragment.replaceAll('float phi = interleavedGradientNoise( gl_FragCoord.xy ) * PI2;', 'float phi = 0.7;');
// Shadows fade out over the outer edge of the sun's shadow map, rather
// than stopping on a line across the land.
THREE.ShaderChunk.shadowmap_pars_fragment = THREE.ShaderChunk.shadowmap_pars_fragment.replaceAll(
  '\t\t\treturn mix( 1.0, shadow, shadowIntensity );',
  '\t\t\tvec2 shadowEdge = abs( shadowCoord.xy * 2.0 - 1.0 );\n\t\t\treturn mix( 1.0, shadow, shadowIntensity * ( 1.0 - smoothstep( 0.78, 0.97, max( shadowEdge.x, shadowEdge.y ) ) ) );',
);

const scene = new THREE.Scene();
// Playing together (see net/Multiplayer and server/server.mjs): the others
// in your world, and the world's code and how many are here, up top.
const mp = new Multiplayer(scene);
const mpBadge = document.createElement('div');
mpBadge.className = 'mp-badge';
mpBadge.hidden = true;
document.body.append(mpBadge);
mp.onChange = () => {
  mpBadge.hidden = !mp.connected;
  if (mp.connected) mpBadge.textContent = `Online · ${mp.code} · ${mp.count} ${mp.count === 1 ? 'player' : 'players'}${mp.warning ? ' · ⚠ ' + mp.warning : ''}`;
  mpBadge.classList.toggle('warn', !!mp.warning);
};
mp.onHour = (hour) => {
  dayNight.hour = hour;
};
// (The sky and the camera's reach made for the furthest view; the fog is set for the chosen one: see useQuality.)
const drawDistance = MAX_VIEW * WORLD.chunkSize;
const viewDistance = () => WORLD.viewDistance * WORLD.chunkSize;
scene.fog = new THREE.Fog(0xd6e8f7, viewDistance() * 0.45, viewDistance() * 0.95);

const camera = new THREE.PerspectiveCamera(60, 1, 0.3, drawDistance * 1.5);
scene.add(camera); // (so what you hold, drawn in front of you, is in the scene)

// Sky dome, sun, moon, stars, lighting and shadows, driven by the time of day.
const dayNight = new DayNight(scene, WORLD, drawDistance * 1.2);
// The sun sets on the horizon you can see (lower, from up high): the land
// out to where the fog hides it, or the sea.
dayNight.groundAt = (x, z) => Math.max(generator.getBaseHeight(x, z), WORLD.seaLevel);
dayNight.horizonDistance = viewDistance() * 0.9;
const clouds = new Clouds(scene);
windDirection.value.set(clouds.wind.x, clouds.wind.z).normalize(); // (the gusts roll the way the clouds drift)
// The weather: cloud cover, rain and thunderstorms, changing by itself.
const weather = new Weather('fair');
const rain = new Rain(scene);
const lightning = new Lightning(scene);
const tornadoes = new Tornadoes(scene);
// (Online: the host's tornado goes out with the weather; the others draw it where it is: see Weather.toSky.)
weather.tornado = () => tornadoes.toJSON();
weather.onTornado = (j) => tornadoes.follow(j);
const sound = new Sound();
sound.hearing = (x, z) => hearing(x, z); // (the land between you and a sound: see hearing)

// Ray-marched ambient occlusion and light shafts, drawn after the scene.
const rayEffects = new RayEffects(renderer);
const light = { direction: dayNight.shaftDirection, color: dayNight.shaftColor, strength: 1, reach: 1.6 };

// --- Terrain -----------------------------------------------------------------
// Double-sided so that, from inside a cave, a lip of ground overhanging the
// mouth shows as ground rather than letting the sky through.
const terrainMaterial = addTilledSoil(seasonalTerrain(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), WORLD.seaLevel));
// The seasons turn over every few game days (see Seasons).
const seasons = new Seasons(WORLD.daysPerSeason, WORLD.seasonTurnDays);
// A heightfield has no back faces, so render its front faces into the shadow map.
terrainMaterial.shadowSide = THREE.FrontSide;
// For testing (and for sharing a spot): ?seed=…&x=…&z=…&y=…&yaw=…&pitch=…
// &hour=…&vd=… (view distance, chunks)&hide (no panels)&season=0..3&weather=…
const TEST = new URLSearchParams(location.search);
// (A test address: one of the game's own settings in it, which goes straight
// into a world, without the title screen. Anything else in the address,
// put there by wherever the game's hosted, is no business of the game's.)
const TESTING = ['seed', 'x', 'z', 'y', 'up', 'yaw', 'pitch', 'hour', 'vd', 'mp', 'hide', 'loadscreen', 'weather', 'season', 'noocclude', 'norugged'].some((k) => TEST.has(k));
if (TEST.get('seed')) WORLD.seed = TEST.get('seed');
if (TEST.get('vd')) WORLD.viewDistance = +TEST.get('vd');
let generator = new TerrainGenerator(WORLD.seed, WORLD);
const chunks = new ChunkManager(scene, generator, WORLD, terrainMaterial);
const water = createWaterLayer({ skyColor: dayNight.horizon, skyTop: dayNight.top });
const rocks = createRockLayer(WORLD);
const trees = createTreeLayer({ rocks });
const grass = createGrassLayer(WORLD);
const farGrass = createGrassLayer(WORLD, { far: true });
chunks.addLayer(water);
const rivers = createRiverLayer(dayNight.horizon, dayNight.top);
// Leaves drifting down from the trees round about (see FallingLeaves).
const fallingLeaves = new FallingLeaves(scene);
// The animals (deer, bison, rabbits, birds), and the bees, their nests and the fireflies.
const wildlife = new Wildlife(scene, addCloudShadow);
// (One of yours taken by a hunter: you're told, wherever you are.)
wildlife.onLivestock = (b, a) => {
  const names = { sheep: 'sheep', turkey: 'turkey', duck: 'duck', horse: 'horse', donkey: 'donkey', mule: 'mule' };
  const by = { wolf: 'wolves', coyote: 'a coyote', fox: 'a fox', cougar: 'a cougar', grizzly: 'a bear', blackBear: 'a bear', lion: 'lions', hyena: 'hyenas', tiger: 'a tiger', panther: 'a panther', jaguar: 'a jaguar', crocodile: 'a crocodile' };
  game.hud?.toast?.(`Something has killed one of your ${names[b.kind] ?? b.kind}s: ${by[a.kind] ?? 'a hunter'}. Pen them in, or keep a fire burning by them at night.`);
};

// The animals-only view (testing): a label over each animal's head.
const animalsOnlyBox = document.getElementById('animals-only');
const animalLabels = document.createElement('div');
animalLabels.className = 'animal-labels';
document.body.append(animalLabels);
const labelPool = [];
const labelAt = new THREE.Vector3();
const animalName = (kind) => kind.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
function labelAnimals(on) {
  let used = 0;
  if (on) {
    const w = window.innerWidth, h = window.innerHeight;
    for (const a of wildlife.animals) {
      if (!a.alive || used >= 120) continue;
      const d = Math.hypot(a.x - camera.position.x, a.z - camera.position.z);
      if (d > 300) continue;
      labelAt.set(a.x, (a.y ?? 0) + 1.6 * (a.scale ?? 1) + 0.4, a.z).project(camera);
      if (labelAt.z > 1 || Math.abs(labelAt.x) > 1.05 || Math.abs(labelAt.y) > 1.05) continue;
      const el = labelPool[used] ?? animalLabels.appendChild(Object.assign(document.createElement('span'), { className: 'animal-label' }));
      labelPool[used] = el;
      const text = `${animalName(a.kind)}${a.young ? ' (young)' : ''} · ${Math.round(d)} m`;
      if (el.textContent !== text) el.textContent = text;
      el.style.transform = `translate(${((labelAt.x + 1) / 2) * w}px, ${((1 - labelAt.y) / 2) * h}px) translate(-50%, -100%)`;
      el.hidden = false;
      used++;
    }
  }
  for (let k = used; k < labelPool.length; k++) labelPool[k].hidden = true;
}
const traces = new Traces(scene);
const fish = new Fish(scene, addCloudShadow);
const shootingStars = new ShootingStars(scene);
// Lightning may set the land alight where it strikes: dry ground with
// something on it to burn (not sand, snow, bare rock or water).
lightning.onStrike = (x, y, z, distance) => {
  // Right by you: it knocks you flat, or kills you.
  if (distance < 14 && controls.mode === 'walk') {
    const hurt = distance < 3 ? 70 : 120 / (distance * distance) * 9;
    game.hurt(hurt, 'lightning');
    game.hotbar?.flash(distance < 3 ? 'Struck by lightning!' : 'Lightning, right beside you!');
  }
  if (distance > 1300 || y < WORLD.seaLevel + 2 || waterAt(x, z, true)) return;
  const w = generator.getBiomeWeights(x, z, {});
  if (w.desert > 0.4 || seasonUniforms.uWinter.value * generator.getSeasonality(x, z) > 0.4) return;
  const summer = 1 - seasonUniforms.uSpring.value - seasonUniforms.uWinter.value;
  // (Whether it catches: by where it struck, so it's the same for everyone online.)
  const chance = (((Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1) + 1) % 1;
  if (chance < 0.18 + 0.2 * summer + 0.15 * w.savanna) fires.ignite(x, y, z, (px, pz) => generator.getBaseHeight(px, pz));
};
const grassCut = new GrassCut();

// --- The climate, and the tornadoes ---------------------------------------------------------
//
// How much of the weather's rain falls here (`climate.wet`): the desert
// hardly gets any (a storm there is mostly wind and lightning, dry
// lightning that sets the grass alight), the savanna some, more in its
// summer rains, the woods and plains their share, the jungle and the
// swamps more than any.
const climate = { wet: 1, target: 1, wait: 0 };
function climateHere(dt) {
  climate.wait -= dt;
  if (climate.wait <= 0) {
    climate.wait = 2;
    const p = camera.position, w = generator.getBiomeWeights(p.x, p.z, {});
    const summer = Math.max(0, 1 - seasonUniforms.uSpring.value - seasonUniforms.uAutumn.value - seasonUniforms.uWinter.value);
    const v = (w.desert ?? 0) * 0.12 + (w.saltFlat ?? 0) * 0.08 + (w.badlands ?? 0) * 0.35 + (w.savanna ?? 0) * (0.35 + 0.45 * summer)
      + ((w.jungle ?? 0) + (w.mangrove ?? 0) + (w.wetland ?? 0) + (w.redwood ?? 0)) * 1.25;
    const known = (w.desert ?? 0) + (w.saltFlat ?? 0) + (w.badlands ?? 0) + (w.savanna ?? 0) + (w.jungle ?? 0) + (w.mangrove ?? 0) + (w.wetland ?? 0) + (w.redwood ?? 0);
    climate.target = Math.min(1.3, v + Math.max(0, 1 - known)); // (everywhere else: its full share)
  }
  climate.wet += (climate.target - climate.wet) * Math.min(1, dt / 8);
}

// A tornado's track: where it's torn the woods out (kept, so trees far
// off, not yet built when it passed, are gone too when you get there; and
// none grows on it till the woods come back, a week on).
function stormTrack(x0, z0, x1, z1) {
  const out = [], day = game.worldDay?.() ?? 0;
  for (const [x, z, r, d] of game.stormPaths ?? []) {
    if (day - d > 7.5) continue;
    if (x + r < x0 || x - r > x1 || z + r < z0 || z - r > z1) continue;
    out.push([x, z, r]);
  }
  return out;
}

// What the tornado tears up as it goes: every few metres of its track,
// round (x, z) within about `r` (its core: in it everything is taken; at its
// edge, some), `strength` 0..1, going along `dir`.
const BUILT_TOUGH = { stoneWall: 0.75, stoneFloor: 0.95, cutStoneWall: 0.8, cutStoneFloor: 0.95, stoneStairs: 0.9, cutStairs: 0.9, chimney: 0.6, stoneFence: 0.6, stoneWindow: 0.7, stoneDoor: 0.7, cutWindow: 0.75, cutDoor: 0.75, cellar: 1, anvil: 0.85, furnace: 0.6, logWall: 0.4, logFloor: 0.5, plankWall: 0.35 };
const unitHash = (x, z) => (((Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1) + 1) % 1;
function wreck(x, z, r, strength, dir) {
  const day = game.worldDay?.() ?? 0, cam = camera.position;
  const reach = r * 1.35;
  // (The track, kept: a mark every 30 m or so.)
  const paths = (game.stormPaths ??= []);
  const last = paths[paths.length - 1];
  if (!last || Math.hypot(last[0] - x, last[1] - z) > 25) {
    paths.push([Math.round(x), Math.round(z), Math.round(reach), +day.toFixed(3)]);
    if (paths.length > 600) paths.splice(0, paths.length - 600);
    game.dirty = true;
  }
  // The grass and turf stripped off it.
  grassCut.cut(x, z, reach, dayNight.day + dayNight.hour / 24);
  fires.scour(x, z, reach, 0.55 + 0.45 * strength);
  // The trees: snapped off or torn up and thrown down, the way the wind
  // goes round it (and on with it). Near you, each one comes crashing down;
  // further off, they're simply gone (its track keeps them so).
  let falls = 0;
  for (const hit of trees.within(x, z, reach)) {
    if (hit.t.removed) continue;
    const dx = hit.x - x, dz = hit.z - z, d = Math.hypot(dx, dz) || 0.01;
    const take = strength * (d < r ? 1.2 : 1 - (d - r) / (reach - r));
    if (unitHash(hit.x, hit.z) > take) continue;
    // (Thrown round with the winds: anticlockwise round it, and on with it.)
    const tx = -dz / d + dir.x * 0.8, tz = dx / d + dir.z * 0.8;
    const away = Math.atan2(tx, tz);
    const near = Math.hypot(hit.x - cam.x, hit.z - cam.z) < 220;
    // (In its heart, near you: some torn out whole and carried up and round in it.)
    const flying = game.felling.falling.filter((f) => f.fly).length;
    if (!hit.bush && near && d < r * 0.9 && strength > 0.4 && flying < 8 && unitHash(hit.z, hit.x) < 0.45) {
      game.felling.liftUp(hit, { x, z });
      falls++;
    } else if (!hit.bush && falls < 4 && near) {
      game.felling.blowDown(hit, away);
      falls++;
    } else game.felling.uproot(hit);
    game.dirty = true;
  }
  // What's built: ripped apart, the bits flung away round it. (A
  // stone house may stand through the edge of one; nothing of wood does
  // through its heart. The host's work, online: theirs is shared.)
  if (!weather.following) {
    for (const st of [...game.structures.list]) {
      const d = Math.hypot(st.x - x, st.z - z);
      if (d > reach) continue;
      const force = strength * (d < r ? 1 : 1 - (d - r) / (reach - r));
      const tough = BUILT_TOUGH[st.type] ?? 0;
      if (unitHash(st.x * 1.7 + st.id, st.z) > force * 1.25 - tough) continue;
      blowApart(st, x, z, strength, dir);
    }
  }
  // The animals caught in it: lifted and flung, and killed.
  for (const a of wildlife.animals) {
    if (!a.alive || Math.hypot(a.x - x, a.z - z) > r * 0.9 || (a.y ?? 0) > (chunks.groundHeightAt(a.x, a.z) || 0) + 6) continue;
    wildlife.hit(a, 999, { x, z });
  }
  // And anything lying about: swept up and flung.
  for (const dr of game.items.drops) {
    const d = Math.hypot(dr.x - x, dr.z - z);
    if (d > r || dr.stuck) continue;
    const vt = 24 * strength;
    dr.settled = false;
    dr.vy = 8 + 10 * Math.random() * strength;
    dr.vx = (-(dr.z - z) / (d || 1)) * vt + dir.x * 6;
    dr.vz = ((dr.x - x) / (d || 1)) * vt + dir.z * 6;
  }
}

// Something built, torn apart by a tornado: gone, and what it was made of
// (some of it), and whatever was in it, flung about in pieces.
function blowApart(st, x, z, strength, dir) {
  const pieces = [];
  const recipe = RECIPES.find((rc) => rc.id === st.type);
  for (const [id, n] of Object.entries(recipe?.needs ?? { stick: 2 })) {
    if (!ITEMS[id]?.weight || ITEMS[id].group === 'Trophies') continue;
    const keep = Math.floor(n * (0.25 + 0.3 * Math.random()));
    if (keep > 0) pieces.push({ id, count: keep });
  }
  for (const s of st.contents?.slots ?? []) if (s) pieces.push(s);
  game.structures.remove(st);
  const d = Math.hypot(st.x - x, st.z - z) || 1;
  for (const s of pieces) {
    const k = (0.6 + Math.random() * 0.8) * (14 + 16 * strength);
    game.items.drop({ ...s }, st.x, st.y + 1.5, st.z, {
      vy: 6 + Math.random() * 10 * strength,
      vx: (-(st.z - z) / d) * k + dir.x * 8 + (Math.random() - 0.5) * 6,
      vz: ((st.x - x) / d) * k + dir.z * 8 + (Math.random() - 0.5) * 6,
    });
  }
  if (Math.hypot(st.x - camera.position.x, st.z - camera.position.z) < 120) sound.call('crack', panTowards(camera, st.x, st.z), 1);
}

// Whether a tornado is in the offing: once a strong thunderstorm's built,
// in its season (late spring into early summer), over open country (the
// plains, the parkland, the savanna: not the woods, the mountains, the
// desert), in the afternoon or evening. Then one may drop out of it (about
// one storm in three like that), touching down a kilometre or so off,
// upwind, and coming on with the storm (from the south-west, mostly);
// passing by, or right over you.
const NATURAL_TORNADOES = false; // (set aside for now: they come only from the testing button)
function tornadoWatch(dt) {
  if (!NATURAL_TORNADOES) return;
  if (weather.following || game.mode === 'testing' && !weather.auto) return;
  if (weather.storm < 0.3) tornadoes.rolled = false;
  if (tornadoes.active || tornadoes.rolled || weather.storm < 0.75 || controls.mode !== 'walk' && game.mode !== 'creative') return;
  tornadoes.rolled = true;
  const t = seasons.time % 4, season = smoothstep(0.35, 0.65, t) * (1 - smoothstep(1.2, 1.45, t));
  const h = dayNight.hour, hours = h >= 12 && h < 22 ? 1 : h >= 22 || h < 2 ? 0.35 : 0.1;
  const p = camera.position, w = generator.getBiomeWeights(p.x, p.z, {});
  const open = Math.min(1, (w.temperate ?? 0) + (w.parkland ?? 0) + 0.8 * (w.savanna ?? 0) + 0.6 * (w.blackHills ?? 0)) * (1 - 0.7 * generator.getForestDensity(p.x, p.z)) * (1 - smoothstep(0.3, 0.6, generator.getMountainness(p.x, p.z)));
  if (Math.random() > 0.38 * season * hours * smoothstep(0.25, 0.6, open)) return;
  spawnTornado();
}
function spawnTornado({ near = null, delay = 50, back = null } = {}) {
  const p = camera.position;
  // (Coming from the south-west, give or take; a kilometre off, so it can be seen coming.)
  const heading = Math.PI * 0.25 + (Math.random() - 0.5) * 0.9; // (towards the north-east: +x, +z)
  const miss = near ?? (Math.random() < 0.45 ? (Math.random() - 0.5) * 120 : (Math.random() - 0.5) * 900);
  back ??= 700 + Math.random() * 500;
  const x = p.x - Math.sin(heading) * back + Math.cos(heading) * miss, z = p.z - Math.cos(heading) * back - Math.sin(heading) * miss;
  return tornadoes.spawn(x, z, heading, { speed: 10 + Math.random() * 7, life: 170 + Math.random() * 170, R: 50 + Math.random() * 70, delay });
}

const tornadoWind = {};
function tornadoUpdate(dt) {
  tornadoWatch(dt);
  tornadoes.update(dt, {
    camera, light: ambientLight, wind: clouds.wind,
    ground: (x, z) => {
      const g = chunks.groundHeightAt(x, z);
      return Number.isFinite(g) ? g : generator.getBaseHeight(x, z);
    },
    wreck,
  });
  const p = camera.position;
  // The warning signs: hail, the sky going green-black. Said once.
  const threat = tornadoes.threat * smoothstep(0.4, 0.9, weather.storm + (tornadoes.active ? 1 : 0));
  if (tornadoes.active && !tornadoes.warned && threat > 0.3 && !sheltered) {
    tornadoes.warned = true;
    game.hud?.toast?.('The sky has gone a sickly green-black, and it is hailing: a tornado is coming. Get underground, into a cave, or get out of its way.');
  }
  rain.hail = threat * (tornadoes.now?.strength > 0 ? 0.5 : 1) * 0.8;
  // Its wind, where you are: blown about; in its core, lifted and thrown, battered by what's flying in it.
  const w = tornadoes.windAt(p.x, p.z, tornadoWind);
  let loud = 0, pan = 0;
  if (w) {
    loud = Math.min(1, 2.2 * Math.exp(-Math.max(0, w.d - w.R) / 450)) * (tornadoes.now?.strength ?? 0);
    pan = panTowards(camera, tornadoes.now.x, tornadoes.now.z);
    const outside = controls.mode === 'walk' && !sheltered && !game.sleeping; // (underground, in a cave: safe)
    if (outside && w.d < w.R * 4) {
      const k = w.d < w.R ? 0.6 : 0.35 * (w.R * 4 - w.d) / (w.R * 3);
      controls.blow(w.x * k, w.z * k, dt);
      if (w.core > 0.15 && controls.grounded) {
        // (Caught: up and away. The landing does the rest: see onLand.)
        controls.launch(w.x * 0.45, 10 + 14 * w.core, w.z * 0.45);
        game.hurt(8 + 14 * w.core, 'tornado');
      } else if (w.d < w.R * 1.6 && Math.random() < dt * 1.5) game.hurt(3 + Math.random() * 6, 'tornado'); // (struck by what's flying)
    }
  }
  tornadoes.sound = { loud, pan, hail: rain.hail * (sheltered ? 0.2 : 1) * Math.min(1, weather.rain + 0.3) };
}

// The sky under a tornadic storm: a sick green-black light.
const STORM_GREEN = new THREE.Color(0.32, 0.4, 0.32);
function stormTint() {
  const g = tornadoes.threat * smoothstep(0.4, 0.9, weather.storm) * (sheltered ? 0 : 1);
  if (g > 0.01) scene.fog.color.lerp(STORM_GREEN.clone().multiplyScalar(0.5 + 0.5 * Math.min(1, dayNight.light.intensity / 2)), 0.5 * g);
}
const fires = new Wildfires(scene);
// (Big spiders in the dark of the caves: see CaveSpiders. Killed, one leaves its silk.)
const spiders = new CaveSpiders(scene);
const landmarks = new Landmarks(scene, generator); // (the twelve kinds of landmark: see landmarkSites)
const mineProps = new MineProps(scene); // (the old mines' timbers, rails and carts)
let mineWait = 0;
spiders.onKill = (s) => {
  if (!s.boss) return game.items.drop({ id: 'silk', count: 2 }, s.x, s.y + 0.5, s.z);
  // The Broodmother: her heart (one of the great beasts' trophies) and a mass of silk; not back in her chamber for some days.
  game.items.drop({ id: 'broodHeart', count: 1 }, s.x, s.y + 1, s.z);
  game.items.drop({ id: 'silk', count: 12 }, s.x + 1, s.y + 1, s.z);
  (game.wildlife.bossDeaths ??= {})[s.key] = Math.round((dayNight.day + dayNight.hour / 24) * 100) / 100;
  game.progress?.add?.('trophy');
  game.dirty = true;
};
// (What burns: the trees and bushes, each losing its leaves if it burns long: see Felling.scorch.)
fires.fuel = (x, z, r) => trees.within(x, z, r);
// (How much there is to burn at (x, z): the grass, thickest and driest on
// the savanna and the open plains; the woods and their litter; none on the
// water, the sand and salt, the snow, nor the bare rock up high.)
fires.fuelAt = (x, z) => {
  const h = generator.getBaseHeight(x, z);
  if (h < WORLD.seaLevel + 0.3 || waterAt(x, z, true)) return 0;
  const w = generator.getBiomeWeights(x, z, {});
  const dry = 1.15 * (w.savanna ?? 0) + 0.85 * ((w.temperate ?? 0) + (w.parkland ?? 0) + (w.cascades ?? 0) + (w.blackHills ?? 0)) + 0.75 * ((w.pine ?? 0) + (w.redwood ?? 0) + (w.smoky ?? 0))
    + 0.45 * ((w.jungle ?? 0) + (w.volcanic ?? 0) + (w.badlands ?? 0)) + 0.25 * ((w.wetland ?? 0) + (w.mangrove ?? 0)) + 0.03 * ((w.desert ?? 0) + (w.saltFlat ?? 0));
  let f = dry * (0.45 + 0.55 * generator.getGrassDensity(x, z)) + 0.45 * generator.getForestDensity(x, z) * Math.min(1, dry * 1.5);
  // (Green grass, growing and full of sap, hardly takes; dry grass goes up:
  // the savanna and the dry country, and everywhere late in the year.)
  const dryness = Math.min(1, Math.max(0, 0.3 + 0.7 * ((w.savanna ?? 0) + (w.desert ?? 0) + (w.badlands ?? 0)) + 0.35 * seasonUniforms.uAutumn.value - 0.25 * seasonUniforms.uSpring.value));
  f *= 0.35 + 0.65 * dryness;
  // (High up: thin grass, then bare rock and snow.)
  f *= 1 - Math.max(0, Math.min(1, (h - 110) / 60));
  // (Under the winter's snow, nothing burns.)
  f *= 1 - Math.min(1, seasonUniforms.uWinter.value * generator.getSeasonality(x, z) * 1.6);
  return Math.max(0, Math.min(1.5, f));
};
fires.onScorch = (t) => game.felling.scorch(t);
const volcanoes = new Volcanoes(scene);
const sandstorm = new Sandstorm(scene, Rain);
const devils = new DustDevils(scene);
const ambientLight = new THREE.Color();
const insects = new Insects(scene, addCloudShadow);
chunks.addLayer(rivers);
chunks.addLayer(createReedLayer(WORLD));
chunks.addLayer(createLilyLayer(WORLD));
chunks.addLayer(createVentLayer(WORLD));
chunks.addLayer(createGeyserLayer(WORLD));
chunks.addLayer(createCoralLayer(WORLD));
chunks.addLayer(createLeafLayer());
const mushrooms = createMushroomLayer();
chunks.addLayer(mushrooms);
const lavaLayer = createLavaLayer(WORLD);
lavaLayer.ground = (x, z) => chunks.groundHeightAt(x, z); // (flows settle onto the land as drawn: see LavaLayer)
chunks.addLayer(lavaLayer);
const seaCoast = createSeaCoastLayer(WORLD, terrainMaterial);
chunks.addLayer(seaCoast);
chunks.addLayer(createKelpLayer(WORLD));
const logs = createLogLayer(WORLD);
chunks.addLayer(logs);
chunks.addLayer(createFlowerLayer(WORLD));
chunks.addLayer(createUnderstoryLayer(WORLD));
chunks.addLayer(trees);
const farTrees = createFarTreeLayer(WORLD);
farTrees.prepare(renderer); // (the furthest trees' pictures)
scene.add(farTrees.group);
chunks.addLayer(farTrees);
chunks.addLayer(grass);
chunks.addLayer(farGrass);
const caves = createCaveLayer(WORLD);
chunks.addLayer(caves);
// (The iron ore lying in the caves, to pick up: see GroundItems.addCave.)
caves.onFinds = (cx, cz, features, group) => game.items.addCave(cx, cz, features, group);
caves.onGone = (cx, cz) => game.items.removeCave(cx, cz);
chunks.addLayer(createEntranceLayer(WORLD, caves.material));
chunks.addLayer(rocks);
// Ships wrecked on the beaches (see WreckLayer): their sea chests set out by the Game.
const wrecks = createWreckLayer(WORLD);
chunks.addLayer(wrecks);
// The ruins of old strongholds, here and there (see RuinLayer): their chests set out by the Game.
const ruins = createRuinLayer(WORLD);
chunks.addLayer(ruins);
// (No trees growing up through them: each stands in its own clearing.)
const LANDMARK_CLEAR = { elderTree: 26, stoneArch: 34, crystalLake: 40, standingStones: 16, sunkenForest: 46, petrifiedLog: 20, boneField: 18, hotPools: 22, greatSinkhole: 60, glacier: 95 };
trees.keepOut = (x0, z0, x1, z1) => [
  ...ruins.sitesNear((x0 + x1) / 2, (z0 + z1) / 2, Math.hypot(x1 - x0, z1 - z0) / 2 + 30, generator).map((s) => [s.x, s.z, s.size + 3]),
  // (And none along a tornado's track, till the woods grow back over it: see wreck.)
  ...stormTrack(x0, z0, x1, z1),
  // (Nor in a landmark's hollow or about it: each stands in its own clearing.)
  // (The Cascades' falls keep their own clear of trees where they're placed: see treePlacement.)
  ...generator.landmarks.near((x0 + x1) / 2, (z0 + z1) / 2, Math.hypot(x1 - x0, z1 - z0) / 2 + 300).filter((s) => s.kind !== 'falls').map((s) => [s.x, s.z, LANDMARK_CLEAR[s.kind] ?? 16]),
];
chunks.addLayer(createSnowLayer(WORLD, rocks)); // (after the rocks: it caps their boulders)
// The clouds' shadows slide over the land, the trees, grass, rocks and water (see cloudShadow).
for (const m of [terrainMaterial, trees.material, trees.leafMaterial, grass.material, farGrass.material, rocks.material, farTrees.material, farTrees.cardMaterial, logs.material, water.material, rivers.material]) if (m) addCloudShadow(m);

/**
 * What you'd stand on at (x, z) from feet height `feetY`: the terrain, or a
 * cave floor underground. The cave system reads the same procedural field
 * the cave meshes are built from, so floors, walls and roofs match them.
 */
let floorTop = null; // (see the Game, below: what's laid on the ground)
function groundAt(x, feetY, z) {
  const g = generator.caves.groundAt(x, feetY, z, chunks.groundHeightAt(x, z));
  // Boulders are solid: you stand on their tops (and walk into their sides as walls).
  if (!g.inCave) g.height = Math.max(g.height, rocks.surfaceAt(x, z), logs.surfaceAt(x, z), ruins.surfaceAt(x, z, feetY), landmarks.surfaceAt(x, z));
  // (On a floor you've laid: its boards or flags.)
  const floor = floorTop?.(x, z, feetY);
  if (floor !== null && floor !== undefined) g.height = Math.max(g.height, floor);
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
  // Underground: the still lakes of the great chambers, the rivers in the
  // rock, the pools on cave floors (or lava). Not the sea or the rivers
  // far overhead.
  if (sheltered) {
    const w = generator.caves.waterAt(x, camera.position.y - 1.2, z);
    return w ? { level: w.level, fx: 0, fz: 0, speed: w.river ? 0.5 : 0, cave: true, lava: w.lava } : null;
  }
  const ground = chunks.groundHeightAt(x, z);
  let found = ground < WORLD.seaLevel ? { level: WORLD.seaLevel, fx: 0, fz: 0, speed: 0, lake: true } : null;
  const r = generator.rivers.waterAt(x, z, 0);
  if (r && (!found || r.level > found.level)) found = { level: r.level, fx: r.fx, fz: r.fz, speed: r.pond ? 0 : 0.6 + Math.min(2.4, Math.max(0, r.drop) * 6), pond: r.pond, hot: r.tint === 2 };
  // (A landmark's lake or pool: the crystal lake, the falls' basin, the hot pools...)
  const lw = landmarks.waterAt(x, z, ground);
  if (lw && (!found || lw.level > found.level)) found = lw;
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
function footfall(x, z, heading, shape, size, loud = 0.5, track = false) {
  const water = waterAt(x, z, true);
  const y = chunks.groundHeightAt(x, z);
  if (!Number.isFinite(y) || water?.frozen) return; // (none on the ice)
  if (water && water.level > y + 0.02) {
    traces.splash(x, water.level, z, 5 + Math.round(loud * 6), 1.2 + loud * 1.6, 0.5 + loud * 0.6);
    if (Math.hypot(x - camera.position.x, z - camera.position.z) < 25) sound.call('splash', panTowards(camera, x, z), 0.25 + 0.4 * loud);
    return;
  }
  let kind = printGround(x, z, y);
  // (An animal's tracks show faintly even in the grass and the dirt: to follow.)
  if (!kind && track) {
    const jitter = generator.getColorJitter(x, z);
    generator.surfaceColor(x, z, y + jitter, 1, printColour, jitter);
    printColour.multiplyScalar(0.72);
    kind = 'grass';
  }
  if (kind) traces.print(x, y, z, heading, shape, size, kind, printColour, groundNormal(x, z));
}
// Tracks to follow: where the animals have gone lately (a mark every few
// metres of each one's way), with now and then its droppings, and a twig
// snapped where a big one's pushed through the woods. Read when you crouch
// and look at the ground (see Game: readTracks).
const trackLog = [];
const DUNG = new THREE.Color(0x3a2a1a), TWIG = new THREE.Color(0xb89868);
function logTrack(a, x, z, size) {
  const last = a.lastTrack;
  if (last && Math.hypot(x - last.x, z - last.z) < 2.5) return;
  a.lastTrack = { x, z };
  trackLog.push({ x, z, kind: a.kind, heading: a.heading, t: performance.now() / 1000 });
  if (trackLog.length > 2400) trackLog.splice(0, 400);
  const y = chunks.groundHeightAt(x, z);
  if (!Number.isFinite(y) || waterAt(x, z)) return;
  if (Math.random() < 0.035) {
    // (Droppings: a little heap of them.)
    for (let k = 0; k < 4; k++) traces.print(x + (Math.random() - 0.5) * 0.18, y, z + (Math.random() - 0.5) * 0.18, Math.random() * 6.28, PRINT.rabbit, 0.05 + size * 0.15, 'dung', printColour.copy(DUNG).multiplyScalar(0.8 + Math.random() * 0.4), groundNormal(x, z));
  }
  if (size * a.scale > 0.1 && Math.random() < 0.06 && stepSurface(x, z) === 'leaves') {
    // (A twig snapped under a big one's weight, its pale broken wood showing.)
    traces.print(x, y, z, Math.random() * 6.28, PRINT.rabbit, 0.35, 'twig', printColour.copy(TWIG), groundNormal(x, z));
  }
}
/** The freshest tracks near (x, z) (within r): { kind, heading, age (s) }, or null. */
function readTracks(x, z, r) {
  let best = null;
  const now = performance.now() / 1000;
  for (let k = trackLog.length - 1; k >= 0; k--) {
    const t = trackLog[k];
    if (now - t.t > 600) break;
    if (Math.abs(t.x - x) > r || Math.abs(t.z - z) > r || Math.hypot(t.x - x, t.z - z) > r) continue;
    best = { kind: t.kind, heading: t.heading, age: now - t.t };
    break;
  }
  return best;
}
// Blood, where a wounded animal's been.
const BLOOD = new THREE.Color(0x6a0a0a);
function bleed(x, z, amount = 1) {
  const y = chunks.groundHeightAt(x, z);
  if (!Number.isFinite(y) || waterAt(x, z)) return;
  traces.print(x, y, z, Math.random() * 6.28, PRINT.paw, 0.12 + 0.12 * amount * Math.random(), 'blood', printColour.copy(BLOOD).multiplyScalar(0.8 + Math.random() * 0.4), groundNormal(x, z));
}
// The player's steps and strokes.
const walker = { x: null, z: null, left: false, wet: false, stroke: 0, since: 0 };
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
      sound.call('swim', 0, 0.4);
    }
    if (moved > 0.3) (walker.x = pos.x), (walker.z = pos.z);
    return;
  }
  if (moved > 20) (walker.x = pos.x), (walker.z = pos.z); // (flown or teleported)
  // (A step at a person's own pace: about two a second walking, three
  // running, slower creeping; never a rapid patter however fast you go.)
  walker.since += dt;
  const pace = controls.crouch ? 0.72 : controls.sprinting ? 0.34 : 0.52;
  if (controls.mode !== 'walk' || !controls.grounded || moved < 0.35 || walker.since < pace) return;
  walker.since = 0;
  const heading = Math.atan2(pos.x - walker.x, pos.z - walker.z);
  walker.left = !walker.left;
  const side = walker.left ? 0.13 : -0.13;
  footfall(pos.x + Math.cos(heading) * side, pos.z - Math.sin(heading) * side, heading, PRINT.square, 0.28, 0.6); // (square: a blocky foot)
  // The sound of it: the footstep on what's underfoot, and now and then (and
  // always over a stick lying there) a branch cracking under it in the woods.
  const loud = (controls.crouch ? 0.35 : controls.sprinting ? 1.1 : 0.7) * (game.inventory.feet ? 0.7 : 1); // (soft boots: quieter)
  const surface = stepSurface(pos.x, pos.z, pos.y - controls.eyeHeight);
  if (surface !== 'water') sound.step(surface, loud);
  // Pushing through tall grass, or the bushes and low leaves: their rustle round your legs.
  const cover = surface === 'grass' || surface === 'leaves' ? game.player.cover ?? 0 : 0;
  if (cover > 0.4) sound.call('brush', (Math.random() - 0.5) * 0.4, loud * Math.min(1, 0.4 + cover));
  else if (controls.speedFactor < 0.9) sound.call('brush', (Math.random() - 0.5) * 0.4, loud * 0.8);
  const stick = game.items.lying?.(pos.x, pos.z, 0.6, 'stick');
  if (stick || (surface === 'leaves' && Math.random() < (controls.sprinting ? 0.12 : 0.05))) sound.call('crack', 0, (stick ? 0.8 : 0.55) * (controls.crouch ? 0.5 : 1));
  walker.x = pos.x;
  walker.z = pos.z;
}
// The surf: every wave you see burst against the rocks near you, you hear
// (each spot's spray bursts on its own beat, see SeaCoastLayer; the crashes
// of those near you in the same moment heard as one, from where they are).
const surfHeard = { t: null, last: -1 };
function surfSound() {
  const T = seaCoast.time, P = seaCoast.surfPeriod;
  const prev = surfHeard.t;
  surfHeard.t = T;
  if (prev === null || T <= prev || T - prev > 1) return;
  const p = camera.position, C = WORLD.chunkSize;
  const ccx = Math.floor(p.x / C), ccz = Math.floor(p.z / C);
  let loud = 0, px = 0, pz = 0, rockW = 0, rockSum = 0;
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const spots = seaCoast.surfNear.get(`${ccx + dx},${ccz + dz}`);
      if (!spots) continue;
      for (const s of spots) {
        const d = Math.hypot(s.x - p.x, s.z - p.z);
        if (d > 110) continue;
        // (How rocky the shore round you is, for the surf's sound: see Sound.ambience.)
        const near = Math.min(1, 30 / (d + 12));
        rockW += near;
        rockSum += s.rock * near;
        // (Its burst comes at when·P past each whole period.)
        if (Math.floor((T - s.when * P) / P) === Math.floor((prev - s.when * P) / P)) continue;
        if (s.rock < 0.35) continue; // (on sand the surf rolls in: no burst on rocks)
        const v = (0.4 + 0.6 * s.rock) * near;
        loud += v;
        px += s.x * v;
        pz += s.z * v;
      }
    }
  }
  if (rockW > 0.05) sound.coastRock = (sound.coastRock ?? 0.5) + (rockSum / rockW - (sound.coastRock ?? 0.5)) * 0.05;
  if (loud > 0.05 && T - surfHeard.last > 0.9) {
    surfHeard.last = T;
    sound.call('wave', panTowards(camera, px / loud, pz / loud), Math.min(0.4, 0.1 + loud * 0.12)); // (over the rocky coast's own roar)
  }
}
/**
 * How the land between you and a sound at (x, z) changes it (see
 * Sound.from): thick woods soak it up and take its highs; a hill or a
 * ridge in the way all but cuts it off, leaving the low rumble; over open
 * water it carries, clear, further than it would. { gain, cutoff (Hz) }.
 */
const heard = { gain: 1, cutoff: 20000 };
function hearing(x, z) {
  const c = camera.position, d = Math.hypot(x - c.x, z - c.z);
  heard.gain = 1;
  heard.cutoff = 20000;
  if (d < 10 || sheltered) return heard;
  const n = Math.min(10, Math.ceil(d / 14)), step = d / n;
  const sy = chunks.groundHeightAt(x, z) + 1;
  let woods = 0, blocked = 0, water = 0;
  for (let k = 1; k < n; k++) {
    const u = k / n, px = c.x + (x - c.x) * u, pz = c.z + (z - c.z) * u;
    const g = chunks.groundHeightAt(px, pz);
    if (!Number.isFinite(g)) continue;
    const line = c.y + ((Number.isFinite(sy) ? sy : c.y) - c.y) * u;
    if (g > line + 1.5) blocked += Math.min(1, (g - line - 1.5) / 6);
    if (waterAt(px, pz)) water++;
    else woods += generator.getForestDensity(px, pz) * step;
  }
  const wf = water / Math.max(1, n - 1), bf = Math.min(1, blocked / Math.max(1, (n - 1) * 0.35));
  heard.gain = Math.exp(-woods * 0.012) * (1 - 0.75 * bf) * (1 + 0.8 * wf * Math.min(1, d / 60));
  heard.cutoff = Math.max(500, 20000 * Math.exp(-woods / 70) * (1 - 0.85 * bf));
  return heard;
}

/** What's underfoot at (x, z), for the sound of a footstep (see Sound.step). */
function stepSurface(x, z, feetY = null) {
  // (On something built, a floor or stairs, or up on a ruin's stone: wood or stone underfoot.)
  if (feetY !== null) {
    const built = game.structures.surfaceKind(x, z, feetY);
    if (built) return built;
    if (Math.abs(ruins.surfaceAt(x, z, feetY) - feetY) < 0.35) return 'rock';
  }
  const y = chunks.groundHeightAt(x, z);
  const water = waterAt(x, z, true);
  if (water && !water.frozen && water.level > y + 0.02) return 'water';
  if (rocks.surfaceAt(x, z) > y + 0.1) return 'rock'; // (up on a boulder)
  const kind = printGround(x, z, y);
  if (kind) return kind; // (snow, mud or sand)
  // Grey ground (rock, scree, the bare mountains) or steep ground: rock.
  generator.surfaceColor(x, z, y + generator.getColorJitter(x, z), groundNormal(x, z).y, printColour, generator.getColorJitter(x, z));
  const hi = Math.max(printColour.r, printColour.g, printColour.b), lo = Math.min(printColour.r, printColour.g, printColour.b);
  if (hi - lo < 0.18 * hi) return 'rock';
  const w = generator.getBiomeWeights(x, z, {});
  const forest = generator.getForestDensity(x, z);
  if (w.pine + w.redwood + w.jungle > 0.5 || (w.temperate + w.smoky > 0.5 && forest > 0.55)) return 'leaves';
  if (w.savanna + w.badlands > 0.6) return 'dirt';
  return 'grass';
}
const ANIMAL_PRINTS = {
  deer: [PRINT.hoof, 0.11], elk: [PRINT.hoof, 0.1], moose: [PRINT.hoof, 0.16], bison: [PRINT.hoof, 0.17], blackBear: [PRINT.paw, 0.22], grizzly: [PRINT.paw, 0.26],
  rabbit: [PRINT.rabbit, 0.09], hare: [PRINT.rabbit, 0.06], wolf: [PRINT.paw, 0.12], wolfPup: [PRINT.paw, 0.07], coyote: [PRINT.paw, 0.09], fox: [PRINT.paw, 0.07],
  sheep: [PRINT.hoof, 0.08], boar: [PRINT.hoof, 0.1], cougar: [PRINT.paw, 0.12], turkey: [PRINT.paw, 0.1], duck: [PRINT.paw, 0.05],
  tiger: [PRINT.paw, 0.15], lion: [PRINT.paw, 0.14], jaguar: [PRINT.paw, 0.12], panther: [PRINT.paw, 0.12], hyena: [PRINT.paw, 0.1], panda: [PRINT.paw, 0.18],
  mountainGoat: [PRINT.hoof, 0.07], horse: [PRINT.hoof, 0.13], camel: [PRINT.paw, 0.17], elephant: [PRINT.square, 0.4], hippo: [PRINT.square, 0.26],
  crocodile: [PRINT.paw, 0.14], scorpion: [PRINT.square, 0.025],
  // (Those without legs of their own to step with: see Wildlife.#prints. A snake's a smooth trail; a bird on the ground, its little forked feet.)
  snake: [PRINT.square, 0.06], python: [PRINT.square, 0.12], monkey: [PRINT.paw, 0.06],
  songbird: [PRINT.paw, 0.025], starling: [PRINT.paw, 0.025], crow: [PRINT.paw, 0.04], gull: [PRINT.paw, 0.045], hawk: [PRINT.paw, 0.05], owl: [PRINT.paw, 0.05], eagle: [PRINT.paw, 0.06],
};

// Start somewhere with mountains in view: scan a few spots for a tall one.
// (later: survival's search for green ground done a little at a time,
// behind the loading screen, see loadingFrame: it can take a while, laying
// out the rivers as it goes, and the page mustn't freeze meanwhile.)
let spawnSearch = null; // { steps, done(at) }
function placeCamera(onGround = false, later = false) {
  let best = { x: 0, z: 0, h: -Infinity };
  for (let i = 0; i < 400; i++) {
    const x = (i % 20) * 160 - 1600;
    const z = Math.floor(i / 20) * 160 - 1600;
    const h = generator.landHeight(x, z); // (the land before any rivers: quick, and near enough)
    if (h > best.h) best = { x, z, h };
  }
  // Stand off to the south-east of the peak, looking at it.
  const x = best.x + 300;
  const z = best.z + 360;
  // (Survival: standing on the ground, somewhere green: out of the desert, on dry land. Otherwise high above it, flying: the rivers needn't be worked out for this.)
  const look = () => controls.lookAt(new THREE.Vector3(best.x, best.h * 0.5, best.z));
  const stand = (at) => {
    camera.position.set(at.x, Math.max(generator.getHeight(at.x, at.z), WORLD.seaLevel) + controls.eyeHeight + 0.3, at.z);
    look();
  };
  if (onGround && later) {
    camera.position.set(x, Math.max(generator.landHeight(x, z) + 50, 70), z); // (meanwhile)
    spawnSearch = { steps: greenGroundSteps(x, z), done: stand };
    return;
  }
  if (onGround) stand(greenGround(x, z));
  else camera.position.set(x, Math.max(generator.landHeight(x, z) + 50, 70), z);
  look();
}

// The nearest spot to (x, z) that's dry land, not high on a peak, well
// away from desert, salt flat and badlands, in woods or foothills where
// flint and stones lie about, and by a stream or river (searched outward in rings).
function greenGround(x, z) {
  const steps = greenGroundSteps(x, z);
  for (;;) {
    const r = steps.next();
    if (r.done) return r.value;
  }
}
/** The same, a step at a time (each yield a moment to let the page breathe). */
function* greenGroundSteps(x, z) {
  const dry = (w) => (w.desert ?? 0) + (w.saltFlat ?? 0) + (w.badlands ?? 0);
  const ok = (px, pz) => {
    const h = generator.landHeight(px, pz);
    if (!(h > WORLD.seaLevel + 2 && h < WORLD.seaLevel + 260)) return false;
    const w = generator.getBiomeWeights(px, pz, {});
    if (dry(w) >= 0.02) return false;
    // (And where flint and stones lie about to be picked up: woods, or the foothills. See GroundItems.)
    const wooded = Math.max(generator.getForestDensity(px, pz) * ((w.temperate ?? 0) + (w.smoky ?? 0) + (w.pine ?? 0) + (w.blackHills ?? 0) + (w.wetland ?? 0)), w.jungle ?? 0, 0.6 * (w.pine ?? 0), 0.6 * (w.smoky ?? 0));
    const mount = generator.getMountainness(px, pz);
    return wooded > 0.45 || (mount > 0.35 && mount < 0.75);
  };
  // (Best of all, by running water: a stream or a river within a short walk, not standing in it.)
  const byWater = (px, pz) => {
    const w = generator.rivers.at(px, pz, 45);
    return !!w && !w.pond && w.d > w.half + 3;
  };
  let fallback = null;
  if (ok(x, z)) {
    yield* generator.rivers.prepare?.(x, z) ?? [];
    if (byWater(x, z)) return { x, z };
    fallback = { x, z };
  }
  for (let r = 100; r <= 9000; r += 100) {
    const n = Math.max(8, Math.round(r / 50));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (!ok(px, pz)) continue;
      fallback ??= { x: px, z: pz };
      yield* generator.rivers.prepare?.(px, pz) ?? []; // (the rivers there laid out, a piece at a time)
      if (byWater(px, pz)) return { x: px, z: pz };
      yield; // (the rivers there laid out: that's the slow part)
    }
    yield;
    if (fallback && r > 4000) return fallback; // (no running water anywhere near: green ground will do)
  }
  if (fallback) return fallback;
  return { x, z };
}

// Walking into a tree: a knock on the trunk and its leaves shaking, once
// as you come up against it (not again while you lean on it).
const bumped = { touching: false, at: 0 };
function treeBump(dx, dz) {
  const push = Math.hypot(dx, dz), now = performance.now();
  const touching = push > 0.002;
  if (touching && !bumped.touching && now - bumped.at > 700 && controls.mode === 'walk') {
    bumped.at = now;
    // (From the side the trunk is on: opposite the way it pushed you.)
    const k = 50 / push;
    sound.call('treebump', panTowards(camera, camera.position.x - dx * k, camera.position.z - dz * k) * 0.6, controls.sprinting ? 0.9 : controls.crouch ? 0.35 : 0.6);
  }
  bumped.touching = touching;
}

// Third person (F3): you, seen from a few metres behind and a little above,
// the camera drawn in short of anything in the way (the ground, a hill).
// Only the drawing: everything else goes on from your own eyes.
let thirdPerson = false;
let selfFigure = null;
const eyeSaved = new THREE.Vector3(), behind = new THREE.Vector3();
function thirdPersonView(dt, now) {
  const on = thirdPerson && !loading && controls.mode === 'walk' && !game.sleeping;
  if (game.hand) game.hand.visible = !on;
  if (!on) {
    if (selfFigure) selfFigure.root.visible = false;
    return null;
  }
  selfFigure ??= new Remote(scene, { id: 'me', name: 'You', colour: '#c8965a' });
  selfFigure.tag.visible = false;
  const t = now / 1000, me = { crouch: controls.crouch, sprint: controls.sprinting, swim: controls.swimming, fly: false, pose: game.pose() };
  selfFigure.push([camera.position.x, camera.position.y - controls.eyeHeight, camera.position.z, controls.euler.y, controls.euler.x, packFlags(me, mp.items)], t);
  selfFigure.update(dt, t + 0.15, mp.items); // (drawn as you are now, not a moment behind as the others are)
  eyeSaved.copy(camera.position);
  camera.getWorldDirection(behind);
  // (Back along the way you look, a little up: stopped short of the ground.)
  const want = 3.6;
  let reach = want;
  // (Not through a tree trunk, a wall or a roof behind you, either.)
  const back = behind.clone().negate();
  const trunk = trees.pick(eyeSaved, back, want);
  if (trunk) reach = Math.min(reach, Math.max(0.4, trunk.distance - 0.5));
  const built = game.structures.pick(eyeSaved, back, want);
  if (built) reach = Math.min(reach, Math.max(0.4, built.distance - 0.4));
  for (let d = 0.4; d <= reach; d += 0.3) {
    const x = eyeSaved.x - behind.x * d, y = eyeSaved.y - behind.y * d + d * 0.12, z = eyeSaved.z - behind.z * d;
    const g = chunks.groundHeightAt(x, z);
    if (Number.isFinite(g) && y < g + 0.35) {
      reach = Math.max(0.4, d - 0.3);
      break;
    }
  }
  camera.position.set(eyeSaved.x - behind.x * reach, eyeSaved.y - behind.y * reach + reach * 0.12, eyeSaved.z - behind.z * reach);
  return eyeSaved;
}

const controls = new PlayerControls(camera, canvas, {
  groundAt,
  seaLevel: WORLD.seaLevel,
  waterAt,
  collide: (position, radius) => {
    const feet = position.y - controls.eyeHeight;
    const bx = position.x, bz = position.z;
    trees.collide(position, radius, WORLD.chunkSize);
    treeBump(position.x - bx, position.z - bz);
    // (Into the leaves a little way, not through them; and they slow you.)
    controls.speedFactor = trees.leaves(position, radius, feet, controls.eyeHeight + 0.1);
    game.structures.collide(position, radius, feet);
    ruins.collide(position, radius, feet);
    generator.caves.collide(position, radius, feet);
    bodiesCollide(position, radius, feet);
  },
});

// No walking through the animals (standing ones), nor through the others online.
function bodiesCollide(position, radius, feet) {
  const push = (x, z, r, bottom, top) => {
    if (feet > top || feet + controls.eyeHeight < bottom) return;
    const dx = position.x - x, dz = position.z - z, d = Math.hypot(dx, dz), min = r + radius;
    if (d >= min || d < 1e-4) return;
    position.x = x + (dx / d) * min;
    position.z = z + (dz / d) * min;
  };
  for (const a of wildlife.animals) {
    const sp = Wildlife.species(a.kind);
    if (!sp?.ground || !a.alive || a.down || a.gone || (a.lie ?? 0) > 0.5) continue;
    if (Math.abs(a.x - position.x) > 4 || Math.abs(a.z - position.z) > 4) continue;
    push(a.x, a.z, (sp.radius ?? 0.4) * a.scale, a.y - 0.2, a.y + (sp.height ?? 1) * a.scale);
  }
  for (const r of mp.others.values()) {
    if (!r.root.visible) continue;
    const p = r.root.position;
    push(p.x, p.z, 0.35, p.y - 0.2, p.y + 1.8);
  }
}
// (Not behind the title screen: the world you pick is placed when it starts.)
if (TESTING) placeCamera();
// (A spot asked for in the address: see TEST above.)
function testView() {
  if (!TEST.has('x') && !TEST.has('z')) return;
  const x = +(TEST.get('x') ?? 0), z = +(TEST.get('z') ?? 0);
  const y = TEST.has('y') ? +TEST.get('y') : Math.max(generator.getBaseHeight(x, z), WORLD.seaLevel) + 40;
  camera.position.set(x, y, z);
  camera.rotation.order = 'YXZ';
  camera.rotation.set(+(TEST.get('pitch') ?? -0.3), +(TEST.get('yaw') ?? 0), 0);
  controls.euler.set(camera.rotation.x, camera.rotation.y, 0, 'YXZ');
}
testView();
const body = new PlayerBody(scene);
const torches = new Torches(scene, { maxLights: 14 });
torches.loadWorld(WORLD.seed);

// --- Staying alive -----------------------------------------------------------------
// (See Game: your pack, health, hunger, thirst, warmth; crafting, building,
// felling and hunting; and the world remembering what you've done.)
const geese = new Geese(scene); // (skeins of geese passing over, spring and autumn)
const game = new Game({
  scene, camera, controls, chunks, trees, rocks, logs, mushrooms, fish, traces, torches, wildlife, sound, config: WORLD,
  solidHit: (origin, direction, reach) => solidHit(origin, direction, reach),
  readTracks: (x, z, r) => readTracks(x, z, r),
  panAt: (x, z) => (sound.from(x, z), panTowards(camera, x, z)),
  wind: () => clouds.wind,
  // (A campfire left burning in the dry sets the grass alight.)
  ignite: (x, y, z) => fires.ignite(x, y, z, (px, pz) => generator.getBaseHeight(px, pz)),
  // (Standing in a burning wood or on burning ground: see Wildfires.heatAt.)
  fireHeat: (x, y, z) => fires.heatAt(x, y, z, (px, pz) => generator.getBaseHeight(px, pz)),
  // (The burnt ground, saved with the world; and the days, for the burnt woods growing back.)
  spiders,
  // (The giant mushrooms in the caves: cut down with an axe, see CaveLayer.)
  shrooms: { pick: (o, d, r) => pickShroom(o, d, r), fell: (hit, away) => fellShroom(hit, scene, away), cut: shroomsCut },
  // (The long grass cut with a sickle: see GrassCut.)
  // (How much standing grass the blade went through: none on rock, sand, snow or in the water.)
  cutGrass: (x, z, r) => {
    const fresh = grassCut.cut(x, z, r, dayNight.day + dayNight.hour / 24);
    const kind = fresh ? stepSurface(x, z) : null;
    return kind === 'grass' || kind === 'dirt' || kind === 'leaves' ? fresh : 0;
  },
  cutJSON: () => grassCut.toJSON(),
  loadCut: (list) => grassCut.load(list),
  burnsJSON: () => fires.toJSON(),
  loadBurns: (list) => fires.load(list),
  worldDay: () => dayNight.day + dayNight.hour / 24,
  // (Sleeping the night through: on to the next morning.)
  sleepUntilMorning: () => {
    const h = dayNight.hour;
    const days = (h > 6.5 ? 24 - h + 6.5 : 6.5 - h) / 24;
    dayNight.hour = 6.5;
    seasons.update(days, 1);
    game.passDays(days);
  },
  hudRoot: document.getElementById('hud'),
  generator: () => generator,
  waterAt: (x, z) => waterAt(x, z),
  // (The ground at (x, z); from height y, the cave floor if there's one under it.)
  groundAt: (x, z, y) => {
    if (y !== undefined) return groundAt(x, y, z).height;
    const h = chunks.groundHeightAt(x, z);
    return Number.isFinite(h) ? Math.max(h, rocks.surfaceAt(x, z)) : generator.getHeight(x, z);
  },
});
game.felling.vortex = () => tornadoes.now; // (trees carried round in a tornado: see Felling.liftUp)
floorTop = (x, z, feetY) => game.structures.floorTop(x, z, feetY);
ruins.onChest = (c) => game.ruinChest(c);
wrecks.onChest = (c) => game.ruinChest(c); // (a wreck's sea chest)
game.onKeep = (open) => ruins.openKeep(open);
game.keepAt = () => ruins.keep(generator);
game.ruinsNear = (x, z, r) => ruins.sitesNear(x, z, r, generator);
// (Online: what the others hold, drawn in their hands: see Multiplayer.)
mp.items = { ids: Object.keys(ITEMS), geometry: (id) => game.items.model(id), material: game.items.material, holdPose: Game.holdPose };
// Online, one world for everyone: what's done to it, the sky, the animals
// and their calls (see net/WorldSync).
const sync = new WorldSync({
  mp, game, trees, mushrooms, torches, weather, clouds, seasons, wildlife, lightning, sound,
  pan: (x, z) => (sound.from(x, z), panTowards(camera, x, z)),
  windStrength: () => windStrength.value,
  dayNight, dayLength: () => WORLD.dayLengthMinutes,
});
chunks.addLayer(game.items.layer);
// (The world's time of day, moon and season, kept with its save.)
game.clock = {
  get: () => ({ hour: +dayNight.hour.toFixed(3), day: dayNight.day, season: +seasons.time.toFixed(4) }),
  set: (c) => {
    if (Number.isFinite(c.hour) && !mp.connected) dayNight.hour = c.hour; // (online, the room keeps the time)
    if (Number.isFinite(c.day)) dayNight.day = c.day;
    if (Number.isFinite(c.season) && seasons.auto) seasons.time = c.season;
  },
};
game.loadWorld(WORLD.seed);
window.addEventListener('beforeunload', () => game.dirty && game.save());
// Falls from too high hurt (not into the water).
// (How far you can drop before it hurts, by what you land on: rock the
// least; grass and leaf litter a little more; sand, snow and mud more; a bush
// most of all. As a share of the fall height: speed goes as its square root.)
const LANDING = { rock: 1.1, dirt: 1.2, grass: 1.25, leaves: 1.3, sand: 1.4, snow: 1.6, mud: 1.6, bush: 1.75 };
controls.onLand = (speed) => {
  const p = camera.position;
  let surface = caveFocus.under ? 'rock' : stepSurface(p.x, p.z, p.y - controls.eyeHeight);
  if (surface === 'water') return;
  if (!caveFocus.under && (controls.speedFactor < 0.9 || (game.player.cover ?? 0) > 0.6)) surface = 'bush';
  const harm = Math.max(0, speed - 13 * Math.sqrt(LANDING[surface] ?? 1.1)) * 6.5;
  if (harm > 0) game.hurt(harm, 'a fall');
};

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
  fog: () => (game.mode === 'survival' ? { explored: game.explored, size: WORLD.chunkSize } : null),
  // (The Lost Keep: where the old maps put it, or, testing, where it is.)
  keep: () => (game.mode === 'testing' ? { ...ruins.keep(generator), r: 0 } : game.keep?.mark ?? null),
  // (Testing: the ruins marked on it too.)
  // (A few new places worked out each time it's drawn: it fills in over a moment, never freezing. In survival, only those you've been to.)
  landmarks: (x, z, r) => game.landmarksForMap(x, z, r),
  more: () => game.mode === 'testing' && !!game.landmarkMore, // (testing: the landmarks still being found, drawn again in a moment)
  ruins: (x, z, r, labelAt) => (game.mode === 'testing' ? ruins.sitesRoughly(x, z, Math.min(r, 20000), generator, labelAt) : ruins.sitesOf(game.ruinsSeen, generator)),
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
  noclip: document.getElementById('noclip'),
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

function setSeed(seed, saveKey = null, place = true, later = false) {
  WORLD.seed = seed;
  generator = new TerrainGenerator(seed, WORLD);
  game.trees.removed.clear(); // (the new world's felled trees are loaded below)
  chunks.setGenerator(generator);
  minimap.invalidate();
  bigMap.reset(); // (the old world's map tiles are no good now)
  torches.loadWorld(seed);
  if (game.dirty) game.save();
  game.loadWorld(seed, saveKey);
  wildlife.clear();
  fish.clear();
  fires.clear();
  volcanoes.clear();
  insects.clear();
  if (place && game.mode !== 'testing') (seasons.time = 1.5), (dayNight.hour = 8); // (a new world starts on a summer's morning, midsummer)
  if (place) {
    const t = performance.now();
    placeCamera(game.mode === 'survival', later); // (not when you'll be put back where you were)
    performance.measure('placeCamera', { start: t });
  }
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
  for (const m of [terrainMaterial, water.material, trees.material, trees.leafMaterial, grass.material, farGrass.material, caves.material, rocks.material, ...clouds.materials]) {
    m.wireframe = ui.wireframe.checked;
  }
});
ui.time.addEventListener('input', () => {
  dayNight.hour = Number(ui.time.value);
  ui.clock.textContent = dayNight.clock;
  mp.setHour(dayNight.hour); // (online: the others' sun moves with yours)
});
ui.cycle.addEventListener('change', () => {
  dayNight.playing = ui.cycle.checked;
});
// (Testing: a day on, the season with it, to see the seasons turn.)
const seasonDay = document.getElementById('season-day');
const showSeasonDay = () => {
  if (!seasonDay) return;
  const d = WORLD.daysPerSeason, into = (seasons.time % 1) * d;
  seasonDay.textContent = `${seasons.name}, day ${Math.floor(into) + 1} of ${d}${into > d - WORLD.seasonTurnDays / 2 || into < WORLD.seasonTurnDays / 2 ? ' (turning)' : ''}`;
};
document.getElementById('skip-day')?.addEventListener('click', () => {
  dayNight.day++;
  seasons.update(1, 1);
  game.passDays(1);
  showSeasonDay();
});
setInterval(showSeasonDay, 1000);
showSeasonDay();
for (const button of ui.presets) {
  button.addEventListener('click', () => {
    dayNight.hour = Number(button.dataset.hour);
    ui.time.value = dayNight.hour;
    ui.clock.textContent = dayNight.clock;
    mp.setHour(dayNight.hour);
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
// (For testing: a dust storm blowing in, or a dust devil close by, wherever you are.)
document.getElementById('test-storm')?.addEventListener('click', (e) => {
  sandstorm.start(true);
  e.currentTarget.blur();
});
// (A tornado for testing: forming a few hundred metres off, coming your way.)
document.getElementById('test-tornado')?.addEventListener('click', (e) => {
  spawnTornado({ near: (Math.random() - 0.5) * 80, delay: 4, back: 350 });
  e.currentTarget.blur();
});
document.getElementById('test-devil')?.addEventListener('click', (e) => {
  devils.spawn(camera.position.x, camera.position.z, true);
  e.currentTarget.blur();
});
const WEATHER_ORDER = ['auto', ...Object.keys(WEATHER)];
ui.shadows.addEventListener('change', () => {
  dayNight.shadows = ui.shadows.checked;
});
ui.automove.addEventListener('change', () => {
  controls.autoMove = ui.automove.checked;
});
// No clip (testing and creative): fly through the ground and the rock, straight down into the caves.
ui.noclip?.addEventListener('change', () => {
  if (game.mode === 'survival') ui.noclip.checked = false;
  controls.noclip = ui.noclip.checked;
  if (controls.noclip && !ui.fly.checked) ui.fly.click();
  hotbar.flash(controls.noclip ? 'No clip: fly through the ground and rock' : 'Solid again');
});
ui.fly.addEventListener('change', () => {
  const mode = ui.fly.checked ? 'fly' : 'walk';
  if (mode === 'walk' && ui.noclip?.checked) (ui.noclip.checked = false), (controls.noclip = false); // (walking, the ground's solid)
  controls.setMode(mode);
  // (Where you first set foot in a world is where you come back to after dying.)
  if (mode === 'walk' && !game.spawn) {
    const { x, z } = camera.position;
    game.spawn = { x, y: Math.max(chunks.groundHeightAt(x, z) || generator.getHeight(x, z), WORLD.seaLevel) + 1.8, z };
  }
});
// Peaceful (for testing): the wolves and bears leave you be, and nothing runs from you.
const peaceful = document.getElementById('peaceful');
window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement && e.target.type === 'text') return;
  // F3: seen from behind, or through your own eyes.
  if (e.code === 'F3') {
    e.preventDefault();
    thirdPerson = !thirdPerson;
    return;
  }
  // P shows and hides everything on screen but the crosshair: the
  // panel, the minimap, the hotbar.
  if (e.code === 'KeyP') {
    e.preventDefault();
    const hud = document.getElementById('hud');
    const hide = !hud.hidden;
    // (The debug panel only ever in testing.)
    for (const el of [game.mode === 'testing' ? ui.panel : null, ui.minimap, ui.hotbar, hud]) if (el) el.hidden = hide;
    return;
  }
  if (e.code === 'KeyX') ui.mouseLock?.click();
  if (e.code === 'KeyB') {
    if (document.pointerLockElement) document.exitPointerLock(); // (to point at the map)
    bigMap.toggle();
  }
  if (e.code === 'KeyV' && game.mode !== 'survival') ui.fly.click(); // (no flying in survival)
  if (e.code === 'KeyJ' && game.mode !== 'survival') ui.noclip?.click();
  if (e.code === 'KeyF') ui.automove.click();
  if (e.code === 'KeyG' && game.mode === 'testing') ui.wireframe.click(); // (playing: G waves, T the emotes)
  if (e.code === 'KeyT' && game.mode === 'testing') ui.cycle.click();
  if (e.code === 'KeyH') ui.shadows.click();
  if (e.code === 'KeyR' && game.mode === 'testing') ui.rays.click(); // (R drops things, playing)
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

// --- Hotbar, and using what's in your hand -----------------------------------------
const hotbar = new Hotbar(document.getElementById('hotbar'), game.inventory);
game.hotbar = hotbar;

// Scroll through the hotbar while walking (flying uses the wheel for speed).
canvas.addEventListener(
  'wheel',
  (e) => {
    if (controls.mode === 'walk' && !game.hud.busy) hotbar.step(e.deltaY > 0 ? 1 : -1);
  },
  { passive: true },
);

// A quick click (not a drag to look around) uses what's in your hand where
// you point (see Game.use); right-click throws a spear, or picks up.
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let press = null;
canvas.addEventListener('pointerdown', (e) => {
  press = { x: e.clientX, y: e.clientY, time: performance.now(), button: e.button, locked: controls.locked };
  if (e.button === 0 && (controls.locked || controls.lockFailed || !controls.mouseLock)) game.press(); // (a bow starts to draw)
});
canvas.addEventListener('pointerup', (e) => {
  if (!press) return;
  let at = null;
  if (press.locked) {
    // (The mouse held in the middle: where the crosshair is.)
    const r = canvas.getBoundingClientRect();
    at = [r.left + r.width / 2, r.top + r.height / 2];
  } else if (controls.lockFailed || !controls.mouseLock || press.button === 2) {
    // (The click that takes hold of the mouse doesn't use the item too; a bow may be held drawn.)
    const quick = (performance.now() - press.time < 400 || game.drawing) && Math.hypot(e.clientX - press.x, e.clientY - press.y) < 6;
    if (quick) at = [e.clientX, e.clientY];
  }
  if (at) {
    const ray = rayAt(at[0], at[1]);
    if (press.button === 2) game.alt(ray);
    else game.use(ray, placeTorch);
  }
  press = null;
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

function rayAt(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  return { origin: raycaster.ray.origin.clone(), direction: raycaster.ray.direction.clone() };
}

/** Terrain and cave meshes you can put things on, near the camera. */
function solidTargets(built = false) {
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
  // (And what's built near you: a torch, a lantern on a wall of your house, a candle on its table.)
  const p = camera.position;
  if (built) for (const s of game.structures.list) if (s.mesh && Math.abs(s.x - p.x) < 12 && Math.abs(s.z - p.z) < 12) s.mesh.traverse((o) => o.isMesh && o.visible && out.push(o));
  return out;
}

/** Where a ray meets the ground (or a cave's rock) within `reach`: { point, normal }, or null. */
function solidHit(origin, direction, reach, built = false) {
  raycaster.set(origin, direction);
  raycaster.far = reach;
  const hit = raycaster.intersectObjects(solidTargets(built), false)[0];
  if (!hit) return null;
  const normal = hit.face.normal.clone();
  if (hit.instanceId !== undefined) {
    // Rocks are instanced: turn the normal by that rock's own transform too.
    const instance = new THREE.Matrix4();
    hit.object.getMatrixAt(hit.instanceId, instance);
    normal.transformDirection(instance);
  }
  normal.transformDirection(hit.object.matrixWorld);
  if (normal.dot(direction) > 0) normal.negate(); // caves are seen from inside
  return { point: hit.point, normal, cave: hit.object.name.startsWith('cave') };
}

/** Sets a torch where you point: returns whether it went. */
function placeTorch(origin, direction, lamp = false) {
  const hit = solidHit(origin, direction, 6, true);
  if (!hit) {
    hotbar.flash('Point at the ground or a wall nearby');
    return false;
  }
  if (!torches.place(hit.point, hit.normal, true, lamp === 'lantern' || lamp === 'candle', lamp)) {
    hotbar.flash("Torches can't hang from a ceiling");
    return false;
  }
  return true;
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
  const nearMouth = mouths.some((e) => Math.hypot(e.mouth.x - p.x, e.mouth.y - p.y, e.mouth.z - p.z) < 35);
  const surface = !underground || nearMouth;
  // Near a mouth you can see down the tunnel beyond it, so show all caves.
  chunks.setVisibility(surface, underground || nearMouth ? 'all' : 'mouths', p);
  // (Deep in, only the caves you could see into from where you are: see
  // CaveSystem.visibleChunks. Looked at again a few times a second.)
  if (!surface) {
    const now = performance.now();
    if (now >= caveSight.next) (caveSight.next = now + 150), chunks.setCaveSet(generator.caves.visibleChunks(p));
  } else chunks.setCaveSet(null);
  clouds.group.visible = surface;
  // (Deep underground, no sun reaches: its shadows aren't redrawn, which
  // would mean drawing all the cave round you over again each frame.)
  if (renderer.shadowMap.autoUpdate !== surface) {
    renderer.shadowMap.autoUpdate = surface;
    renderer.shadowMap.needsUpdate = true;
  }
  farTrees.group.visible = surface;
  if (!surface) rain.mesh.visible = false;
  // (Deep underground, the animals up on the surface aren't drawn. The
  // fish, insects and falling leaves hide themselves when sheltered.)
  wildlife.hideAbove = surface ? Infinity : p.y + 18;
  sheltered = underground;
  // (Which caves to build: all round you underground; on the surface only those by a mouth near you.)
  caveFocus.under = underground;
  chunks.underground = underground && !nearMouth; // (the surface not loaded further while you're down there: see ChunkManager)
  caveFocus.x = p.x;
  caveFocus.z = p.z;

  // Underground, a short dark haze replaces the sky: caves fade into darkness
  // rather than showing gaps where far-off tunnels aren't built yet.
  const toMouth = mouths.reduce((d, e) => Math.min(d, Math.hypot(e.mouth.x - p.x, e.mouth.y - p.y, e.mouth.z - p.z)), Infinity);
  caveHaze.target = underground && !ui.night.checked ? Math.min(1, Math.max(0, (toMouth - 4) / 16)) : 0;
  // (In a great chamber, the dark goes back and back: the haze much further off.)
  const ch = underground ? generator.caves.field.chamberAt(p.x, p.z) : null;
  caveHaze.vast += ((ch && ch.e < 1 && p.y < ch.c.y + ch.c.ry ? 1 : 0) - caveHaze.vast) * 0.05;
}

// Underground: water dripping somewhere in the dark; the rush of an
// underground river near you.
function caveSounds(dt) {
  if (!sheltered) {
    caveSounds.brook = 0;
    return;
  }
  caveSounds.wait = (caveSounds.wait ?? 2) - dt;
  if (caveSounds.wait <= 0) {
    caveSounds.wait = 1.5 + Math.random() * 5;
    sound.call('drip', (Math.random() - 0.5) * 1.6, 0.25 + Math.random() * 0.5);
  }
  const p = camera.position, H = generator.getHeight(p.x, p.z);
  // (Bats squeaking at their roost, near you.)
  caveSounds.bats = (caveSounds.bats ?? 3) - dt;
  if (caveSounds.bats <= 0) {
    caveSounds.bats = 3 + Math.random() * 6;
    let near = null, nd = 30;
    for (const f of roostFlocks) {
      const d = Math.hypot(f.x - p.x, f.y - p.y, f.z - p.z);
      if (d < nd) (nd = d), (near = f);
    }
    if (near) sound.call('bats', panTowards(camera, near.x, near.z), Math.min(0.8, 6 / (nd + 4)));
  }
  const rv = generator.caves.field.riverAt(p.x, p.z, H);
  caveSounds.brook = rv && Math.abs(p.y - rv.level) < 8 ? Math.max(0, 1 - Math.max(0, rv.across - rv.half) / 14) * rv.fade : 0;
}

let sheltered = false; // underground: no rain or lightning, sounds muffled
let indoorDim = 0; // (indoors: how much of the daylight the walls keep out, eased)
const caveSight = { next: 0 }; // (see updateVisibility)
let shadowTurn = 0, cloudOwed = 0; // (see the frame: the clouds moved every other frame)

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
  const light = dayNight.farLight; // (the far map's box: the whole reach)
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
// The first snow: late in the autumn, two days or so before the turn into
// winter, one snowfall that settles for a while and melts away again,
// before the winter comes in earnest. (Online, the host's weather brings it.)
// (And up in the mountains, now and then from mid autumn to mid spring:
// see highSnow. Up there, it snows instead of raining then.)
let firstSnowFalling = false;
function firstSnow() {
  const d = WORLD.daysPerSeason, t = seasons.time;
  const start = 2 + (d - WORLD.seasonTurnDays - 2) / d, end = start + 0.4 / d;
  const now = seasons.auto && ((t >= start && t < end) || (seasons.highSnowing && camera.position.y > 70));
  if (now && !firstSnowFalling && weather.auto && !weather.following) {
    firstSnowFalling = true;
    weather.set('rain');
  } else if (!now && firstSnowFalling) {
    firstSnowFalling = false;
    weather.set('auto');
  }
  return now;
}

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
    let woods = 0, jungle = 0, grass = 0, wetland = 0, ocean = 0, desert = 0, pine = 0;
    const pts = [[0, 0], [60, 0], [-60, 0], [0, 60], [0, -60]];
    for (const [dx, dz] of pts) {
      const w = generator.getBiomeWeights(x + dx, z + dz, {});
      const forest = generator.getForestDensity(x + dx, z + dz);
      woods += (w.temperate * smoothstep(0.35, 0.7, forest) + w.blackHills * 0.7 + w.pine + (w.smoky ?? 0)) / pts.length;
      grass += (w.temperate * (1 - smoothstep(0.35, 0.7, forest)) + w.savanna) / pts.length;
      jungle += w.jungle / pts.length;
      wetland += (w.wetland + w.mangrove) / pts.length;
      desert += (w.desert + w.saltFlat + 0.6 * w.badlands) / pts.length;
      pine += (w.pine + w.redwood) / pts.length;
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
      woods, jungle, grass, wetland, desert, pine, ocean: ocean * (1 - smoothstep(30, 90, camera.position.y - WORLD.seaLevel)), lava: heat.lava,
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
  e.rain = localRain;
  e.bare = seasonUniforms.uWinter.value;
  e.gust = gustAt(camera.position.x, camera.position.z);
  // A winter storm: snow driving on a strong wind.
  e.storm = seasonUniforms.uWinter.value > 0.4 && cold.value > 0.3 ? smoothstep(0.25, 0.75, localRain) * smoothstep(0.25, 0.75, e.wind) : 0;
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
  // (And the Cascades' falls near you: see Landmarks.)
  for (const b of landmarks.built.values()) {
    if (b.site.kind !== 'falls' || Math.abs(b.site.x - p.x) > 400 || Math.abs(b.site.z - p.z) > 400) continue;
    for (const f of b.site.drops ?? []) {
      const drop = f.top - f.bottom, y = f.bottom + drop * 0.3;
      const d = Math.hypot(f.ix - p.x, (y - p.y) * 0.7, f.iz - p.z);
      const v = Math.min(1, 0.45 + drop / 10 + f.w / 10) / (1 + (d / (14 + drop * 2.5)) ** 2);
      fall += v;
      fallPan += v * panTowards(camera, f.ix, f.iz);
    }
  }
  for (const r of waterNear.runs) {
    const d = Math.hypot(r.x - p.x, (r.y - p.y) * 0.7, r.z - p.z);
    if (r.stream && r.width < 6) {
      const v = (0.15 + Math.min(0.85, r.steep * 6)) / (1 + (d / 10) ** 2); // (a slow, level stream all but silent)
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

// Near molten lava: the edges of the screen glowing red as you come too
// close (from some 25 m off), its heat burning you closer still (within
// 6 m), and in it, terribly. (Creative mode takes no harm: see Game.hurt.)
const lavaGlow = document.createElement('div');
lavaGlow.className = 'lava-glow';
document.body.append(lavaGlow);
let lavaGlowLevel = 0;
function lavaHeat(dt) {
  const feet = camera.position.y - controls.eyeHeight;
  const near = generator.lavaNear?.(camera.position.x, camera.position.z);
  let target = 0;
  if (near) {
    const D = Math.hypot(near.d, Math.max(0, feet - near.y));
    target = smoothstep(25, 4, D);
    if (game.mode !== 'creative' && controls.mode === 'walk') {
      if (near.d <= 0 && feet < near.y + 0.8) game.hurt(dt * 40, 'lava');
      else if (D < 6) game.hurt(dt * 6 * (1 - D / 6), 'the heat of the lava');
    }
  }
  lavaGlowLevel += (target - lavaGlowLevel) * Math.min(1, dt * 4);
  lavaGlow.style.opacity = lavaGlowLevel.toFixed(3);
}

// --- The dark -------------------------------------------------------------------
// At night you see only so far: a few dozen metres on a night without a
// moon (the land fading into black beyond), a few hundred under a bright
// full one. And your eyes take their time: out of the daylight, or away
// from a fire, it's black at first, and what little light there is comes
// up slowly, over ten seconds or so; into the light again, they adjust
// at once (and the dark round a fire looks blacker). A dark veil over the
// world (under the HUD) does it, like closing down a camera's exposure.
const eyes = { adapted: 0, veil: 0 };
const NIGHT_BLACK = new THREE.Color(0x010204);
const eyeVeil = document.createElement('div');
eyeVeil.className = 'eye-veil';
canvas.after(eyeVeil);
function nightSight(dt) {
  const e = dayNight.sunDir.y, moon = dayNight.moonlight ?? 0;
  const dark = smooth(-0.04, -0.2, e) * (ui.night?.checked ? 0 : 1);
  // How far you can see: the fog closing in to it.
  const sight = 90 + 260 * moon;
  scene.fog.far += (Math.min(scene.fog.far, sight) - scene.fog.far) * dark;
  scene.fog.near += (Math.min(scene.fog.near, sight * 0.02) - scene.fog.near) * dark;
  // (Into black, not a glowing haze: the land fades out, and stands dark against the sky.)
  scene.fog.color.lerp(NIGHT_BLACK, dark * (1 - 0.6 * moon) * 0.9);
  // How bright it is where you are: daylight, the moon, a fire or a torch near.
  let lit = 0;
  for (const l of game.fearLights()) lit = Math.max(lit, 1 - Math.hypot(l.x - camera.position.x, l.z - camera.position.z) / l.r);
  const cave = caveHaze.amount;
  const bright = Math.max((1 - dark) * (1 - 0.9 * cave), 0.35 * moon * (1 - cave), 0.6 * lit);
  // Your eyes come round to it: slowly into the dark, quickly into the light.
  const want = 1 - bright;
  eyes.adapted += (want - eyes.adapted) * (want > eyes.adapted ? Math.min(1, dt / 6) : Math.min(1, dt / 0.4));
  // The veil: as much darker as your eyes have yet to come round to the dark.
  const veil = Math.max(0, want - eyes.adapted) * 0.85;
  const edge = 0.4 * Math.max(dark, cave) * (1 - 0.5 * lit); // (and a little darker round the edges)
  if (Math.abs(veil - eyes.veil) > 0.003 || Math.abs(edge - (eyes.edge ?? 0)) > 0.003) {
    eyes.veil = veil;
    eyes.edge = edge;
    eyeVeil.style.background = veil < 0.003 && edge < 0.003 ? 'none' : `radial-gradient(ellipse at center, rgba(0,0,0,${veil.toFixed(3)}) 35%, rgba(0,0,0,${(1 - (1 - veil) * (1 - edge)).toFixed(3)}) 100%)`;
  }
}

// Weather you can see coming: rain hanging under the clouds that bring it
// (see Showers), and before a storm, lightning flickering inside it far
// off, the thunder a long, low rumble arriving seconds later.
// (A number 0..1 for these, the same for everyone online.)
function hash01(...n) {
  let h = n.reduce((h, v) => Math.imul(h ^ Math.round(v), 0x85ebca6b) ^ (h >>> 13), 0x27d4eb2f);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  return ((h ^ (h >>> 12)) >>> 0) / 4294967296;
}
const showers = new Showers(scene, clouds);
let localRain = 0; // the rain where you are: the weather's, or a shower's overhead
const far = { slot: 0 };
function farLightning(dt) {
  showers.flash = Math.max(0, showers.flash - dt * 6);
  const storm = weather.approaching.storm;
  if (storm > 0.1 && !sheltered) {
    // (Every few seconds, a chance in each heavy shower far off, by the clock:
    // online, the room's, so everyone sees the same flicker in the same cloud.)
    const T = mp.roomTime() ?? performance.now() / 1000, slot = Math.floor(T / 3);
    if (slot !== far.slot) {
      far.slot = slot;
      const s = showers.pick(camera.position, (s) => hash01(slot, Math.round(s.x / 300), Math.round(s.z / 300)) < 0.12 * storm);
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
    mistState.devilCountry = w.desert + w.savanna;
    mistState.mossy = Math.min(1, 0.55 * w.temperate + 0.9 * w.pine + w.jungle + w.wetland + 0.9 * (w.smoky ?? 0));
    mistState.smoky = w.smoky ?? 0;
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
  const target = 0.25 * mistState.marsh * low * dawn; // (a light veil: a quarter of what it was)
  mistState.value += (target - mistState.value) * Math.min(1, dt / 2);
  valleyMist(dt, foggy * dawn * (1 - 0.8 * mistState.dry));
  return mistState.value < 0.002 ? 0 : mistState.value;
}

// Grass never grows up through what you've built: the spots under the
// things nearest you are cleared (see GrassLayer).
const CLEARED = { campfire: 1, furnace: 1.1, bed: 1.2, chest: 0.7, anvil: 0.7, grindstone: 0.7, dryingRack: 0.8, tanningRack: 0.9, plot: 1.3, snare: 0.4, stake: 0.3,
  woodFloor: 2.9, stoneFloor: 2.9, chimney: 0.95, cellar: 1.9, smokingRack: 1.1, roof: 0.3, slateRoof: 0.3,
  logFloor: 2.9, cutStoneFloor: 2.9, logStairs: 2.2, plankStairs: 2.2, stoneStairs: 2.2, cutStairs: 2.2, logRoof: 0.3, shingleRoof: 0.3, tileRoof: 0.3, bedroll: 1.1, fancyBed: 1.3 };
// (Walls and fences: a strip of clearings along their length; see clearGrass.)
const CLEARED_LINE = { wall: 0.55, gate: 0.55, stoneWall: 0.6, fence: 0.4, fenceGate: 0.4, stoneFence: 0.5, woodWindow: 0.55, stoneWindow: 0.6, logWall: 0.55, plankWall: 0.5, cutStoneWall: 0.6, logWindow: 0.55, logDoor: 0.55, plankWindow: 0.5, plankDoor: 0.5, stoneDoor: 0.6, cutWindow: 0.6, cutDoor: 0.6 };
// The grass round you and the bigger animals near you bends away from them.
const SMALL = new Set(['rabbit', 'hare', 'duck', 'snake', 'songbird', 'starling', 'crow', 'gull', 'hawk', 'wolfPup', 'bat', 'eagle', 'scorpion']);
function pushGrass() {
  const p = camera.position, list = [];
  if (controls.mode === 'walk') list.push([0, p.x, p.z, 0.9]);
  for (const a of wildlife.animals) {
    if (!a.alive || SMALL.has(a.kind)) continue;
    const d = Math.hypot(a.x - p.x, a.z - p.z);
    if (d < 70) list.push([d, a.x, a.z, 0.7 + 0.55 * (a.scale ?? 1)]);
  }
  list.sort((a, b) => a[0] - b[0]);
  grassPushers.value.forEach((v, k) => (list[k] ? v.set(list[k][1], list[k][2], list[k][3], 0) : v.set(0, 0, 0, 0)));
}
const tilled = { sign: null }; // (the plots last painted: see clearGrass)
function clearGrass() {
  const p = camera.position;
  const near = [];
  for (const s of game.structures.list) {
    const d = Math.hypot(s.x - p.x, s.z - p.z);
    if (d > 130) continue;
    const line = CLEARED_LINE[s.type];
    if (line) {
      // (Along the wall: a clearing every metre of it.)
      const len = s.type.toLowerCase().includes('fence') ? 3 : 4, ax = Math.cos(s.rot), az = -Math.sin(s.rot);
      for (let u = -len / 2 + 0.5; u <= len / 2 - 0.5 + 1e-6; u += 1) near.push([d, { x: s.x + ax * u, z: s.z + az * u, type: s.type }, line]);
      continue;
    }
    const r = CLEARED[s.type];
    if (r) near.push([d, s, r]);
  }
  near.sort((a, b) => a[0] - b[0]);
  grassClearings.value.forEach((v, k) => (near[k] ? v.set(near[k][1].x, near[k][1].z, near[k][2], 0) : v.set(0, 0, 0, 0)));
  // (And the plots you've dug, painted onto the ground: see tilledSoil.)
  // (Painted into a map of the ground round you, afresh when a plot's dug,
  // watered or gone, or you've walked off towards the map's edge.)
  const plots = [];
  for (const s of game.structures.list) if (s.type === 'plot' && Math.abs(s.x - p.x) < 70 && Math.abs(s.z - p.z) < 70) plots.push({ x: s.x, z: s.z, rot: s.rot ?? 0, watered: s.watered > 0 });
  const sign = plots.map((q) => `${q.x.toFixed(1)},${q.z.toFixed(1)},${q.watered ? 1 : 0}`).join(';');
  const o = tilledOrigin.value, mid = { x: o.x + o.z / 2, z: o.y + o.z / 2 };
  if (sign !== tilled.sign || Math.abs(p.x - mid.x) > 24 || Math.abs(p.z - mid.z) > 24) {
    tilled.sign = sign;
    paintTilled(p.x, p.z, plots);
  }
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
  const target = sheltered ? 0 : 0.25 * Math.min(0.85, morning * damp * calm); // (a light veil, a quarter as thick)
  valley.amount += (target - valley.amount) * Math.min(1, dt / 3);
  cloudShadowUniforms.uMist.value = valley.amount;
  cloudShadowUniforms.uMistTop.value = (valley.floor ?? 0) + 4 + 8 * valley.amount; // (lying low, a few metres deep)
  cloudShadowUniforms.uMistColor.value.copy(scene.fog.color).lerp(MIST_WHITE, 0.35);
}
const MIST_WHITE = new THREE.Color(0xf2f4f5);
function smooth(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
const caveHaze = { target: 0, amount: 0, vast: 0, color: new THREE.Color(0x07080b) };
const openFog = { near: scene.fog.near, far: scene.fog.far };
// The graphics quality chosen on the start menu, put into effect as a
// world starts (before its land is built): the view, the fog, the
// shadows, the resolution.
function useQuality() {
  QUALITY = applyQuality();
  const d = viewDistance();
  openFog.near = d * 0.45;
  openFog.far = d * 0.95;
  dayNight.horizonDistance = d * 0.9;
  dayNight.setShadowSize(WORLD.shadowExtent, WORLD.shadowMapSize);
  PIXEL_RATIO = Math.min(window.devicePixelRatio, QUALITY.pixelRatio);
  resize();
  perfCheck.step = 0;
  perfCheck.settle = 0;
  perfCheck.frames = 0;
  perfCheck.time = 0;
}

// Once a world's land is in, a few seconds of play are timed; if this
// computer can't keep it smooth (under 32 frames a second), the game eases
// off, a step at a time: first the screen resolution, then the shadows'
// detail. Never back up again, and only these two (nothing is rebuilt), so
// no flicker or hitch.
let lightsWarmed = false;
const perfCheck = { step: 0, settle: 0, frames: 0, time: 0 };
function checkPerformance(dt) {
  const P = perfCheck;
  if (P.step >= 2 || !startMenu?.world || startMenu.open || chunks.pendingCount > 8) return;
  if ((P.settle += dt) < 3) return;
  P.frames++;
  P.time += dt;
  if (P.time < 8) return;
  const fps = P.frames / P.time;
  P.frames = P.time = P.settle = 0;
  if (fps >= 32) return void (P.step = 2);
  P.step++;
  if (PIXEL_RATIO > 1) {
    PIXEL_RATIO = 1;
    resize();
    return perfNote('Lowered the resolution a little to keep it smooth');
  }
  if (dayNight.shadowMapSize > 1024) {
    dayNight.setShadowSize(WORLD.shadowExtent, dayNight.shadowMapSize / 2);
    return perfNote('Softened the shadows a little to keep it smooth');
  }
}
function perfNote(text) {
  const el = document.createElement('div');
  el.className = 'perf-note';
  el.textContent = `${text} (Graphics on the title screen to change).`;
  document.body.append(el);
  setTimeout(() => (el.style.opacity = '0'), 5000);
  setTimeout(() => el.remove(), 6500);
}
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

// The blue haze that hangs over the Smoky Mountains (from the trees): the
// far ridges fading into blue, softer after rain, gone at night.
const SMOKY_BLUE = new THREE.Color(0x8fa8c8);
const smokyState = { value: 0 };
function smokyHaze(dt) {
  const target = sheltered || underwater ? 0 : (mistState.smoky ?? 0) * (1 - 0.6 * weather.rain);
  smokyState.value += (target - smokyState.value) * Math.min(1, dt / 3);
  const a = smokyState.value;
  if (a < 0.002) return;
  const lum = Math.min(1, 0.25 + 0.75 * Math.min(1, dayNight.light.intensity / 2 + dayNight.hemi.intensity / 3));
  scene.fog.color.lerp(printColour.copy(SMOKY_BLUE).multiplyScalar(lum), 0.4 * a);
  scene.fog.far *= 1 - 0.3 * a;
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
  scene.fog.near = openFog.near + (12 + 40 * caveHaze.vast - openFog.near) * a;
  scene.fog.far = openFog.far + (170 + 230 * caveHaze.vast - openFog.far) * a;
  scene.fog.color.lerp(caveHaze.color, a);
  dayNight.sky.visible = a < 0.98;
}

// --- Loop --------------------------------------------------------------------
let PIXEL_RATIO = Math.min(window.devicePixelRatio, QUALITY.pixelRatio);
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

// --- Loading a world ------------------------------------------------------------
// After you start or join a world, a screen while the land round you is
// built: you come in once it's all there (the chunks two out from yours,
// each at its full detail), not onto bare ground with the land popping in.
// Meanwhile nothing else is worked out (no animals, weather or player)
// and the world's drawn only now and then, so the building gets nearly
// all the time there is.
const RINGS = 2; // (5 x 5 chunks: 640 m across)
const loadScreen = document.createElement('div');
loadScreen.className = 'load-screen';
loadScreen.hidden = true;
loadScreen.innerHTML = `<div class="ls-card"><h2 class="ls-head">Building the land</h2><p class="ls-name"></p><div class="ls-bar"><span></span></div><p class="ls-note">Getting ready…</p></div>`;
document.body.append(loadScreen);
let loading = null; // { since, drawn }
function startLoading(name, waiting = false) {
  loading = { since: performance.now(), drawn: 0, waiting }; // (waiting: the world's still to be set up)
  loadScreen.querySelector('.ls-name').textContent = name ?? '';
  loadScreen.querySelector('.ls-bar span').style.width = '0%';
  loadScreen.classList.remove('ls-done');
  loadScreen.hidden = false;
  chunks.budgetScale = 8; // (no need to keep it smooth: nothing's moving)
}
function loadingFrame(now) {
  if (spawnSearch) {
    // (A slice of the search for where you start, each frame, till it's found.)
    loadScreen.querySelector('.ls-note').textContent = 'Finding a good place to start…';
    const end = performance.now() + 30;
    let r;
    do r = spawnSearch.steps.next();
    while (!r.done && performance.now() < end);
    if (!r.done) return;
    const { done, after } = spawnSearch;
    spawnSearch = null;
    done(r.value);
    after?.();
    loading.since = performance.now();
  }
  if (loading.waiting) return;
  camera.getWorldDirection(dir);
  chunks.update(camera.position, mp.roomTime() ?? now / 1000, dir);
  // (Online: what the others do comes in meanwhile, and the time of day.)
  sync.update();
  // (Drawn about once a second: so the graphics card has everything ready
  // to draw before you come in, and the first frames don't stall.)
  // (The very first, after the graphics card has got its shaders ready in
  // the background: made all at once, in the middle of a draw, they can
  // hold up the page for seconds.)
  if (!loading.compiled) {
    loading.compiling ??= (renderer.compileAsync ? renderer.compileAsync(scene, camera) : Promise.resolve()).catch(() => {}).then(() => loading && (loading.compiled = true));
  } else if (now - loading.drawn > 1000) {
    loading.drawn = now;
    const t = performance.now();
    renderer.render(scene, camera);
    performance.measure('loading draw', { start: t });
  }
  const { done, total } = chunks.readyNear(camera.position, RINGS);
  loadScreen.querySelector('.ls-bar span').style.width = `${Math.round((100 * done) / total)}%`;
  const waited = (now - loading.since) / 1000;
  // (The rivers and caves round you worked out here too, for the water and
  // the ground underfoot: done now, behind this screen, rather than as a
  // stall the moment you come in. Said first, then done the frame after.)
  if (done >= 1 && loading.warm === undefined) {
    loading.warm = 0;
    loadScreen.querySelector('.ls-note').textContent = 'Laying out the rivers…';
    return;
  }
  if (loading.warm === 0) {
    loading.warm = 1;
    const p = camera.position, t = performance.now();
    groundAt(p.x, p.y, p.z);
    waterAt(p.x, p.z);
    performance.measure('rivers warm', { start: t });
    return;
  }
  loadScreen.querySelector('.ls-note').textContent = done < total ? `${done} of ${total} pieces of land` : 'Ready';
  // (In when it's all there; or, if something's gone wrong, after two minutes anyway.)
  if (done < total && waited < 120) return;
  loading = null;
  chunks.budgetScale = 1;
  loadScreen.classList.add('ls-done');
  setTimeout(() => loading || (loadScreen.hidden = true), 600);
}

// (The start menu: on the title screens the world behind isn't seen at all,
// so nothing is worked out or drawn; paused in a world, a few frames a
// second are enough to show it there behind the menu.)
let startMenu = null, menuFrame = 0;
function tick(now) {
  if (startMenu?.open && (!startMenu.world || now - menuFrame < 125)) {
    lastTime = now;
    requestAnimationFrame(tick);
    return;
  }
  menuFrame = now;
  const started = performance.now();
  renderer.info.reset();
  const elapsed = (now - lastTime) / 1000;
  // (Big hitches shouldn't teleport the player; and never backwards: a frame
  // stamped before the last, which some browsers give, would run things in
  // reverse, a fading flash growing ever brighter.)
  const dt = Math.max(0, Math.min(elapsed, 0.1));
  checkPerformance(elapsed);
  // (Once the land's in: the drawing made ready for each number of fire
  // lights, so the first torch lit doesn't stall a frame. See Torches.)
  if (!lightsWarmed && startMenu?.world && chunks.pendingCount === 0) (lightsWarmed = true), torches.prewarm(renderer, scene, camera);
  lastTime = now;
  // (A world starting: only the land built, behind the loading screen.)
  if (loading) {
    loadingFrame(now);
    requestAnimationFrame(tick);
    return;
  }
  controls.update(dt);
  playerTraces(dt);
  camera.getWorldDirection(dir);
  const worldNow = mp.roomTime() ?? now / 1000; // (online, the room's clock: the same for everyone)
  chunks.update(camera.position, worldNow, dir); // (online, by the room's clock: the lava creeping, the water rippling, the same for all)
  weather.spring = seasonUniforms.uSpring.value;
  weather.winter = seasonUniforms.uWinter.value;
  weather.summer = Math.max(0, 1 - seasonUniforms.uSpring.value - seasonUniforms.uAutumn.value - seasonUniforms.uWinter.value);
  weather.update(dt, dayNight.hour);
  climateHere(dt);
  // (Online, by the room's clock: the same gusts for everyone.)
  const wind = updateWind(worldNow, 0.95 * weather.storm + 0.35 * weather.rain);
  // (Where a bolt strikes, far off: the land before rivers, which is quick to work out.)
  // (Out on high open ground in a storm, not under a roof: the lightning may find you.)
  lightning.exposed = controls.mode === 'walk' && !sheltered && (game.sheltered ?? 0) < 0.5 ? 0.12 * (around.env?.exposure ?? 0) * (1 - (around.env?.canopy ?? 0)) : 0;
  lightning.update(dt, weather.storm, camera, dayNight, (x, z) => generator.getBaseHeight(x, z), sound, sheltered);
  farLightning(dt);
  afterRain(dt);
  dayNight.viewDir = dir;
  dayNight.update(dt, camera.position, weather);
  // Indoors, the daylight only what comes in through the windows and an
  // open door (see Game: indoorGloom): your eyes adjusting, a moment, as
  // you come in out of the sun or go back out into it.
  indoorDim += ((game.indoorGloom ?? 0) - indoorDim) * Math.min(1, dt * 1.5);
  if (indoorDim > 0.01) {
    const daylight = 1 - (dayNight._w?.night ?? 0);
    dayNight.hemi.intensity *= 1 - indoorDim * 0.75 * daylight;
    dayNight.light.intensity *= 1 - indoorDim * 0.35 * daylight;
  }
  // The ground gets wet in the rain (puddles), and dries off over a few minutes.
  seasonUniforms.uWet.value = Math.min(1, Math.max(0, seasonUniforms.uWet.value + (localRain > 0.2 ? dt / 20 : -dt / 240)));
  // Snow lies over everything after a snowfall, and stays: through the
  // depth of winter it doesn't melt at all; only in the sunshine early and
  // late in the winter (and for good once it's spring).
  const winterNow = seasonUniforms.uWinter.value;
  const firstSnowing = firstSnow();
  const snowing = weather.rain > 0.2 && (winterNow > 0.5 || firstSnowing);
  const sunshine = smooth(0.05, 0.25, dayNight.sunDir.y) * (1 - smooth(0.5, 0.8, weather.cover)) * (weather.rain > 0.05 ? 0 : 1);
  const thaw = sunshine * (1 - smooth(0.6, 0.9, winterNow)) / 240 + (winterNow < 0.05 ? 1 / 120 : 0);
  seasonUniforms.uSnowfall.value = Math.min(1, Math.max(0, seasonUniforms.uSnowfall.value + (snowing ? dt / 60 : -dt * thaw)));
  shadowReach(dt);
  northernLights(dt);
  // Rain closes the view in, and so does the mist that lies over the
  // wetlands at dawn.
  clearGrass();
  pushGrass();
  const mist = marshMist(dt);
  // (Under a lid of grey cloud a grey haze lies over everything, softening the distance.)
  const lid = smooth(0.6, 0.92, weather.cover);
  scene.fog.near = openFog.near * (1 - 0.75 * localRain) * (1 - 0.85 * mist) * (1 - 0.7 * lid);
  scene.fog.far = openFog.far * (1 - 0.5 * localRain) * (1 - 0.75 * mist) * (1 - 0.3 * lid);
  if (mist > 0) scene.fog.color.lerp(MIST, 0.45 * mist);
  stormTint();
  smokyHaze(dt);
  nightSight(dt);
  dayNight.sky.visible = true;
  applyCaveHaze(dt);
  applyUnderwater();
  applySandstorm();
  cloudSky.cover = weather.cover;
  cloudSky.storm = weather.storm;
  cloudSky.weather = weather;
  cloudSky.viewMatrix = camera.matrixWorldInverse;
  // (Every other frame, with the time since: they drift a few centimetres a frame.)
  cloudOwed += dt;
  if (shadowTurn === 0 || cloudOwed > 0.1) {
    clouds.update(cloudOwed, camera.position, dayNight.horizon, generator, wind, cloudSky);
    cloudOwed = 0;
  }
  showers.update(dt, camera, clouds.wind, wind, dayNight.horizon, scene.fog);
  // (Under one of the showers you can see, it's raining on you too.)
  localRain = Math.max(weather.rain * Math.min(1, climate.wet), showers.rainAt(camera.position)); // (the desert hardly gets any: see climateHere)
  tornadoUpdate(dt);
  seasons.update(dayNight.playing ? dt / (WORLD.dayLengthMinutes * 60) : 0, dt);
  if (dayNight.playing) game.passDays(dt / (WORLD.dayLengthMinutes * 60));
  // In a cold winter, it snows (over the lands that have one).
  const snow = Math.max(seasonUniforms.uWinter.value, firstSnowing ? (seasons.highSnowing ? smoothstep(60, 85, camera.position.y) : 1) : 0, seasonUniforms.uHighSnow.value * smoothstep(80, 100, camera.position.y)) * coldHere(dt);
  rain.update(worldNow, camera.position, localRain, clouds.wind, wind, dayNight.horizon, snow);
  // Water: the sun's glitter on it (not behind cloud), rings where the rain falls; the waterfalls' mist in the daylight.
  sparkleUniforms.uSunView.value.copy(dayNight.lightDirection).transformDirection(camera.matrixWorldInverse);
  sparkleUniforms.uSunColor.value.copy(dayNight.light.color);
  sparkleUniforms.uGlitter.value = Math.min(1, dayNight.light.intensity / 2.2) * (1 - smoothstep(0.55, 0.85, weather.cover)) * (1 - weather.rain);
  sparkleUniforms.uRainfall.value = localRain * (1 - snow);
  mistLight.value = 0.2 + 0.8 * smoothstep(-0.1, 0.25, dayNight.sunDir.y);
  // Leaves drifting down from the trees round about.
  const autumn = seasonUniforms.uAutumn.value, spring = seasonUniforms.uSpring.value, winter = seasonUniforms.uWinter.value;
  // (In and near the jungle no leaves turn and fall.)
  const turning = smoothstep(0.3, 0.6, cold.value);
  fallingLeaves.update(dt, camera, trees.crowns, WORLD.chunkSize, (x, z) => chunks.groundHeightAt(x, z), { autumn: autumn * turning, spring, winter: winter * turning, summer: Math.max(0, 1 - (autumn + winter) * turning - spring) }, wind, windDirection.value, sheltered);
  body.update(controls, dt);
  geese.update(dt, camera, { spring, autumn: autumn * turning }, sound, (x, z) => (sound.from(x, z), panTowards(camera, x, z)));
  const gameLights = game.update(dt, {
    time: now / 1000, wind: clouds.wind, light: ambientLight, day: around.env.day, night: 1 - around.env.day, rain: localRain,
    snowing: weather.rain > 0.2 && seasonUniforms.uWinter.value > 0.5 && cold.value > 0.3,
    // A blizzard: a hard snowstorm (bitter cold in the wind).
    dust: sandstorm.amount,
    blizzard: seasonUniforms.uWinter.value > 0.5 && cold.value > 0.3 ? smoothstep(0.45, 0.85, weather.rain) * (0.5 + 0.5 * weather.storm) : 0,
    winter: seasonUniforms.uWinter.value, spring: seasonUniforms.uSpring.value, autumn: seasonUniforms.uAutumn.value,
    summer: Math.max(0, 1 - seasonUniforms.uWinter.value - seasonUniforms.uSpring.value - seasonUniforms.uAutumn.value),
    planPoint: (origin, direction, reach) => solidHit(origin, direction, reach)?.point ?? null,
    season: seasons.name,
    // (Underground: what kind of cave, see CaveField.biomeAt; and lava under your feet.)
    cave: sheltered ? generator.caves.biomeAt(camera.position.x, camera.position.y, camera.position.z) : null,
    lava: sheltered && !!waterAt(camera.position.x, camera.position.z)?.lava && camera.position.y - controls.eyeHeight < (waterAt(camera.position.x, camera.position.z)?.level ?? -1e9) + 0.3,
  });
  caveSounds(dt);
  torches.update(worldNow, camera.position, caveGlowLights.length ? [...gameLights, ...caveGlowLights] : gameLights);
  updateCaveLife(now / 1000, sheltered ? camera.position : null);
  // The spiders in the dark, round you when you're down in the caves.
  // The landmarks near you (found, the first time you come to one), and the old mines' timbers.
  if (landmarks.generator !== generator) (landmarks.generator = generator), landmarks.built.forEach((b) => scene.remove(b.group)), landmarks.built.clear();
  landmarks.update(dt, camera.position.x, camera.position.z);
  game.landmarkHere = sheltered ? null : landmarks.at(camera.position.x, camera.position.z);
  if (game.landmarkHere && controls.mode === 'walk' && game.mode !== 'creative') game.discoverLandmark(game.landmarkHere);
  if ((mineWait -= dt) <= 0) {
    mineWait = 1;
    mineProps.update(camera.position.x, camera.position.z, generator.caves.field);
    for (const c of mineProps.chests) if (Math.hypot(c.x - camera.position.x, c.y - camera.position.y, c.z - camera.position.z) < 30) game.ruinChest(c);
    if (sheltered) for (const m of generator.caves.field.minesNear(camera.position.x, camera.position.z, camera.position.x, camera.position.z)) if (generator.caves.field.mineAt(m, camera.position.x, camera.position.y - 1, camera.position.z) < 0) game.inMine(m.id);
  }
  spiders.update(Math.min(dt, 0.1), {
    eye: camera.position, under: caveFocus.under && controls.mode === 'walk', caves: generator.caves, terrain: (x, z) => chunks.groundHeightAt(x, z),
    hurt: (d) => game.hurt(d, 'a cave spider'), poison: () => game.survival.poison(25), fear: game.fearLights(),
    sound, pan: (x, z) => panTowards(camera, x, z), alive: game.survival.alive && !(peaceful?.checked ?? false),
    chamberAt: (x, z) => generator.caves.field.chamberAt(x, z),
    broodGone: (key) => { const died = game.wildlife.bossDeaths?.[key]; return died !== undefined && dayNight.day + dayNight.hour / 24 - died < 6; },
  });
  updateVisibility();
  const haze = heatHaze(dt);
  sound.update(underwater ? 0 : localRain * (1 - snow), sheltered || underwater);
  const env = surroundings(dt, snow);
  if (!sheltered && !underwater) surfSound();
  // The wildlife round you.
  const life = {
    waterAt: (x, z) => waterAt(x, z),
    splash: (x, y, z, size = 1) => traces.splash(x, y, z, 6, 1.2 * size, 0.6 * size),
    bleed,
    fires: game.fearLights(), wildfires: tornadoes.now?.strength > 0 ? [...fires.zones(), { x: tornadoes.now.x, z: tornadoes.now.z, r: tornadoes.now.r * 6 + 150 }] : fires.zones(), caches: () => game.caches(), raid: (c) => game.raid(c),
    autumn: seasonUniforms.uAutumn.value,
    step: (a, x, z, running) => {
      const [shape, size] = ANIMAL_PRINTS[a.kind] ?? [PRINT.hoof, 0.12];
      footfall(x, z, a.heading, shape, size * a.scale, running ? 1 : 0.35, size >= 0.07); // (the faint tracks in grass to follow: not a bird's or a snake's)
      logTrack(a, x, z, size);
      // (Close by, you hear them: hooves and paws on the ground, a branch
      // cracking as a big one comes through the woods.)
      const d = Math.hypot(x - camera.position.x, z - camera.position.z);
      if (d < 22 && size * a.scale > 0.09) {
        const pan = panTowards(camera, x, z), loud = Math.min(1, 8 / (d + 4)) * (running ? 1 : 0.55) * Math.min(1.4, size * a.scale * 7);
        const surface = stepSurface(x, z);
        if (surface !== 'water') sound.step(surface, loud * 0.6);
        if (surface === 'leaves' && Math.random() < 0.04 * (running ? 2 : 1)) sound.call('crack', pan, loud * 0.8);
      }
    },
    camera, forward: dir, generator, ground: (x, z) => chunks.groundHeightAt(x, z), trees, rocks, chunkSize: WORLD.chunkSize, seaLevel: WORLD.seaLevel, seed: generator.seed,
    worldDay: dayNight.day + dayNight.hour / 24, // (for the great beasts' coming back: see Wildlife.#bosses)
    // (A torch in your hand, or a fire or torch close by: the animals' eyes shine back out of the dark. See Wildlife.#eyeshine.)
    eyeLight: gameLights.some((l) => Math.hypot(l.x - camera.position.x, l.z - camera.position.z) < 12) || torches.torches.some((t) => t.lit && t.point.distanceTo(camera.position) < 10),
    day: env.day, dawn: env.dawn, dusk: env.dusk, night: 1 - env.day, winter, spring, summer: Math.max(0, 1 - autumn - spring - winter),
    rain: localRain, wind, windDir: windDirection.value, meadow: Math.min(1, env.grass + env.wetland + 0.3 * env.woods),
    sheltered, sound, pan: (x, z) => (sound.from(x, z), panTowards(camera, x, z)), tame: peaceful?.checked ?? WORLD.tameWildlife,
    player: game.player, structures: game.structures,
    // (Online: the others, for the host's animals to mind; their calls, to be heard by everyone.)
    others: sync.others(), people: sync.people(), netTime: mp.roomTime(),
    emit: (n, x, z, v, d, heard) => sync.emit(n, x, z, v, d, heard), emitTo: (id, what) => sync.emitTo(id, what),
  };
  wildlife.update(dt, life);
  mp.update(dt, {
    x: camera.position.x, y: camera.position.y - controls.eyeHeight, z: camera.position.z, yaw: controls.euler.y, pitch: controls.euler.x, // (the way you look: yaw first, then pitch)
    crouch: controls.crouch, sprint: controls.sprinting, swim: controls.swimming, fly: controls.mode !== 'walk',
    pose: game.pose(), // (what's in your hand, what you're doing with it)
  });
  sync.update();
  fish.update(dt, { ...life, traces, autumn, ground: (x, z) => chunks.groundHeightAt(x, z) });
  traces.update(dt);
  // Fire, smoke and dust, lit by the light of the sky.
  ambientLight.copy(scene.fog.color).lerp(MIST_WHITE, 0.25).multiplyScalar(0.6 + 0.5 * Math.min(1, dayNight.light.intensity / 2));
  const night = dayNight._w?.night ?? 0;
  const air = { time: worldNow, netTime: worldNow, day: dayNight.day + dayNight.hour / 24, camera, generator, wind: clouds.wind, rain: localRain, light: ambientLight, night, sound, pan: (x, z) => (sound.from(x, z), panTowards(camera, x, z)), ground: (x, z) => generator.getBaseHeight(x, z) };
  fires.update(dt, air);
  grassCut.update(dt, camera.position, air.day);
  volcanoes.update(dt, air);
  sandstorm.update(dt, { ...air, desert: sheltered ? 0 : mistState.desert ?? 0, ground: (x, z) => chunks.groundHeightAt(x, z) || camera.position.y, fog: scene.fog.color });
  devils.update(dt, { ...air, seed: generator.seed, hour: dayNight.hour, winter: seasonUniforms.uWinter.value, ground: (x, z) => chunks.groundHeightAt(x, z) });
  shootingStars.update(dt, camera, sheltered || underwater ? 0 : (dayNight._w?.night ?? 0) * (1 - smooth(0.3, 0.6, weather.cover)), worldNow);
  life.beeBoxes = game.structures.list.filter((st) => st.type === 'beeBox' && st.data?.bees);
  insects.update(dt, life);
  env.tornado = tornadoes.sound?.loud ?? 0;
  env.tornadoPan = tornadoes.sound?.pan ?? 0;
  env.hail = tornadoes.sound?.hail ?? 0;
  env.buzz = insects.buzz.level;
  env.buzzPan = insects.buzz.pan;
  // (The calls round about by the room's clock and where you are: see Sound's ambience.)
  env.clock = worldNow;
  env.cell = [Math.round(camera.position.x / 150), Math.round(camera.position.z / 150)];
  env.panTo = (a) => panTowards(camera, camera.position.x + Math.cos(a) * 40, camera.position.z + Math.sin(a) * 40);
  // (Underground the wind and the water above are shut out: only the river in the rock, if there's one near.)
  sound.ambience(sheltered ? { ...env, wind: 0, gust: 0, fall: 0, river: 0, brook: caveSounds.brook ?? 0, brookPan: 0, canopy: 0, exposure: 0, storm: 0 } : env);
  // (The ground trembles as a volcano rumbles.)
  lavaHeat(dt);
  const tremble = volcanoes.shake > 0 && !controls.swimming ? Math.sin(now * 0.05) * 0.07 * volcanoes.shake : 0;
  camera.position.y += tremble;
  const eye = thirdPersonView(dt, now);
  camera.updateMatrixWorld();
  chunks.cull(camera.position); // (the land behind the hills not drawn)
  // (Every other frame, for what can wait a frame: see the clouds.)
  shadowTurn = (shadowTurn + 1) % 2;
  // (Animals only, for testing: everything else hidden, each animal labelled.)
  const animalsOnly = animalsOnlyBox?.checked;
  const hidden = [];
  if (animalsOnly) {
    for (const child of scene.children) if (child.visible && !child.isLight && !child.userData.wildlife) (child.visible = false), hidden.push(child);
  }
  labelAnimals(animalsOnly);
  if (ui.rays.checked && !animalsOnly) {
    light.strength = dayNight.lightStrength;
    light.reach = dayNight.shaftReach;
    light.haze = haze;
    rayEffects.render(scene, camera, light);
  } else {
    renderer.render(scene, camera);
  }
  for (const child of hidden) child.visible = true;

  if (eye) camera.position.copy(eye); // (back to your own eyes, for everything else)
  camera.position.y -= tremble;
  // (On the map: the ruins you've been to, and where an old map showed more.)
  // (Testing: every ruin for 2 km round, the far ones pointed to from the map's edge.)
  const testing = game.mode === 'testing';
  const keepMark = testing ? { ...ruins.keep(generator), r: 0 } : game.keep?.mark;
  minimap.marks = [...(keepMark ? [{ x: keepMark.x, z: keepMark.z, r: keepMark.r, kind: 'keep' }] : []), ...(game.waypoint ? [{ x: game.waypoint.x, z: game.waypoint.z, kind: 'goal' }] : []), ...(testing ? ruins.sitesNear(camera.position.x, camera.position.z, 2000, generator, 4) : ruins.sitesOf(game.ruinsSeen, generator)).filter((r) => !r.keep).map((r) => ({ x: r.x, z: r.z, kind: 'ruin', edge: testing }))];
  minimap.fog = game.mode === 'survival' ? { explored: game.explored, size: WORLD.chunkSize, version: game.exploredVersion ?? 0 } : null;
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
window.world = { THREE, landmarks, mineProps, geese, tornadoes, spawnTornado, dayNight, spiders, bigMap, mp, sync, waterAt, game, traces, fish, fires, spiders, volcanoes, sandstorm, devils, renderer, scene, camera, chunks, farTrees, trees, fallingLeaves, cloudShadowUniforms, wildlife, insects, water, rivers, controls, dayNight, clouds, weather, seasons, rain, lightning, sound, showers, aurora, bow, rayEffects, torches, hotbar, groundAt, get generator() { return generator; }, WORLD };

// (The rest of a test address: the time of day, weather and season, and
// the panels hidden for a clean picture. See TEST.)
if (TEST.has('hour')) {
  const cycle = document.getElementById('cycle');
  if (cycle?.checked) cycle.click();
  ui.time.value = TEST.get('hour');
  ui.time.dispatchEvent(new Event('input'));
}
for (const [key, id] of [['weather', 'weather'], ['season', 'season']]) {
  const el = TEST.has(key) && document.getElementById(id);
  if (el) (el.value = TEST.get(key)), el.dispatchEvent(new Event('change'));
}
if (TEST.has('hide')) window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyP', key: 'p' }));
// (For comparing: everything drawn, the land behind the hills too.)
if (TEST.has('noocclude')) chunks.occlusion = false;
if (TEST.has('norugged')) chunks.noRugged = true; // (rugged land far off no finer than the rest)
// (For testing it: the loading screen, as a world starts.)
if (TEST.has('loadscreen')) startLoading('Test world');

// --- Title screen, game modes, saved worlds (see StartMenu) ---------------------
// (Not for a test address, e.g. the screenshot tool's: that's straight into testing.)
function applyMode(mode) {
  game.mode = mode;
  // The debug panel is for testing; creative and survival play without it.
  if (ui.panel) ui.panel.hidden = mode !== 'testing';
  const vitals = document.querySelector('#hud .vitals');
  if (vitals) vitals.hidden = mode === 'creative';
  if (mode === 'creative' && !ui.fly.checked) ui.fly.click();
  if (mode === 'survival' && ui.fly.checked) ui.fly.click();
  if (mode === 'creative') game.survival.reset();
}
function whereYouAre() {
  return { x: camera.position.x, y: camera.position.y, z: camera.position.z, yaw: controls.euler.y, pitch: controls.euler.x };
}
function saveWorld(world) {
  if (!world || world.mode === 'testing' || world.dead) return; // (a life that's over is never saved again)
  game.save();
  torches.save?.();
  rememberWorld({ ...world, camera: whereYouAre() });
}
let joinedHour = null;
// For testing online play: ?mp=host (open this world) or ?mp=<code> (join
// one), with &server=ws://… and &name=….
if (TEST.get('mp')) {
  const url = TEST.get('server') ?? 'ws://localhost:8787', name = TEST.get('name') ?? 'Tester';
  const go = TEST.get('mp') === 'host'
    ? mp.host(url, name, { name: 'Test world', seed: WORLD.seed, mode: 'creative' }, dayNight.hour, WORLD.dayLengthMinutes)
    : mp.join(url, TEST.get('mp'), name).then((w) => (dayNight.hour = w.hour));
  go.catch((e) => console.error('online:', e.message));
}
if (!TESTING) {
  const menu = new StartMenu({
    onPlay: (world) => {
      // (The loading screen up first, then the world set up behind it: working
      // out where you start can take a moment, and the screen shouldn't freeze.)
      startLoading(world.name, true);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const t = performance.now();
        useQuality();
        game.mode = world.mode;
        setSeed(world.seed, world.mode === 'testing' ? null : world.id, !world.camera, true);
        performance.measure('world setup', { start: t });
        ui.seed.value = world.seed;
        // (Survival: onto your feet once where you start is found, not before: see loadingFrame.)
        if (spawnSearch) spawnSearch.after = () => applyMode(world.mode);
        else applyMode(world.mode);
        // (Back where you left off.)
        // (Joined online: the room's time of day.)
        if (world.guest && joinedHour !== null) (dayNight.hour = joinedHour), (joinedHour = null);
        const c = world.camera;
        if (c) {
          camera.position.set(c.x, c.y, c.z);
          camera.rotation.order = 'YXZ';
          camera.rotation.set(c.pitch ?? 0, c.yaw ?? 0, 0);
          controls.euler.set(c.pitch ?? 0, c.yaw ?? 0, 0, 'YXZ'); // (the controls look on from there)
        }
        controls.softLanding = true; // (however high you start, coming down to the ground doesn't hurt)
        loading.since = performance.now();
        loading.waiting = false;
      }));
    },
    onSave: (world) => saveWorld(world),
    onQuit: () => mp.leave(),
    // Online: open your new world to others (the room keeps its clock from
    // yours), or join someone's (their world's seed, their time of day).
    onHost: ({ url, name, world }) => mp.host(url, name, { name: world.name, seed: world.seed, mode: world.mode }, dayNight.hour, WORLD.dayLengthMinutes),
    onJoin: ({ url, code, name }) =>
      mp.join(url, code, name).then((w) => {
        joinedHour = w.hour;
        return { id: `online-${w.code}`, name: w.world.name, seed: w.world.seed, mode: w.world.mode, guest: true };
      }),
  });
  menu.onlineCode = () => (mp.connected ? mp.code : null);
  // Survival is for keeps: when you die (but online), that life's world is
  // wiped at once, before the death screen shows (see Game.#die), and the
  // way out is back to the menu, where the seed waits for a new life.
  game.online = () => mp.connected;
  game.onDeath = ({ days, hardcore }) => {
    if (!hardcore || !menu.world) return;
    torches.clearWorld?.();
    endLife(menu.world, days);
    menu.world.dead = true;
  };
  game.onLeave = () => menu.leaveDead();
  // (Online, a new life starts where the world began.)
  game.onNewLife = () => placeCamera(true);
  startMenu = menu;
  window.addEventListener('beforeunload', () => saveWorld(menu.world));
  // (Every couple of minutes, quietly, too.)
  setInterval(() => menu.world && !menu.open && saveWorld(menu.world), 120000);
}
