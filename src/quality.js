import { WORLD } from './config.js';
import { fitWorld } from './settings.js';

// How much the game asks of your computer: how far the land is drawn and
// in how much detail, the grass, the trees' shadows, the shadow map and the
// screen's resolution. Chosen on the start menu (remembered in this
// browser), and applied as a world starts (its land is built for it).
// High is the full world as config.js has it.

const KEY = 'facet-lands:quality';

export const QUALITY = {
  low: {
    name: 'Low',
    blurb: 'For laptops and older computers: 1.3 km view, less detail, fewer shadows.',
    world: {
      viewDistance: 10,
      lods: [
        { maxDistance: 1, resolution: 32 },
        { maxDistance: 3, resolution: 16 },
        { maxDistance: 5, resolution: 16 },
        { maxDistance: 7, resolution: 8 },
        { maxDistance: 9, resolution: 4 },
        { maxDistance: Infinity, resolution: 4 },
      ],
      detailResolution: 32,
      treeMaxLod: 0, // (full trees only on the chunks round you; simpler ones beyond)
      treeShadowLod: 0,
      rockMaxLod: 1,
      farTreeMaxLod: 4,
      farTreeDetailLod: 2,
      grassSpacing: 2.2,
      grassFade: [45, 70],
      farGrassMaxLod: 0,
      farGrassFade: [100, 128],
      shadowExtent: 260,
      shadowMapSize: 1024,
      chunkBuildBudgetMs: 3,
    },
    pixelRatio: 1,
    antialias: false,
  },
  medium: {
    name: 'Medium',
    blurb: 'A 1.8 km view in good detail, and shadows near you.',
    world: {
      viewDistance: 14,
      lods: [
        { maxDistance: 1, resolution: 64 },
        { maxDistance: 3, resolution: 32 },
        { maxDistance: 5, resolution: 16 },
        { maxDistance: 8, resolution: 16 },
        { maxDistance: 11, resolution: 8 },
        { maxDistance: Infinity, resolution: 4 },
      ],
      detailResolution: 32,
      grassFade: [65, 100],
      farGrassFade: [180, 240],
      shadowExtent: 360,
      shadowMapSize: 2048,
    },
    pixelRatio: 1,
    antialias: true,
  },
  high: {
    name: 'High',
    blurb: 'Everything: a 2.3 km view, the finest ground out to 640 m, sharp shadows. For a strong graphics card.',
    world: {},
    pixelRatio: 1.5,
    antialias: true,
  },
};

/**
 * What draws the game here, as the browser tells it: { name (the graphics
 * hardware, or ''), software (no graphics card being used: the browser is
 * drawing on the processor, slowly, for want of a driver, or with hardware
 * acceleration off), suggested ('low', 'medium' or 'high') }. Asked once.
 */
let graphics = null;
export function graphicsInfo() {
  if (graphics) return graphics;
  let name = '', software = false;
  try {
    const canvas = document.createElement('canvas');
    // (The strong chip, on a laptop with two.)
    const gl = canvas.getContext('webgl2', { powerPreference: 'high-performance' }) ?? canvas.getContext('webgl', { powerPreference: 'high-performance' });
    if (!gl) software = true;
    else {
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      name = String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      // (A context the browser would only give with a "major performance
      // caveat" is one drawn in software.)
      const strict = document.createElement('canvas').getContext('webgl2', { failIfMajorPerformanceCaveat: true });
      if (!strict) software = true;
      else strict.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch {
    software = true;
  }
  if (/swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic/i.test(name)) software = true;
  // Graphics cards of their own (and Apple's chips) take High; the
  // graphics built into a processor, Medium; drawing in software, Low.
  const strong = /nvidia|geforce|rtx|gtx|quadro|radeon rx|radeon pro|arc\(tm\) a|arc a\d|apple m\d|apple gpu/i.test(name);
  const suggested = software ? 'low' : strong ? 'high' : 'medium';
  // (Browsers report it like "ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Laptop
  // GPU (0x000028E0) Direct3D11 vs_5_0 ps_5_0, D3D11)": the middle part's the card.)
  const parts = name.replace(/^ANGLE \(|\)$/g, '').replace(/ANGLE Metal Renderer: /, '').split(', ');
  const card = (parts.length > 1 ? parts[1] : parts[0]).replace(/\s*\(0x[0-9a-f]+\).*$/i, '').replace(/\s+(Direct3D|OpenGL|Metal).*$/i, '').trim();
  // (The chip built into the processor: on a laptop that also has a card of
  // its own, Windows often hands the browser this weaker one.)
  const integrated = !software && !strong && /intel|uhd|iris|vega|radeon(\(tm\))?\s*(\d{3}m\s*)?graphics/i.test(name);
  graphics = { name: card, software, suggested, integrated };
  return graphics;
}

/** Whether the quality was chosen (rather than picked to suit the graphics). */
export function qualityChosen() {
  try {
    return !!(new URLSearchParams(location.search).get('quality') ?? localStorage.getItem(KEY));
  } catch {
    return false;
  }
}

/** The quality: the one chosen on the start menu, or else the one that suits this computer's graphics. */
export function quality() {
  try {
    const q = new URLSearchParams(location.search).get('quality') ?? localStorage.getItem(KEY);
    if (QUALITY[q]) return q;
  } catch {
    // (No storage: picked to suit, then.)
  }
  return graphicsInfo().suggested;
}

export function setQuality(q) {
  try {
    localStorage.setItem(KEY, q);
  } catch {
    // (Not remembered, then.)
  }
}

// The full (High) settings, as config.js has them, to go back to.
const BASE = {};
for (const p of Object.values(QUALITY)) for (const k of Object.keys(p.world)) BASE[k] = structuredClone(WORLD[k]);
for (const k of ['farGrassSpacing', 'grassSpacing', 'shadowMapSize', 'viewDistance']) BASE[k] = structuredClone(WORLD[k]); // (and what your settings change: see fitWorld)
/** The furthest the land is ever drawn (High's view distance, in chunks). */
export const MAX_VIEW = WORLD.viewDistance;

/** Sets the world's settings for the chosen quality; returns its preset. */
export function applyQuality() {
  const preset = QUALITY[quality()];
  Object.assign(WORLD, structuredClone(BASE), preset.world);
  // Fitted to the rest of the computer: the processor (how long each frame
  // may spend putting finished land in place: more cores build more of it
  // at once), and the memory (a far view holds a lot of land).
  const hw = hardware();
  WORLD.chunkBuildBudgetMs = hw.threads >= 12 ? 4.5 : hw.threads <= 4 ? 2.5 : 3.5;
  if (hw.memory && hw.memory <= 4) WORLD.viewDistance = Math.min(WORLD.viewDistance, 11);
  // (And your own settings on top: see settings.js.)
  fitWorld(WORLD, MAX_VIEW);
  return preset;
}

/**
 * The computer, as far as a page can tell: { threads (processor threads),
 * memory (GB, rounded down, at most 8 as browsers report it; null if
 * unknown), graphics (see graphicsInfo), pixelRatio (of the screen) }.
 */
export function hardware() {
  return {
    threads: navigator.hardwareConcurrency || 4,
    memory: navigator.deviceMemory ?? null,
    graphics: graphicsInfo(),
    pixelRatio: window.devicePixelRatio || 1,
  };
}

/** A line saying what was found, for the start menu. */
export function describeHardware() {
  const hw = hardware();
  const parts = [hw.graphics.software ? 'no graphics card in use' : hw.graphics.name || 'graphics'];
  parts.push(`${hw.threads} processor threads`);
  if (hw.memory) parts.push(`${hw.memory >= 8 ? '8+' : hw.memory} GB memory`);
  return parts.join(' · ');
}
