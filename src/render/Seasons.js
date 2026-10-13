import { Vector2 } from 'three';

/**
 * The seasons: spring, summer, autumn and winter, turning over by
 * themselves (a few game days each) or pinned from the panel.
 *
 * Nothing is rebuilt when the season changes: the terrain, trees, grass
 * and water shaders read three uniforms (how much it is spring, autumn,
 * winter; summer is none of them) and tint what they draw:
 *  - spring: fresh, bright greens; some broadleaf trees in pink and white blossom;
 *  - summer: as the world is built;
 *  - autumn: grass turns to straw, broadleaf trees to yellow, orange and red;
 *  - winter: broadleaf trees stand bare, grass lies flat and dull, snow
 *    settles on flat ground and on the conifers, lakes and ponds freeze,
 *    and it snows instead of raining.
 * Only what's green reacts (and snow only settles on cool-coloured
 * ground), so the savanna's gold and the desert's sand stay as they are:
 * the warm, dry biomes hardly have seasons.
 */

export const SEASON_NAMES = ['Spring', 'Summer', 'Autumn', 'Winter'];

export const seasonUniforms = {
  uSpring: { value: 0 },
  uAutumn: { value: 0 },
  uWinter: { value: 0 },
  uWet: { value: 0 }, // how wet the ground is after rain (puddles), 0..1
  uSnowfall: { value: 0 }, // fresh snow lying on everything after it has snowed, 0..1
  uMossy: { value: 0 }, // how damp the country round about is: moss on the north sides of the trees (0..1)
  uFruit: { value: 0 }, // the fruit and berries on the trees and bushes: set in early summer, gone by winter (0..1)
  uSeasonTime: { value: 0.6 }, // the time of year, in seasons (0 spring .. 4): for what's ripe when
  uRipe: { value: 0 }, // and how ripe they are: green, then coloured by late summer (0..1)
  uFallClock: { value: 0 }, // how far on the leaves' turning is: 0 three days before the turn into autumn, 1 two days after it (see uFallSpan)
  uFallSpan: { value: 7 }, // (that span, in days)
  uHighSnow: { value: 0 }, // snow lying on the mountains (above 80 m), from mid autumn to mid spring (0..1)
  // The fruit trees and bushes near you picked clean lately (x, z): no fruit on them till it comes again (see Game).
  uPicked: { value: Array.from({ length: 16 }, () => new Vector2(1e9, 1e9)) },
};

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * Snow in the mountains (above 80 m) at season time `t` (d days a season):
 * `lying` (0..1), and whether it's `falling` now. From day 4 of autumn to
 * day 6 of spring: on the shoulders, now and then (some days a snowfall,
 * lying a day or so before it melts); in the depths (autumn day 6 to spring
 * day 2), always lying, with fresh falls now and then.
 */
export function highSnow(t, d) {
  const u = (t < 1.6 ? t + 4 : t) * d; // (days since the start of spring, the next spring's counting on)
  const from = 2 * d + 3.5, to = 4 * d + 6, coreFrom = 2 * d + 6, coreTo = 4 * d + 2;
  if (u < from - 2 || u > to + 2) return { lying: 0, falling: false };
  const dayHash = (k) => {
    const h = Math.sin(k * 127.1 + 311.7) * 43758.5453;
    return h - Math.floor(h);
  };
  let lying = smoothstep(coreFrom - 0.5, coreFrom, u) * (1 - smoothstep(coreTo, coreTo + 0.5, u));
  let falling = false;
  for (let k = Math.floor(u) - 2; k <= Math.floor(u); k++) {
    if (k < from || k > to || dayHash(k) > (k > coreFrom && k < coreTo ? 0.45 : 0.55)) continue;
    const fall = k + 0.3; // (a snowfall through the morning)
    lying = Math.max(lying, smoothstep(fall, fall + 0.12, u) * (1 - smoothstep(fall + 1.0, fall + 1.6, u)));
    if (u > fall - 0.05 && u < fall + 0.15) falling = true;
  }
  return { lying, falling };
}

export class Seasons {
  /** @param daysPerSeason  game days each season lasts when turning by itself */
  constructor(daysPerSeason = 12, turnDays = 2) {
    this.daysPerSeason = daysPerSeason;
    this.turnDays = turnDays;
    this.time = 0.6; // in seasons: 0 spring, 1 summer, 2 autumn, 3 winter (wrapping)
    this.auto = true;
    this.#apply();
  }

  /** 'auto', or a season's index (0..3) to pin it. */
  set(mode) {
    if (mode === 'auto') {
      this.auto = true;
      return;
    }
    this.auto = false;
    this.target = Number(mode);
  }

  /** @param days  game days gone by since the last update */
  update(days, dt) {
    if (this.auto) {
      this.time = (this.time + days / this.daysPerSeason) % 4;
    } else {
      // Ease over to the chosen season (the short way round).
      let d = this.target + 0.5 - this.time;
      d = ((d % 4) + 6) % 4 - 2;
      this.time = (this.time + d * Math.min(1, dt / 1.5) + 4) % 4;
    }
    this.#apply();
  }

  /** The season it mostly is. */
  get index() {
    return Math.floor(this.time) % 4;
  }

  get name() {
    return SEASON_NAMES[this.index];
  }

  #apply() {
    // Each season holds for most of its span and turns into the next over
    // `turnDays` (the snow melting, the leaves turning), about the change.
    const w = Math.min(0.9, this.turnDays / this.daysPerSeason);
    const amount = (k) => {
      let d = Math.abs(this.time - (k + 0.5));
      d = Math.min(d, 4 - d);
      return 1 - smoothstep(0.5 - w / 2, 0.5 + w / 2, d);
    };
    // The leaves turn kind by kind: the first as autumn comes on (in the
    // mountains a few days sooner), the last a couple of days into it (see
    // seasonalTrees). The clock runs from three days before the turn.
    const d = this.daysPerSeason, span = 3 + this.turnDays + 2;
    const start = 2 - w / 2 - 3 / d;
    seasonUniforms.uFallSpan.value = span;
    seasonUniforms.uFallClock.value = Math.min(1, Math.max(0, (this.time - start) / (span / d))) * (1 - smoothstep(4 - w, 4, this.time));
    // Snow on the mountains: from early in the middle of autumn to the middle
    // of spring it snows up there now and then, and lies a day or so; from
    // mid autumn to early spring it hardly ever melts away. See highSnow.
    const hs = highSnow(this.time, d);
    seasonUniforms.uHighSnow.value = hs.lying;
    this.highSnowing = hs.falling;
    seasonUniforms.uSpring.value = amount(0);
    seasonUniforms.uAutumn.value = amount(2);
    seasonUniforms.uWinter.value = amount(3);
    // Fruit sets in early summer, ripens by late summer, and falls in late autumn.
    const t = this.time;
    // (Ripe by midsummer: the berries over by the fourth day of autumn, the apples by the ninth.)
    seasonUniforms.uSeasonTime.value = t;
    seasonUniforms.uFruit.value = smoothstep(1.0, 1.3, t) * (1 - smoothstep(2.72, 2.85, t));
    seasonUniforms.uRipe.value = smoothstep(1.2, 1.45, t);
  }
}

const COMMON = /* glsl */ `
  uniform float uSpring;
  uniform float uAutumn;
  uniform float uWinter;
  uniform float uSnowfall;
  uniform float uMossy;
  uniform float uRipe;
  uniform float uFallClock;
  uniform float uFallSpan;
  uniform float uHighSnow;
  float seasonGreen(vec3 c) { return clamp((c.g - max(c.r, c.b)) * 9.0, 0.0, 1.0); }
  float seasonHash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  float seasonNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(seasonHash(i), seasonHash(i + vec2(1.0, 0.0)), f.x), mix(seasonHash(i + vec2(0.0, 1.0)), seasonHash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
`;

function hook(material, patch, key) {
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous?.call(material, shader, renderer);
    Object.assign(shader.uniforms, seasonUniforms);
    patch(shader);
  };
  const previousKey = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () => `${previousKey ? previousKey() : ''}|${key}`;
  return material;
}

/**
 * The terrain: greens freshen in spring, go to straw in autumn and dull in
 * winter, when snow settles, patchily at first, on flat ground above the
 * water (not on warm sand or golden grass).
 */
export function seasonalTerrain(material, seaLevel) {
  return hook(
    material,
    (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aCold;\nvarying vec3 vSeasonWorld;\nvarying float vSeasonUp;\nvarying float vCold;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSeasonWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvSeasonUp = normal.y;\nvCold = aCold;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${COMMON}\nuniform float uWet;\nvarying vec3 vSeasonWorld;\nvarying float vSeasonUp;\nvarying float vCold;`)
        .replace(
          '#include <color_fragment>',
          /* glsl */ `#include <color_fragment>
          {
            vec3 c = diffuseColor.rgb;
            float g = seasonGreen(c);
            c = mix(c, c * vec3(0.9, 1.15, 0.8), uSpring * g * 0.7);
            // (Only where there's a real winter: the jungles stay green.)
            float seasonal = smoothstep(0.3, 0.6, vCold);
            c = mix(c, vec3(0.5, 0.33, 0.1), uAutumn * g * 0.5 * seasonal);
            c = mix(c, vec3(0.24, 0.22, 0.14), uWinter * g * 0.55 * seasonal);
            // Puddles after rain, on flat ground: dark and glassy, drying slowly.
            float puddle = uWet * (1.0 - uWinter) * smoothstep(0.985, 0.995, abs(vSeasonUp)) * smoothstep(0.66, 0.7, seasonNoise(vSeasonWorld.xz * 0.28 + 7.0))
              * smoothstep(${(seaLevel + 1.0).toFixed(2)}, ${(seaLevel + 2.0).toFixed(2)}, vSeasonWorld.y);
            c = mix(c, c * 0.35 + vec3(0.1, 0.13, 0.17), puddle * 0.85);
            // And all of it a shade darker while it's wet.
            c *= 1.0 - 0.16 * uWet * (1.0 - uWinter);
            // Snow: on flat ground above the water in the lands with a cold
            // winter (sand and all; not the deserts), patchy as winter comes
            // and goes; and after a snowfall a thin layer over nearly
            // everything, slopes too.
            float patchy = seasonHash(floor(vSeasonWorld.xz / 5.0));
            float above = smoothstep(${(seaLevel + 0.4).toFixed(2)}, ${(seaLevel + 1.2).toFixed(2)}, vSeasonWorld.y);
            float settled = uWinter * smoothstep(0.6, 0.85, abs(vSeasonUp)) * smoothstep(patchy - 0.15, patchy + 0.05, uWinter * 1.25 - 0.1);
            float fresh = uSnowfall * smoothstep(0.35, 0.6, abs(vSeasonUp));
            // (And up in the mountains, from mid autumn to mid spring: see highSnow.)
            float high = uHighSnow * smoothstep(80.0, 96.0, vSeasonWorld.y + 6.0 * (patchy - 0.5)) * smoothstep(0.5, 0.75, abs(vSeasonUp));
            float snow = smoothstep(0.3, 0.6, vCold) * above * max(max(settled, fresh), high);
            diffuseColor.rgb = mix(c, vec3(0.86, 0.89, 0.93), snow);
          }`,
        );
    },
    'season-terrain',
  );
}

/**
 * Rocks: in winter snow caps their tops and drifts against their lee
 * side, low down (grey rock only: the warm sandstone of the dry lands
 * sees no snow).
 */
export function seasonalRocks(material) {
  return hook(
    material,
    (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vRockLocal;\nvarying vec3 vRockNormal;\nvarying vec2 vRockMoss;\n#ifndef USE_INSTANCING\nattribute vec3 rockLocal;\nattribute vec2 rockMoss;\n#endif')
        // (Instanced, or baked together into one mesh a chunk: see RockLayer.)
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          #ifdef USE_INSTANCING
          vRockLocal = position;
          vRockNormal = normalize((modelMatrix * instanceMatrix * vec4(normal, 0.0)).xyz);
          vRockMoss = vec2(0.0);
          #else
          vRockLocal = rockLocal;
          vRockNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
          vRockMoss = rockMoss;
          #endif`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${COMMON}\nvarying vec3 vRockLocal;\nvarying vec3 vRockNormal;\nvarying vec2 vRockMoss;`)
        .replace(
          '#include <color_fragment>',
          /* glsl */ `#include <color_fragment>
          {
            vec3 c = diffuseColor.rgb;
            float cool = 1.0 - smoothstep(0.02, 0.1, c.r - c.b);
            // Lichen, pale green-grey and orange, in spots (up high and in
            // dry country): see RockLayer's rockMoss.
            {
              vec3 cell = floor(vRockLocal * 3.0);
              float patchy = fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
              float spot = step(0.84, fract(sin(dot(floor(vRockLocal * 9.0), vec3(39.34, 11.13, 83.17))) * 24634.63));
              c = mix(c, patchy > 0.55 ? vec3(0.8, 0.52, 0.2) : vec3(0.72, 0.75, 0.62), vRockMoss.y * spot * 0.75);
            }
            float cap = smoothstep(0.45, 0.75, vRockNormal.y);
            float drift = (1.0 - smoothstep(-0.35, 0.05, vRockLocal.y)) * smoothstep(-0.2, 0.5, dot(vRockNormal.xz, vec2(0.8, 0.6)));
            float snow = cool * clamp(max(uWinter * max(cap, drift), uSnowfall * smoothstep(0.1, 0.5, vRockNormal.y)), 0.0, 1.0);
            diffuseColor.rgb = mix(c, vec3(0.86, 0.89, 0.93), snow);
          }`,
        );
    },
    'season-rocks',
  );
}

/**
 * Fallen logs and stumps: snow settles on their tops in winter and after a
 * snowfall.
 */
export function seasonalWood(material) {
  return hook(
    material,
    (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying float vWoodUp;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWoodUp = normalize((modelMatrix * instanceMatrix * vec4(normal, 0.0)).xyz).y;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${COMMON}\nvarying float vWoodUp;`)
        .replace(
          '#include <color_fragment>',
          /* glsl */ `#include <color_fragment>
          float snow = clamp(max(uWinter * 0.9, uSnowfall) * smoothstep(0.35, 0.75, vWoodUp), 0.0, 1.0);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.89, 0.93), snow);`,
        );
    },
    'season-wood',
  );
}

/**
 * Trees (trunks and crowns) and their leaf clusters. The geometry carries
 * `aSeason`: x = deciduous (leaves turn and fall), y = holds snow,
 * z = flowers in spring (bushes: little flowers dotted over them).
 * `leaves`: the leaf clusters, which on deciduous trees fade away in winter.
 * `randFrom`: where a tree's own random number comes from (by default,
 * its instance's position). Far trees (which give one) keep their crowns in
 * winter, dark with bare twigs: from far off a leafless wood is a grey-brown haze.
 */
// `warmFrom`, `yFrom`: (far trees) where its warmth and its height above
// the sea come from; otherwise from its instance: how warm it is carried in
// its instance colour (less blue than green: see TreeLayer), its height in
// its instance's place.
export function seasonalTrees(material, leaves = false, randFrom = null, warmFrom = null, yFrom = null) {
  return hook(
    material,
    (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>\nattribute vec3 aSeason;\nattribute vec3 aFall;\nvarying vec3 vFall;\nvarying vec3 vSeason;\nvarying vec3 vFlowerAt;\nvarying float vTreeRand;\nvarying float vSeasonUp;\nvarying float vTreeWarm;\nvarying float vTreeY;\nuniform float uWinter;\nuniform float uFruit;\nuniform vec2 uPicked[16];${leaves || randFrom ? '' : '\nattribute float aCrown;\nvarying float vTreeNorth;'}`,
        )
        .replace(
          '#include <begin_vertex>',
          /* glsl */ `#include <begin_vertex>
          vSeason = aSeason;
          vFall = aFall;
          vFlowerAt = position;
          vSeasonUp = normal.y;
          ${leaves || randFrom ? '' : `#ifdef USE_INSTANCING
            // Direction out from the trunk's middle, not the flat face normal, so the
            // moss side shades round the trunk smoothly instead of face by face.
            vec3 treeOut = mat3(modelMatrix) * mat3(instanceMatrix) * vec3(position.x, 0.0, position.z);
            vTreeNorth = -treeOut.z / max(length(treeOut), 1e-4) * (1.0 - aCrown);
          #else
            vTreeNorth = 0.0;
          #endif`}
          ${randFrom ? `vTreeRand = ${randFrom};` : `#ifdef USE_INSTANCING
            vTreeRand = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
          #else
            vTreeRand = 0.5;
          #endif`}
          // How warm the country is where it stands (no autumn, no winter in
          // and near the jungle), and how high (the mountains turn sooner).
          ${warmFrom ? `vTreeWarm = ${warmFrom};` : `#ifdef USE_INSTANCING_COLOR
            vTreeWarm = clamp((0.95 - instanceColor.b / max(instanceColor.g, 0.001)) / 0.1, 0.0, 1.0);
          #else
            vTreeWarm = 0.0;
          #endif`}
          ${yFrom ? `vTreeY = ${yFrom};` : `#ifdef USE_INSTANCING
            vTreeY = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).y;
          #else
            vTreeY = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).y;
          #endif`}
          ${leaves || randFrom ? '' : `// Fruit and berries (aSeason.z = 2), each a little block centred on
          // a quarter-metre grid point: grown out from nothing in early summer,
          // gone again by winter.
          if (aSeason.z > 1.5) {
            float fruitOn = uFruit;
            #ifdef USE_INSTANCING
              // (None on a tree or bush you've picked clean.)
              vec2 fruitTree = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xz;
              for (int i = 0; i < 16; i++) if (distance(fruitTree, uPicked[i]) < 0.6) fruitOn = 0.0;
            #endif
            transformed = mix((floor(position * 4.0) + 0.5) * 0.25, transformed, fruitOn);
          }
          // Winter: a deciduous tree's crown (its leaves) shrinks away to
          // nothing, leaving the bare boughs.
          float bare = smoothstep(0.55, 0.95, uWinter) * aSeason.x * (1.0 - vTreeWarm);
          transformed = mix(transformed, vec3(0.0, transformed.y * 0.85, 0.0), bare);`}
`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${COMMON}\nvarying vec3 vFall;\nvarying vec3 vSeason;\nvarying vec3 vFlowerAt;\nvarying float vTreeRand;\nvarying float vSeasonUp;\nvarying float vTreeWarm;\nvarying float vTreeY;${leaves || randFrom ? '' : '\nvarying float vTreeNorth;'}`)
        .replace(
          '#include <color_fragment>',
          /* glsl */ `#include <color_fragment>
          {
            vec3 c = diffuseColor.rgb;
            float leafy = vSeason.x; // (the crown of a deciduous tree)
            float seasonal = 1.0 - vTreeWarm; // (in and near the jungle: no autumn, no winter)
            // Spring: fresh green, and the bushes dotted with little flowers
            // (pink, white, yellow or lilac, bush by bush).
            c = mix(c, c * vec3(0.9, 1.15, 0.8), uSpring * leafy * 0.7);
            if (vSeason.z > 0.0 && vSeason.z < 1.5 && uSpring > 0.0) {
              vec3 cell = floor(vFlowerAt * 4.5);
              float dot1 = seasonHash(cell.xz + cell.y * 7.13 + vTreeRand * 31.0);
              vec3 petal = vTreeRand < 0.3 ? vec3(1.0, 0.55, 0.72) : vTreeRand < 0.55 ? vec3(0.98, 0.97, 0.92) : vTreeRand < 0.8 ? vec3(1.0, 0.86, 0.3) : vec3(0.78, 0.6, 0.95);
              c = mix(c, petal, step(0.8, dot1) * uSpring * vSeason.z);
            }
            // Fruit: green, ripening to its own colour.
            if (vSeason.z > 1.5) c = mix(vec3(0.42, 0.6, 0.22), c, uRipe);
            // Autumn: each species its own colour (birches yellow, maples
            // scarlet...), the same on every tree of the kind.
            // Kind by kind: some (a fixed few, by their colour) turn early,
            // others days later, each tree a little apart from its fellows.
            // (Each tree turns quickly once its time comes, so a wood goes over
            // tree by tree rather than every tree half-turned at once.)
            // (And within a tree, bough by bough: patches of the crown first.)
            // In days from the start of the clock (three days before the turn
            // into autumn); up in the mountains, two or three days sooner.
            float lagDays = 3.0 + 2.4 * fract(sin(dot(vFall, vec3(12.99, 78.23, 37.72))) * 43758.55) + 0.5 * vTreeRand + 0.6 * seasonNoise(vFlowerAt.xz * 1.3 + vFlowerAt.y * 0.7)
              - 2.6 * smoothstep(80.0, 150.0, vTreeY);
            float turned = smoothstep(lagDays / uFallSpan, lagDays / uFallSpan + 0.03, uFallClock);
            c = mix(c, vFall * (0.8 + 0.4 * dot(c, vec3(0.33))), turned * leafy * 0.9 * seasonal);
            ${leaves || randFrom ? '' : `// Moss up the north side of the trunks, in damp country: on about
            // one tree in six.
            // A ragged, soft edge: noise nudges where it starts, and it thins with height.
            float mossEdge = vTreeNorth + 0.45 * (seasonNoise(vec2(atan(vFlowerAt.z, vFlowerAt.x) * 2.0, vFlowerAt.y * 2.5) + vTreeRand * 17.0) - 0.5);
            float moss = smoothstep(-0.35, 0.75, mossEdge) * (0.55 + 0.45 * seasonNoise(vFlowerAt.xy * 6.0 + vFlowerAt.zy * 5.0 + vTreeRand * 9.0)) * (1.0 - smoothstep(1.2, 3.5, vFlowerAt.y));
            c = mix(c, vec3(0.25, 0.36, 0.14), uMossy * step(0.83, fract(vTreeRand * 13.7)) * moss * 0.75);`}
            // Winter: bare grey-brown twigs, and snow on the upward faces.
            c = mix(c, vec3(0.13, 0.1, 0.08), uWinter * leafy * 0.85 * seasonal);
            float treeSnow = max(max(uWinter, uSnowfall), uHighSnow * smoothstep(80.0, 96.0, vTreeY));
            c = mix(c, vec3(0.86, 0.89, 0.93), treeSnow * vSeason.y * smoothstep(0.3 - 0.2 * uSnowfall, 0.75, vSeasonUp) * 0.85 * seasonal);
            diffuseColor.rgb = c;
            ${leaves ? 'diffuseColor.a *= 1.0 - uWinter * vSeason.x * seasonal; // the leaves have fallen' : ''}
          }`,
        );
    },
    (leaves ? 'season-leaves' : 'season-trees') + (randFrom ? '-far' : ''),
  );
}

/** Grass: fresh in spring, straw in autumn, flattened under the snow in winter. */
export function seasonalGrass(material) {
  return hook(
    material,
    (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uWinter;\nattribute float aWarm;\nvarying float vGrassSeasonal;')
        .replace(
          '#include <begin_vertex>',
          /* glsl */ `#include <begin_vertex>
          vGrassSeasonal = 1.0 - aWarm; // (in and near the jungle: no autumn, no winter)
          #ifdef USE_INSTANCING_COLOR
            float grassGreen = clamp((instanceColor.g - max(instanceColor.r, instanceColor.b)) * 9.0, 0.0, 1.0);
            transformed.y *= 1.0 - 0.85 * uWinter * grassGreen * vGrassSeasonal;
          #endif`,
        );
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${COMMON}\nvarying float vGrassSeasonal;`).replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
        {
          vec3 c = diffuseColor.rgb;
          float g = seasonGreen(c);
          c = mix(c, c * vec3(0.9, 1.15, 0.8), uSpring * g * 0.7);
          c = mix(c, vec3(0.55, 0.38, 0.12), uAutumn * g * 0.6 * vGrassSeasonal);
          c = mix(c, vec3(0.7, 0.72, 0.74), uWinter * g * 0.8 * vGrassSeasonal);
          c = mix(c, vec3(0.86, 0.89, 0.93), uSnowfall * g * 0.75 * vGrassSeasonal); // dusted with fresh snow
          diffuseColor.rgb = c;
        }`,
      );
    },
    'season-grass',
  );
}

/**
 * Standing water: lakes and ponds freeze over in winter (the geometry
 * carries `aFreeze`, 0 for the open sea and the warm biomes).
 */
export function seasonalWater(material) {
  return hook(
    material,
    (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aFreeze;\nvarying float vIce;\nuniform float uWinter;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvIce = aFreeze * smoothstep(0.35, 0.8, uWinter);');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vIce;').replace(
        '#include <fog_fragment>',
        /* glsl */ `gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.74, 0.84, 0.9), vIce * 0.85);
        gl_FragColor.a = mix(gl_FragColor.a, 0.95, vIce);
        #include <fog_fragment>`,
      );
    },
    'season-water',
  );
}
