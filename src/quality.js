import { WORLD } from './config.js';

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

/** The chosen quality ('low', 'medium' or 'high'), Medium unless chosen. */
export function quality() {
  try {
    const q = new URLSearchParams(location.search).get('quality') ?? localStorage.getItem(KEY);
    return QUALITY[q] ? q : 'medium';
  } catch {
    return 'medium';
  }
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
/** The furthest the land is ever drawn (High's view distance, in chunks). */
export const MAX_VIEW = WORLD.viewDistance;

/** Sets the world's settings for the chosen quality; returns its preset. */
export function applyQuality() {
  const preset = QUALITY[quality()];
  Object.assign(WORLD, structuredClone(BASE), preset.world);
  return preset;
}
