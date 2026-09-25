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
};

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export class Seasons {
  /** @param daysPerSeason  game days each season lasts when turning by itself */
  constructor(daysPerSeason = 2) {
    this.daysPerSeason = daysPerSeason;
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
    // Each season holds for most of its span and blends into the next.
    const amount = (k) => {
      let d = Math.abs(this.time - (k + 0.5));
      d = Math.min(d, 4 - d);
      return 1 - smoothstep(0.3, 0.7, d);
    };
    seasonUniforms.uSpring.value = amount(0);
    seasonUniforms.uAutumn.value = amount(2);
    seasonUniforms.uWinter.value = amount(3);
  }
}

const COMMON = /* glsl */ `
  uniform float uSpring;
  uniform float uAutumn;
  uniform float uWinter;
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
        .replace('#include <common>', '#include <common>\nattribute float aWoods;\nvarying vec3 vSeasonWorld;\nvarying float vSeasonUp;\nvarying float vWoods;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSeasonWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvSeasonUp = normal.y;\nvWoods = aWoods;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${COMMON}\nuniform float uWet;\nvarying vec3 vSeasonWorld;\nvarying float vSeasonUp;\nvarying float vWoods;`)
        .replace(
          '#include <color_fragment>',
          /* glsl */ `#include <color_fragment>
          {
            vec3 c = diffuseColor.rgb;
            float g = seasonGreen(c);
            c = mix(c, c * vec3(0.9, 1.15, 0.8), uSpring * g * 0.7);
            c = mix(c, vec3(0.5, 0.33, 0.1), uAutumn * g * 0.5);
            c = mix(c, vec3(0.24, 0.22, 0.14), uWinter * g * 0.55);
            // Fallen leaves in the woods: autumn's litter, lying on into winter.
            float litter = vWoods * g * max(uAutumn, 0.6 * uWinter) * smoothstep(0.35, 0.6, seasonNoise(vSeasonWorld.xz * 0.9));
            float leaf = seasonHash(floor(vSeasonWorld.xz * 1.7));
            vec3 leafColor = leaf < 0.3 ? vec3(0.62, 0.3, 0.09) : leaf < 0.55 ? vec3(0.72, 0.5, 0.14) : leaf < 0.8 ? vec3(0.46, 0.2, 0.1) : vec3(0.36, 0.26, 0.15);
            c = mix(c, leafColor, litter * 0.85);
            // Puddles after rain, on flat ground: dark and glassy, drying slowly.
            float puddle = uWet * (1.0 - uWinter) * smoothstep(0.985, 0.995, abs(vSeasonUp)) * smoothstep(0.66, 0.7, seasonNoise(vSeasonWorld.xz * 0.28 + 7.0))
              * smoothstep(${(seaLevel + 1.0).toFixed(2)}, ${(seaLevel + 2.0).toFixed(2)}, vSeasonWorld.y);
            c = mix(c, c * 0.35 + vec3(0.1, 0.13, 0.17), puddle * 0.85);
            // Snow: on flat, cool-coloured ground above the water, patchy
            // as winter comes and goes.
            float cool = 1.0 - smoothstep(0.04, 0.14, c.r - c.b);
            float patchy = seasonHash(floor(vSeasonWorld.xz / 5.0));
            float snow = uWinter * max(cool, g) * smoothstep(0.6, 0.85, abs(vSeasonUp))
              * smoothstep(${(seaLevel + 0.4).toFixed(2)}, ${(seaLevel + 1.2).toFixed(2)}, vSeasonWorld.y)
              * smoothstep(patchy - 0.15, patchy + 0.05, uWinter * 1.25 - 0.1);
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
        .replace('#include <common>', '#include <common>\nvarying vec3 vRockLocal;\nvarying vec3 vRockNormal;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRockLocal = position;\nvRockNormal = normalize((modelMatrix * instanceMatrix * vec4(normal, 0.0)).xyz);');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${COMMON}\nvarying vec3 vRockLocal;\nvarying vec3 vRockNormal;`)
        .replace(
          '#include <color_fragment>',
          /* glsl */ `#include <color_fragment>
          {
            vec3 c = diffuseColor.rgb;
            float cool = 1.0 - smoothstep(0.02, 0.1, c.r - c.b);
            float cap = smoothstep(0.45, 0.75, vRockNormal.y);
            float drift = (1.0 - smoothstep(-0.35, 0.05, vRockLocal.y)) * smoothstep(-0.2, 0.5, dot(vRockNormal.xz, vec2(0.8, 0.6)));
            float snow = uWinter * cool * clamp(max(cap, drift), 0.0, 1.0);
            diffuseColor.rgb = mix(c, vec3(0.86, 0.89, 0.93), snow);
          }`,
        );
    },
    'season-rocks',
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
export function seasonalTrees(material, leaves = false, randFrom = null) {
  return hook(
    material,
    (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nattribute vec3 aSeason;\nvarying vec3 vSeason;\nvarying vec3 vFlowerAt;\nvarying float vTreeRand;\nvarying float vSeasonUp;\nuniform float uWinter;',
        )
        .replace(
          '#include <begin_vertex>',
          /* glsl */ `#include <begin_vertex>
          vSeason = aSeason;
          vFlowerAt = position;
          vSeasonUp = normal.y;
          ${randFrom ? `vTreeRand = ${randFrom};` : `#ifdef USE_INSTANCING
            vTreeRand = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
          #else
            vTreeRand = 0.5;
          #endif`}
          ${leaves || randFrom ? '' : `// Winter: a deciduous tree's crown (its leaves) shrinks away to
          // nothing, leaving the bare boughs.
          float bare = smoothstep(0.55, 0.95, uWinter) * aSeason.x;
          transformed = mix(transformed, vec3(0.0, transformed.y * 0.85, 0.0), bare);`}
`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${COMMON}\nvarying vec3 vSeason;\nvarying vec3 vFlowerAt;\nvarying float vTreeRand;\nvarying float vSeasonUp;`)
        .replace(
          '#include <color_fragment>',
          /* glsl */ `#include <color_fragment>
          {
            vec3 c = diffuseColor.rgb;
            float leafy = vSeason.x; // (the crown of a deciduous tree)
            // Spring: fresh green, and the bushes dotted with little flowers
            // (pink, white, yellow or lilac, bush by bush).
            c = mix(c, c * vec3(0.9, 1.15, 0.8), uSpring * leafy * 0.7);
            if (vSeason.z > 0.0 && uSpring > 0.0) {
              vec3 cell = floor(vFlowerAt * 4.5);
              float dot1 = seasonHash(cell.xz + cell.y * 7.13 + vTreeRand * 31.0);
              vec3 petal = vTreeRand < 0.3 ? vec3(1.0, 0.55, 0.72) : vTreeRand < 0.55 ? vec3(0.98, 0.97, 0.92) : vTreeRand < 0.8 ? vec3(1.0, 0.86, 0.3) : vec3(0.78, 0.6, 0.95);
              c = mix(c, petal, step(0.8, dot1) * uSpring * vSeason.z);
            }
            // Autumn: yellow, orange or red, tree by tree.
            vec3 fall = vTreeRand < 0.35 ? vec3(0.85, 0.62, 0.08) : vTreeRand < 0.7 ? vec3(0.9, 0.35, 0.05) : vec3(0.65, 0.1, 0.05);
            c = mix(c, fall * (0.75 + 0.5 * dot(c, vec3(0.33))), uAutumn * leafy * 0.9);
            // Winter: bare grey-brown twigs, and snow on the upward faces.
            c = mix(c, vec3(0.13, 0.1, 0.08), uWinter * leafy * 0.85);
            c = mix(c, vec3(0.86, 0.89, 0.93), uWinter * vSeason.y * smoothstep(0.3, 0.75, vSeasonUp) * 0.85);
            diffuseColor.rgb = c;
            ${leaves ? 'diffuseColor.a *= 1.0 - uWinter * vSeason.x; // the leaves have fallen' : ''}
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
        .replace('#include <common>', '#include <common>\nuniform float uWinter;')
        .replace(
          '#include <begin_vertex>',
          /* glsl */ `#include <begin_vertex>
          #ifdef USE_INSTANCING_COLOR
            float grassGreen = clamp((instanceColor.g - max(instanceColor.r, instanceColor.b)) * 9.0, 0.0, 1.0);
            transformed.y *= 1.0 - 0.85 * uWinter * grassGreen;
          #endif`,
        );
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${COMMON}`).replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
        {
          vec3 c = diffuseColor.rgb;
          float g = seasonGreen(c);
          c = mix(c, c * vec3(0.9, 1.15, 0.8), uSpring * g * 0.7);
          c = mix(c, vec3(0.55, 0.38, 0.12), uAutumn * g * 0.6);
          c = mix(c, vec3(0.7, 0.72, 0.74), uWinter * g * 0.8);
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
