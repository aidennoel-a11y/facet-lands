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
export const DEFAULTS = { view: null, grass: 1, shadows: 'normal', sensitivity: 1, fov: 60, brightness: 1, volume: 1, rays: true, difficulty: 'normal' };

/**
 * How hard survival is (see Game, Survival, Wildlife): `hurt`, how much
 * harm a blow, a bite or a fall does; `drain`, how fast you grow hungry and
 * thirsty; `wild`, how far off the hunters notice you; `peaceful`, no
 * creature attacks.
 */
export const DIFFICULTIES = {
  peaceful: { name: 'Peaceful', hurt: 0.5, drain: 0.6, wild: 0.6, peaceful: true },
  easy: { name: 'Easy', hurt: 0.6, drain: 0.7, wild: 0.8 },
  normal: { name: 'Normal', hurt: 1, drain: 1, wild: 1 },
  hard: { name: 'Hard', hurt: 1.5, drain: 1.35, wild: 1.3 },
};
/** The difficulty now (kept up to date as it's changed). */
export const difficulty = { ...DIFFICULTIES.normal };

export function settings() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

function useDifficulty(s) {
  Object.assign(difficulty, { peaceful: false }, DIFFICULTIES[s.difficulty] ?? DIFFICULTIES.normal);
}
useDifficulty(settings());

export function saveSettings(s) {
  useDifficulty(s);
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
