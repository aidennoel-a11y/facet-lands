import * as THREE from 'three';
import { WORLD } from './config.js';
import { TerrainGenerator } from './world/TerrainGenerator.js';
import { ChunkManager } from './world/ChunkManager.js';
import { createWaterLayer } from './world/layers/WaterLayer.js';
import { createTreeLayer } from './world/layers/TreeLayer.js';
import { PlayerControls } from './controls/PlayerControls.js';
import { Minimap } from './ui/Minimap.js';

const SKY_TOP = new THREE.Color(0x3f7fd0);
const SKY_HORIZON = new THREE.Color(0xd6e8f7);

// --- Renderer, scene, camera -------------------------------------------------
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
const drawDistance = WORLD.viewDistance * WORLD.chunkSize;
scene.fog = new THREE.Fog(SKY_HORIZON, drawDistance * 0.45, drawDistance * 0.95);

const camera = new THREE.PerspectiveCamera(60, 1, 0.3, drawDistance * 1.5);

// Gradient sky dome that follows the camera.
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(drawDistance * 1.2, 32, 16),
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { top: { value: SKY_TOP }, horizon: { value: SKY_HORIZON } },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 top;
      uniform vec3 horizon;
      varying vec3 vDir;
      void main() {
        float t = pow(clamp(vDir.y, 0.0, 1.0), 0.55);
        gl_FragColor = vec4(mix(horizon, top, t), 1.0);
        #include <colorspace_fragment>
      }`,
  }),
);
sky.renderOrder = -1;
scene.add(sky);

// Soft sky/ground fill plus a warm sun: flat faces read clearly as facets.
scene.add(new THREE.HemisphereLight(0xdcecff, 0x5b4c3a, 1.4));
const sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
sun.position.set(-0.7, 0.75, 0.45);
scene.add(sun);

// --- Terrain -----------------------------------------------------------------
const terrainMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
let generator = new TerrainGenerator(WORLD.seed);
const chunks = new ChunkManager(scene, generator, WORLD, terrainMaterial);
const water = createWaterLayer();
const trees = createTreeLayer();
chunks.addLayer(water);
chunks.addLayer(trees);

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
  groundHeight: (x, z) => chunks.groundHeightAt(x, z),
  seaLevel: WORLD.seaLevel,
  collide: (position, radius) => trees.collide(position, radius, WORLD.chunkSize),
});
placeCamera();

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
  tris: document.getElementById('stat-tris'),
  trees: document.getElementById('stat-trees'),
  alt: document.getElementById('stat-alt'),
  speed: document.getElementById('stat-speed'),
};
ui.seed.value = WORLD.seed;

function setSeed(seed) {
  WORLD.seed = seed;
  generator = new TerrainGenerator(seed);
  chunks.setGenerator(generator);
  minimap.invalidate();
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
  for (const m of [terrainMaterial, water.material, trees.material]) m.wireframe = ui.wireframe.checked;
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
});

// --- Loop --------------------------------------------------------------------
function resize() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

let lastTime = performance.now();
const dir = new THREE.Vector3();
let frames = 0;
let fpsTime = 0;

function tick(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  controls.update(dt);
  chunks.update(camera.position, now / 1000);
  sky.position.copy(camera.position);
  renderer.render(scene, camera);

  camera.getWorldDirection(dir);
  minimap.update(generator, camera.position, Math.atan2(dir.x, -dir.z), WORLD.seaLevel);

  frames++;
  fpsTime += dt;
  if (fpsTime >= 0.5) {
    ui.fps.textContent = Math.round(frames / fpsTime);
    frames = 0;
    fpsTime = 0;
    ui.chunks.textContent = chunks.pendingCount
      ? `${chunks.loadedCount} +${chunks.pendingCount}`
      : `${chunks.loadedCount}`;
    ui.tris.textContent = `${(chunks.triangleCount / 1000).toFixed(0)}k`;
    ui.trees.textContent = `${(trees.count / 1000).toFixed(1)}k`;
    ui.alt.textContent = `${Math.round(camera.position.y)} m`;
    ui.speed.textContent = `${Math.round(controls.currentSpeed)} m/s`;
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// Exposed for tinkering from the dev console.
window.world = { scene, camera, chunks, controls, get generator() { return generator; }, WORLD };
