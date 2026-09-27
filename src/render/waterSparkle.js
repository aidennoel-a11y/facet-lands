import { Color, Vector3 } from 'three';

/**
 * What lakes, the sea and rivers need to glitter in the sun and dimple in
 * the rain: the direction of the sun (or moon) in view space, how bright
 * its glitter is (0 behind cloud, at night by a faint moon), its colour,
 * and how hard it's raining. Set every frame by the caller.
 */
export const sparkleUniforms = {
  uSunView: { value: new Vector3(0, 1, 0) },
  uGlitter: { value: 0 },
  uSunColor: { value: new Color(1, 1, 1) },
  uRainfall: { value: 0 },
};

/** GLSL for the fragment shader's head (needs a `waterHash(vec2)`). */
export const SPARKLE_HEAD = /* glsl */ `
  uniform vec3 uSunView;
  uniform float uGlitter;
  uniform vec3 uSunColor;
  uniform float uRainfall;
  // Sun glitter: the waves' little facets, each tipped its own way and
  // rocking, catch the sun one after another: a path of sparkles towards it.
  vec3 sunGlitter(vec2 world, vec3 n, vec3 viewDir, float t) {
    if (uGlitter < 0.01) return vec3(0.0);
    vec2 cell = floor(world * 1.6);
    float h1 = waterHash(cell), h2 = waterHash(cell + 17.3);
    vec3 tip = vec3(h1 - 0.5, 0.0, h2 - 0.5) * 0.5 * vec3(sin(t * (2.0 + 3.0 * h1) + h2 * 6.3), 1.0, cos(t * (2.0 + 3.0 * h2) + h1 * 6.3));
    vec3 m = normalize(n + (viewMatrix * vec4(tip, 0.0)).xyz);
    float s = pow(max(dot(reflect(-uSunView, m), viewDir), 0.0), 350.0);
    return uSunColor * s * 3.0 * uGlitter;
  }
  // Rain: rings spreading on the water where drops land, two sizes of them.
  float rainRings(vec2 world, float t) {
    if (uRainfall < 0.01) return 0.0;
    float rings = 0.0;
    for (int k = 0; k < 2; k++) {
      float scale = k == 0 ? 1.1 : 0.7;
      vec2 p = world * scale + float(k) * 13.7;
      vec2 c = floor(p), f = fract(p) - 0.5;
      float speed = 1.1 + 0.4 * waterHash(c + 5.1);
      float cycle = t * speed + waterHash(c + 3.3);
      float age = fract(cycle);
      // (Not every cell has a drop each time: fewer in a light shower.)
      float falls = step(waterHash(c + floor(cycle) * 7.13), uRainfall);
      vec2 o = (vec2(waterHash(c + 1.7), waterHash(c + 9.2)) - 0.5) * 0.5;
      float d = length(f - o);
      rings += falls * (1.0 - smoothstep(0.0, 0.045, abs(d - age * 0.42))) * (1.0 - age);
    }
    return rings;
  }
`;
