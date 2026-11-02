// A world's own settings, chosen when it's made (see StartMenu.create): how
// dry it is, how much sea and how many mountains, how wooded, how many
// animals and hunters, how wild the weather, the season it starts in, and
// whether you start with a few tools.
//
// They ride along in the seed itself, after a '~' ("polaris~31242202"):
// the same seed with the same settings is the same world on every computer,
// the worker threads and everyone online included (the server only passes
// the seed on). The land's noise comes from the part before the '~', so
// the settings reshape a world rather than swap it for another.

export const WORLD_OPTIONS = [
  { id: 'dry', name: 'Climate', levels: ['Very wet', 'Wet', 'Normal', 'Dry', 'Very dry'], values: [-0.32, -0.16, 0, 0.18, 0.42] },
  { id: 'sea', name: 'Sea', levels: ['Little', 'Less', 'Normal', 'More', 'Islands'], values: [-0.22, -0.11, 0, 0.12, 0.26] },
  { id: 'mountains', name: 'Mountains', levels: ['Flat', 'Fewer', 'Normal', 'More', 'Towering'], values: [-0.3, -0.14, 0, 0.1, 0.2] },
  { id: 'trees', name: 'Forests', levels: ['Bare', 'Sparse', 'Normal', 'Thick', 'Dense'], values: [0.35, 0.7, 1, 1.25, 1.5] },
  { id: 'animals', name: 'Animals', levels: ['Scarce', 'Fewer', 'Normal', 'More', 'Teeming'], values: [0.35, 0.65, 1, 1.4, 1.85] },
  { id: 'predators', name: 'Hunters', levels: ['Very few', 'Fewer', 'Normal', 'More', 'Swarming'], values: [0.2, 0.55, 1, 1.5, 2.2] },
  { id: 'weather', name: 'Weather', levels: ['Gentle', 'Mild', 'Normal', 'Stormy', 'Wild'], values: [0.25, 0.6, 1, 1.6, 2.6] },
  { id: 'season', name: 'Start in', levels: ['Spring', 'Summer', 'Autumn', 'Winter'], values: [0.5, 1.5, 2.5, 3.5], normal: 1 },
  { id: 'kit', name: 'Start with', levels: ['Nothing', 'A few tools'], values: [false, true], normal: 0 },
];

/** Ready-made worlds: each a few settings away from normal. */
export const WORLD_PRESETS = [
  { id: 'normal', name: 'The wild', blurb: 'Everything as it comes', set: {} },
  { id: 'islands', name: 'Islands', blurb: 'Scattered islands in open sea', set: { sea: 4, mountains: 1, trees: 3 } },
  { id: 'highlands', name: 'Highlands', blurb: 'Range after range of mountains', set: { mountains: 4, sea: 1, weather: 3 } },
  { id: 'desert', name: 'Endless desert', blurb: 'Dry country as far as you can walk', set: { dry: 4, sea: 0, trees: 1, animals: 1 } },
  { id: 'green', name: 'Green lands', blurb: 'Wet, wooded, full of life', set: { dry: 0, trees: 4, animals: 3 } },
  { id: 'frozen', name: 'Long winter', blurb: 'Start in winter, in hard weather', set: { season: 3, weather: 3, predators: 3 } },
  { id: 'peaceful', name: 'Quiet country', blurb: 'Few hunters, gentle weather, a few tools', set: { predators: 0, weather: 1, kit: 1 } },
  { id: 'hunting', name: 'Hunting grounds', blurb: 'Herds everywhere, and what hunts them', set: { animals: 4, predators: 3, trees: 1 } },
];

const normalOf = (o) => o.normal ?? 2;

/** The levels picked (by id) as the code that rides in the seed ('' when all are normal). */
export function encodeOptions(levels) {
  const code = WORLD_OPTIONS.map((o) => String(levels[o.id] ?? normalOf(o))).join('');
  return WORLD_OPTIONS.every((o) => (levels[o.id] ?? normalOf(o)) === normalOf(o)) ? '' : code;
}

/** A seed's parts: its own text (for the land's noise) and its settings, as levels and as values. */
export function parseSeed(seed) {
  const text = String(seed ?? '');
  const at = text.lastIndexOf('~');
  const base = at < 0 ? text : text.slice(0, at), code = at < 0 ? '' : text.slice(at + 1);
  const levels = {}, values = {};
  WORLD_OPTIONS.forEach((o, i) => {
    const n = Number.parseInt(code[i], 10);
    levels[o.id] = Number.isFinite(n) && n >= 0 && n < o.levels.length ? n : normalOf(o);
    values[o.id] = o.values[levels[o.id]];
  });
  return { base, code, levels, values, custom: code !== '' && WORLD_OPTIONS.some((o) => levels[o.id] !== normalOf(o)) };
}

/** The seed with these settings (the base seed alone when all are normal). */
export function seedWith(base, levels) {
  const code = encodeOptions(levels);
  return code ? `${base}~${code}` : String(base);
}

/** In words, what's not normal about a world's settings ('' for none). */
export function describeOptions(seed) {
  const { levels } = parseSeed(seed);
  return WORLD_OPTIONS.filter((o) => levels[o.id] !== normalOf(o))
    .map((o) => `${o.name.toLowerCase()}: ${o.levels[levels[o.id]].toLowerCase()}`)
    .join(', ');
}
