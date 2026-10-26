/**
 * Your own settings, on top of the graphics quality (see quality.js):
 * how far the land is drawn, how thick the grass grows, the shadows, the
 * mouse's feel and the field of view. Chosen on the start or pause menu,
 * remembered in this browser.
 *
 *  view         land drawn out to this many chunks (null: the quality's own)
 *  grass        1 as the quality has it; 0.5 half as thick, 1.6 thicker
 *  shadows      'off', 'low', 'normal' (the quality's own) or 'high'
 *  sensitivity  1 as it was; the mouse turning you slower or faster
 *  fov          the field of view, degrees (up and down)
 */
const KEY = 'facet-lands:settings';
export const DEFAULTS = { view: null, grass: 1, shadows: 'normal', sensitivity: 1, fov: 60 };

export function settings() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // (Not remembered, then: for this visit only.)
  }
}

/** The world's settings (WORLD, as the quality set them) fitted to yours; `max`: the furthest the land is ever drawn. */
export function fitWorld(WORLD, max) {
  const s = settings();
  if (s.view) WORLD.viewDistance = Math.max(5, Math.min(max, Math.round(s.view)));
  if (s.grass !== 1) {
    const k = 1 / Math.sqrt(Math.max(0.25, s.grass)); // (the spacing: thicker grass, closer together)
    WORLD.grassSpacing *= k;
    if (WORLD.farGrassSpacing) WORLD.farGrassSpacing *= k;
  }
  if (s.shadows === 'low') WORLD.shadowMapSize = Math.min(WORLD.shadowMapSize, 1024);
  if (s.shadows === 'high') WORLD.shadowMapSize = Math.max(WORLD.shadowMapSize, 4096);
  return s;
}
