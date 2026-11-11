import { createTiler } from '../tileMerge.js';
import { BufferAttribute, BufferGeometry, Color, DoubleSide, Group, Mesh, MeshPhongMaterial } from 'three';
import { waterData } from '../waterData.js';
import { windDirection, windStrength } from '../../render/wind.js';
import { seasonUniforms } from '../../render/Seasons.js';
import { SPARKLE_HEAD, sparkleUniforms } from '../../render/waterSparkle.js';
import { RIPPLES, RIPPLE_GLSL } from '../../render/Traces.js';

/**
 * The lakes and the sea, for every chunk that dips below sea level: a sheet
 * of water at sea level (the same grid everywhere, so neighbouring sheets
 * line up), shading from see-through turquoise in the shallows to deep blue.
 *
 * It moves like water: trains of rolling Gerstner waves (their crests
 * sharp, their troughs broad, travelling at the speed real waves of their
 * length do) run downwind across it, big out on the open sea and in a
 * wind, barely a lap on a pond; over them, fine ripples play in the light.
 * It reflects the sky as water does (hardly at all looking straight down,
 * like a mirror looking across it), the sun glittering on it. Along the
 * coast, lines of foam roll in to the shore and wash up it, the surf
 * breaking whitest under the cliffs, and out at sea the highest crests
 * spill over in whitecaps. In a cold winter the lakes freeze over.
 */
// How stormy it is at sea (0..1): only then does the surf break on the shores of a sheltered cove.
export const seaStorm = { value: 0 };

/**
 * The tide (m above or below the sea's still level): rising and falling
 * twice a day (see main), on the open sea only.
 */
export const tide = { value: 0 };

// The breakers rolling in on an open beach, shared by the surface's lift
// (vertex) and its foam (fragment): `u`, where a point is in the passing of
// a breaker (0 the trough behind it, rising to its crest at about 0.75, its
// face falling away sharply in front, to the shore), from how far out it is
// (its depth over the bed's slope), the time, and a slow wander along the
// coast, so the crests come in curved, in crescents, not ruled lines.
const BREAKERS = /* glsl */ `
  float breakerPhase(vec2 p, float depth, float slope) {
    float out_ = max(depth, -3.0) / max(slope, 0.004);
    float bend = 3.5 * sin(p.x * 0.061 + 1.3 * sin(p.y * 0.023)) * cos(p.y * 0.057 + 1.1 * sin(p.x * 0.029));
    return fract((bend - out_) / 17.0 + uTime / 8.0 + 0.15 * sin(p.x * 0.011 - p.y * 0.008));
  }
  // How high a breaker stands: building as it runs into shallower water; past about 1 m deep, spent.
  float breakerHeight(float depth) {
    return 0.75 * smoothstep(6.0, 2.0, depth) * smoothstep(0.7, 1.6, depth) + 0.18 * smoothstep(1.6, 0.4, depth) * smoothstep(-0.4, 0.4, depth);
  }
  // Its shape: a long gentle back, the crest at 0.75, the front falling away steeply.
  float breakerProfile(float u) {
    return (u < 0.75 ? pow(u / 0.75, 2.2) : 1.0 - smoothstep(0.75, 0.86, u)) - 0.35;
  }
  // The swash: the spent wave's water running up the beach (a rise, fast)
  // and draining back down it (slowly), on the sand just above the water.
  float swashLift(float u, float depth) {
    float t = fract(u - 0.82);
    float run = smoothstep(0.0, 0.12, t) * (1.0 - smoothstep(0.15, 0.85, t));
    return 0.6 * run * smoothstep(-2.6, -0.4, depth) * smoothstep(1.2, 0.2, depth);
  }
  // How far up the beach (m above the still water) the swash has run, at
  // t through a wave's coming: shooting up fast as the spent breaker's
  // white water rolls ashore, slowing, then draining back down slowly, the
  // sand left wet and shining. (0 the moment the breaker spills at the shore.)
  float swashReach(float t) {
    float up = 1.0 - pow(1.0 - smoothstep(0.0, 0.2, t), 2.0);
    float down = 1.0 - smoothstep(0.24, 0.9, t);
    return up * down;
  }`;

export function createWaterLayer({ resolution = 16, waveHeight = 0.45, skyColor = new Color(0xd6e8f7), skyTop = new Color(0x7fb4e6) } = {}) {
  const uniforms = { uTime: { value: 0 }, uSky: { value: skyColor }, uSkyTop: { value: skyTop }, uTide: tide };

  const material = new MeshPhongMaterial({
    vertexColors: true,
    transparent: true,
    shininess: 140,
    specular: 0x9ab0c4,
    side: DoubleSide, // (seen from underneath, too)
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms, sparkleUniforms, RIPPLES);
    shader.uniforms.uWind = windStrength;
    shader.uniforms.uWindDir = windDirection;
    shader.uniforms.uWinter = seasonUniforms.uWinter;
    shader.uniforms.uSeaStorm = seaStorm;
    const f = (n) => n.toFixed(4);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        uniform float uTime;
        uniform float uWind;
        uniform vec2 uWindDir;
        uniform float uWinter;
        uniform float uSeaStorm;
        attribute float waveScale;
        attribute float foam;
        attribute float aFreeze;
        attribute float aDepth;
        attribute vec3 aShore;
        attribute float aCoast;
        attribute vec4 aEdgeAB;
        attribute vec4 aEdgeW;
        attribute vec4 aEdgeD;
        uniform float uTide;
        varying float vSheet;
        varying float vSwash;
        varying float vCoastF;
        varying vec3 vShore;
        varying float vSea;
        varying float vOpenCoast;
        varying float vFoam;
        varying float vCrest;
        varying vec2 vWorld;
        varying float vIce;
        varying float vDepth;
        varying float vSurfY;
        varying vec3 vWaveN;
        varying float vShut;
        // One train of Gerstner waves: direction (angle off the wind),
        // length (m), height (share of the whole), phase. Adds its lift and
        // sideways push to disp, and its tilt to the normal.
        void gerstner(vec2 p, float turn, float len, float share, float phase, float amp, inout vec3 disp, inout vec3 n, inout float crest) {
          float c = cos(turn), s = sin(turn);
          vec2 d = vec2(uWindDir.x * c - uWindDir.y * s, uWindDir.x * s + uWindDir.y * c);
          float k = 6.2831853 / len;
          float a = amp * share;
          float w = sqrt(9.8 * k);
          float th = k * dot(d, p) - w * uTime + phase;
          float q = min(1.0, 0.55 / (k * a * 4.0 + 1e-4));
          float co = cos(th), si = sin(th);
          disp += vec3(q * a * d.x * co, a * si, q * a * d.y * co);
          n += vec3(-d.x * k * a * co, -q * k * a * si, -d.y * k * a * co);
          crest += share * si;
        }
        ${BREAKERS}`,
      )
      .replace(
        '#include <beginnormal_vertex>',
        /* glsl */ `vec4 wp = modelMatrix * vec4(position, 1.0);
        vIce = aFreeze * smoothstep(0.35, 0.8, uWinter);
        // (foam: the surf, with how open the water is to the sea packed in
        // above it, in sixteenths: see waterData. Shut in, it lies still.)
        float foamOpen = floor(foam * 0.5) / 16.0;
        float foamSurf = foam - 2.0 * floor(foam * 0.5);
        vFoam = foamSurf * max(smoothstep(0.15, 0.35, foamOpen), smoothstep(0.45, 0.85, uSeaStorm)) * (1.0 - vIce);
        vWorld = wp.xz;
        vDepth = aDepth;
        // The waves: several trains crossing at odd angles about the wind,
        // long swells and shorter seas. Open, deep water rolls, more so in a
        // wind; shallow and small water barely laps.
        // (Water shut in from the sea, a pool lying below sea level inland: still, barely stirring.)
        // (Not the open sea itself, though, far out past any surf: see aShore.z.)
        vShut = (1.0 - aShore.z) * (1.0 - smoothstep(0.1, 0.4, foamOpen));
        float amp = ${f(waveHeight * 1.3)} * waveScale * (0.3 + 0.7 * uWind) * (1.0 - vIce) * (1.0 - 0.85 * vShut);
        vec3 disp = vec3(0.0), wn = vec3(0.0, 1.0, 0.0);
        float crest = 0.0;
        // (A corner on a coast chunk's edge laid on the plain grid's edge: its
        // waves as the plain grid's two corners either side have them, between,
        // so the two chunks' water meets exactly. See waterData.)
        bool onEdge = aCoast >= 2.0;
        float edgeT = aCoast - 2.0;
        vec2 edgeA = (modelMatrix * vec4(aEdgeAB.x, 0.0, aEdgeAB.y, 1.0)).xz, edgeB = (modelMatrix * vec4(aEdgeAB.z, 0.0, aEdgeAB.w, 1.0)).xz;
        if (onEdge) {
          float k0 = amp / max(waveScale, 1e-3);
          vec3 dA = vec3(0.0), nA = vec3(0.0, 1.0, 0.0), dB = vec3(0.0), nB = vec3(0.0, 1.0, 0.0);
          float cA = 0.0, cB = 0.0;
          gerstner(edgeA, 0.0, 74.0, 1.0, 0.0, k0 * aEdgeW.x, dA, nA, cA);
          gerstner(edgeA, 0.55, 43.0, 0.6, 1.7, k0 * aEdgeW.x, dA, nA, cA);
          gerstner(edgeA, -0.75, 25.0, 0.34, 4.1, k0 * aEdgeW.x, dA, nA, cA);
          gerstner(edgeA, 1.35, 15.0, 0.18, 2.3, k0 * aEdgeW.x, dA, nA, cA);
          gerstner(edgeB, 0.0, 74.0, 1.0, 0.0, k0 * aEdgeW.y, dB, nB, cB);
          gerstner(edgeB, 0.55, 43.0, 0.6, 1.7, k0 * aEdgeW.y, dB, nB, cB);
          gerstner(edgeB, -0.75, 25.0, 0.34, 4.1, k0 * aEdgeW.y, dB, nB, cB);
          gerstner(edgeB, 1.35, 15.0, 0.18, 2.3, k0 * aEdgeW.y, dB, nB, cB);
          disp = mix(dA, dB, edgeT);
          wn = mix(nA, nB, edgeT);
          crest = mix(cA, cB, edgeT);
        } else {
          gerstner(wp.xz, 0.0, 74.0, 1.0, 0.0, amp, disp, wn, crest);
          gerstner(wp.xz, 0.55, 43.0, 0.6, 1.7, amp, disp, wn, crest);
          gerstner(wp.xz, -0.75, 25.0, 0.34, 4.1, amp, disp, wn, crest);
          gerstner(wp.xz, 1.35, 15.0, 0.18, 2.3, amp, disp, wn, crest);
        }
        vWaveN = normalize(wn);
        // (How near a big wave's crest this is: whitecaps, out in the open sea, most in a wind.)
        vCrest = smoothstep(1.4, 2.6, waveScale) * smoothstep(1.2, 1.9, crest) * (0.4 + 0.6 * uWind);
        vec3 objectNormal = vWaveN;`,
      )
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        transformed += disp;
        // The tide: the open sea risen or fallen (see tide), and the breakers on its beaches.
        vShore = aShore;
        vSea = aShore.z;
        float slope = length(aShore.xy);
        vOpenCoast = smoothstep(0.12, 0.45, foamOpen) * smoothstep(0.004, 0.02, slope) * (1.0 - vIce) * aShore.z;
        transformed.y += uTide * aShore.z * (1.0 - vIce);
        vSheet = 0.0;
        vSwash = 0.0;
        vCoastF = min(aCoast, 1.0);
        if (onEdge) {
          // (Its breakers, too, as the plain grid's corners either side have them.)
          float energyE = 0.55 + 0.45 * uWind + 0.8 * uSeaStorm;
          float uA = breakerPhase(edgeA, aEdgeD.x, aEdgeD.z), uB = breakerPhase(edgeB, aEdgeD.y, aEdgeD.w);
          float liftA = breakerHeight(aEdgeD.x) * aEdgeW.z * energyE * breakerProfile(uA) * step(0.0, aEdgeW.z - 1e-4);
          float liftB = breakerHeight(aEdgeD.y) * aEdgeW.w * energyE * breakerProfile(uB) * step(0.0, aEdgeW.w - 1e-4);
          transformed.y += mix(liftA, liftB, edgeT) * (1.0 - vIce);
        } else if (aCoast > 0.5) {
          // On the open coast the water lies on the land's own grid (see
          // waterData), so it can meet the beach truly: in the water, the
          // swell rising into breakers, the crests pitching forward toward
          // the shore as they break; on the sand, the swash: a sheet of
          // water, with thickness, rolling up the beach behind a rounded,
          // foaming lip, thinning, then draining back. Sand it hasn't
          // reached lies dry (the water's corners there tucked down under it).
          float ground = position.y - aDepth;
          float depthT = aDepth + uTide * aShore.z;
          float energy = (0.55 + 0.45 * uWind + 0.8 * uSeaStorm);
          float coastal = smoothstep(0.004, 0.02, slope) * (1.0 - vIce) * aShore.z * smoothstep(0.12, 0.45, foamOpen);
          vec2 up = slope > 1e-4 ? aShore.xy / slope : vec2(0.0);
          float sl = max(slope, 0.01);
          if (depthT > 0.0) {
            float u = breakerPhase(wp.xz, depthT, slope);
            float A = breakerHeight(depthT) * coastal * energy;
            transformed.y += A * breakerProfile(u);
            // (The crest curling over: thrown forward, up the slope, just as it breaks.)
            float curl = smoothstep(0.62, 0.76, u) * (1.0 - smoothstep(0.76, 0.84, u)) * smoothstep(0.6, 1.4, depthT) * smoothstep(3.5, 2.0, depthT);
            transformed.xz += up * A * 1.4 * curl * smoothstep(0.45, 0.18, slope);
            // (Never under the bed, at the very edge.)
            transformed.y = max(transformed.y, ground + 0.03);
          } else {
            transformed.xz = position.xz; // (on the land's own corners, no sway)
            float h = -depthT; // (how far above the still water)
            float u0 = breakerPhase(wp.xz, 0.0, slope);
            float t = fract(u0 - 0.82);
            // (Never up a cliff or a steep rock face: only up a beach's gentle slope.)
            float reach = (0.28 + 0.3 * uWind + 0.6 * uSeaStorm) * coastal * swashReach(t) * smoothstep(0.45, 0.18, slope);
            float behind = (reach - h) / sl; // (m behind the front, across the sand)
            float rushing = 1.0 - smoothstep(0.1, 0.32, t);
            if (behind > 0.0) {
              float lip = smoothstep(0.0, 1.2, behind) * (1.0 - smoothstep(1.2, 5.0, behind)) * rushing;
              float thick = 0.035 + 0.05 * smoothstep(0.6, 0.0, h) * (0.4 + 0.6 * rushing) + 0.16 * lip * coastal;
              transformed.y = ground + thick;
              transformed.xz += up * 0.35 * lip; // (the lip leaning forward as it rolls)
              vSheet = 1.0;
              vFoam = 0.0;
              vSwash = max(lip * 1.4, smoothstep(2.5, 0.0, behind) * (0.5 + 0.5 * rushing)) * coastal;
            } else {
              // (Tucked under the sand; under a cliff or a high bank, down at
              // the water's own level, inside the rock, so the water never
              // runs up its face.)
              transformed.y = min(ground - 0.08, position.y + uTide * aShore.z + 0.2);
              vSheet = 1.0;
              vFoam = 0.0;
            }
          }
        } else if (vOpenCoast > 0.0) {
          float u = breakerPhase(wp.xz, aDepth, slope);
          float A = breakerHeight(aDepth) * vOpenCoast * (0.55 + 0.45 * uWind + 0.8 * uSeaStorm);
          transformed.y += A * breakerProfile(u) + swashLift(u, aDepth) * vOpenCoast * (0.6 + 0.4 * uWind + 0.6 * uSeaStorm);
        }
        vSurfY = (modelMatrix * vec4(transformed, 1.0)).y;`);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        uniform vec3 uSky;
        uniform vec3 uSkyTop;
        uniform float uTime;
        uniform float uWind;
        uniform vec2 uWindDir;
        varying float vFoam;
        varying float vCrest;
        varying vec2 vWorld;
        varying float vIce;
        varying float vDepth;
        varying float vSurfY;
        varying vec3 vWaveN;
        varying float vShut;
        uniform float uSeaStorm;
        varying vec3 vShore;
        varying float vSea;
        varying float vOpenCoast;
        varying float vSheet;
        varying float vSwash;
        varying float vCoastF;
        ${BREAKERS}
        float waterHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float waterNoise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(waterHash(i), waterHash(i + vec2(1.0, 0.0)), f.x), mix(waterHash(i + vec2(0.0, 1.0)), waterHash(i + vec2(1.0, 1.0)), f.x), f.y);
        }
        // Fine ripples: three sizes of them drifting with the wind.
        float ripples(vec2 p) {
          vec2 d = uWindDir * uTime * mix(1.0, 0.15, vShut); // (shut-in water: its ripples hardly drift)
          return waterNoise(p * 0.32 - d * 0.5) * 0.55 + waterNoise(p * 0.9 + vec2(-d.y, d.x) * 0.7) * 0.3 + waterNoise(p * 2.3 - d * 1.6) * 0.15;
        }
        ${SPARKLE_HEAD}
        ${RIPPLE_GLSL}`,
      )
      .replace(
        '#include <normal_fragment_begin>',
        /* glsl */ `#include <normal_fragment_begin>
        {
          // The waves' own tilt, then the ripples over it (fading out with
          // distance, where they'd only shimmer).
          float fine = (1.0 - smoothstep(50.0, 240.0, length(vViewPosition))) * (0.35 + 0.65 * uWind) * (1.0 - vIce) * (1.0 - 0.6 * vShut);
          float e = 0.35;
          float h0 = ripples(vWorld);
          vec2 g = vec2(ripples(vWorld + vec2(e, 0.0)) - h0, ripples(vWorld + vec2(0.0, e)) - h0) / e;
          vec3 nw = normalize(vWaveN + vec3(-g.x, 0.0, -g.y) * 0.9 * fine);
          normal = normalize((viewMatrix * vec4(nw, 0.0)).xyz);
        }`,
      )
      .replace(
        '#include <fog_fragment>',
        /* glsl */ `{
          // The sky in it: little looking straight down, a mirror looking
          // across (Fresnel), the zenith's colour overhead in it, the
          // horizon's low down.
          vec3 V = normalize(vViewPosition); // (towards the eye)
          float nv = clamp(dot(normal, V), 0.0, 1.0);
          float fres = 0.02 + 0.98 * pow(1.0 - nv, 5.0);
          vec3 R = (vec4(reflect(-V, normal), 0.0) * viewMatrix).xyz;
          vec3 sky = mix(uSky, uSkyTop, pow(clamp(R.y, 0.0, 1.0), 0.25));
          // (Seen from under the water: no sky mirrored in it; see below.)
          float below = step(cameraPosition.y, vSurfY);
          float mirror = fres * (1.0 - vIce) * (1.0 - below);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, sky, mirror * 0.8);
          gl_FragColor.a = mix(gl_FragColor.a, 1.0, mirror * 0.8);
          // Foam: waves breaking in the shallows, coming and going; lines of
          // it rolling in to the shore and washing up it (on the open coast
          // most; a lake just laps); whitecaps out at sea.
          float froth = waterNoise(vWorld * 0.18 + vec2(uTime * 0.25, -uTime * 0.18)) * 0.6 + waterNoise(vWorld * 0.47 - uTime * 0.4) * 0.4;
          float breaking = vFoam * smoothstep(0.45, 0.75, froth + 0.25 * sin(uTime * 1.1 + froth * 5.0));
          float shore = 1.0 - smoothstep(0.2, 3.2, vDepth);
          float roll = fract(vDepth * 0.42 + uTime * 0.14 + waterNoise(vWorld * 0.04) * 0.9);
          float line = smoothstep(0.78, 0.93, roll) * (1.0 - smoothstep(0.93, 1.0, roll)) * smoothstep(0.3, 0.7, waterNoise(vWorld * 0.35 + uTime * 0.15));
          float swash = (1.0 - smoothstep(-0.2, 0.35, vDepth)) * (0.55 + 0.45 * sin(uTime * 0.9 + vWorld.x * 0.05 + vWorld.y * 0.07));
          float coast = min(1.0, 0.3 + vFoam * 2.0);
          float lap = max(line * shore, swash * (1.0 - vCoastF)) * coast;
          float cap = vCrest * smoothstep(0.5, 0.75, waterNoise(vWorld * 0.09 + uTime * 0.12));
          // The breakers on an open beach: each swell rising as it runs into
          // the shallows, its face steepening and glowing green with the
          // light through it, its lip curling over in a white crescent and
          // falling on itself; then a bore of white water rushing in, and the
          // last of it sliding up the sand in a thin lacy sheet and draining
          // back. (See breakerPhase: the same waves as the surface's own lift.)
          if (vOpenCoast > 0.01) {
            float slopeF = max(length(vShore.xy), 0.004);
            float u = breakerPhase(vWorld, vDepth, slopeF);
            float zone = smoothstep(4.5, 2.2, vDepth) * smoothstep(0.6, 1.4, vDepth);
            float face = smoothstep(0.5, 0.74, u) * (1.0 - smoothstep(0.76, 0.8, u)) * smoothstep(5.0, 2.0, vDepth);
            gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.32, 0.7, 0.66), face * 0.45 * vOpenCoast);
            float n1 = waterNoise(vWorld * 0.6 + vec2(uTime * 0.4, 0.0)), n2 = waterNoise(vWorld * 1.7 - uTime * 0.6);
            float lip = smoothstep(0.71, 0.765, u) * (1.0 - smoothstep(0.765, 0.84, u)) * zone;
            float bore = smoothstep(1.5, 0.4, vDepth) * smoothstep(-0.6, 0.2, vDepth) * pow(1.0 - fract(u - 0.78), 3.0) * smoothstep(0.25, 0.6, n1 * 0.7 + n2 * 0.5);
            float sheet = smoothstep(0.4, -0.2, vDepth) * swashLift(u, -0.5) * 2.5 * smoothstep(0.3, 0.75, n2 + 0.3 * n1);
            float edge = smoothstep(0.15, -0.05, vDepth) * smoothstep(-1.6, -0.2, vDepth) * smoothstep(0.55, 0.8, n2 + 0.4 * sin(uTime * 1.3 + vWorld.x * 0.11));
            float washed = (1.0 - vCoastF) * max(sheet, edge * swashLift(u, -0.2) * 3.0); // (on the coast's own grid, the swash below instead)
            breaking = max(breaking, max(max(lip, bore), washed) * vOpenCoast * (0.7 + 0.3 * uWind + 0.5 * uSeaStorm));
          }
          // The swash on the sand (see the vertex shader): a thin, clear sheet,
          // the sand showing through it, behind a front of white water and lace.
          if (vCoastF > 0.5 && vSheet > 0.01) {
            float n3 = waterNoise(vWorld * 1.3 + vec2(uTime * 0.9, -uTime * 0.5)), n4 = waterNoise(vWorld * 3.1 - uTime * 0.7);
            float holes = smoothstep(0.3, 0.75, n3 * 0.6 + n4 * 0.5);
            float lace = smoothstep(0.7, 1.3, vSwash) * (0.6 + 0.4 * holes) + smoothstep(0.1, 0.6, vSwash) * holes * 0.8;
            breaking = max(breaking, min(1.0, lace) * (1.0 - vIce));
            gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.55, 0.72, 0.7), vSheet * 0.35);
            gl_FragColor.a = mix(gl_FragColor.a, 0.42, vSheet * (1.0 - smoothstep(0.1, 0.6, vSwash)));
          }
          float white = max(max(breaking, cap), lap) * (1.0 - vIce) * (1.0 - 0.7 * below);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.95, 0.97, 0.98), white * 0.85);
          gl_FragColor.a = mix(gl_FragColor.a, 1.0, white * 0.75);
          // Sun glitter (not where a cloud's shadow lies), and rings in the rain.
          float open = (1.0 - vIce) * (1.0 - white) * (1.0 - below);
          gl_FragColor.rgb += sunGlitter(vWorld, normal, -V, uTime) * open * (1.0 - uCloudStrength * texture2D(uCloudShadow, (vCloudXZ - uCloudOrigin) / uCloudSize).r * 1.6);
          gl_FragColor.rgb += rainRings(vWorld, uTime) * 0.22 * open;
          { float sr = splashRings(vWorld); gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.93, 0.97, 1.0), sr); gl_FragColor.a = max(gl_FragColor.a, sr); } // (splashes' rings: see Traces)
          #ifdef USE_FOG
          // (Out past Snell's window, some 49° off straight up, the surface
          // is a mirror, silvery, the water under it shown back rippling with
          // the waves; at the window's edge a bright ring; inside it, the sky
          // shining through, wavering.)
          float nvB = abs(dot(normal, V)), win = smoothstep(0.62, 0.78, nvB);
          float shimmer = ripples(vWorld * 1.4 + vec2(uTime * 0.3, -uTime * 0.2));
          vec3 mirrored = fogColor * (1.5 + 0.6 * shimmer) + vec3(0.1, 0.14, 0.15) * (0.6 + 0.8 * shimmer);
          vec3 through = (uSky * 0.75 + fogColor * 0.4) * (0.9 + 0.25 * shimmer);
          float rd = (nvB - 0.7) / 0.06, ring = exp(-rd * rd);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, mix(mirrored, through, win) + uSky * 0.35 * ring, below);
          #endif
          gl_FragColor.a = mix(gl_FragColor.a, 0.92, below);
          // Winter: lakes freeze over.
          gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.74, 0.84, 0.9), vIce * 0.85);
          gl_FragColor.a = mix(gl_FragColor.a, 0.95, vIce);
        }
        #include <fog_fragment>`,
      );
  };
  material.customProgramCacheKey = () => 'water-v4';

  // Far off (see TILE_LOD), the water of several chunks drawn as one (see tileMerge).
  const TILE_LOD = 2;
  let tiler = null;
  const tilerFor = (config) => (tiler ??= createTiler({ chunkSize: config.chunkSize, material, name: 'water', renderOrder: 1, pad: waveHeight * 12 }));

  return {
    name: 'water',
    material,
    get tileGroup() {
      return tiler?.group ?? null;
    },
    tilesFor: (config) => tilerFor(config).group,

    update(time) {
      uniforms.uTime.value = time;
      tiler?.flush();
    },

    /**
     * The waves' lift at (x, z) (the water `depth` deep there, `ocean` how
     * open the sea), as the shader draws them: { y (m above the still
     * water), nx, nz (the surface's tilt) }. For what floats on it.
     */
    waveAt(x, z, depth, ocean, out = {}) {
      const sm = (a, b, v) => { const q = Math.min(1, Math.max(0, (v - a) / (b - a))); return q * q * (3 - 2 * q); };
      const scale = 0.1 + 0.9 * sm(1, 16, depth) + 2.4 * (depth >= 6 ? sm(6, 30, depth) * sm(0.4, 0.8, ocean) : 0);
      const amp = waveHeight * scale * (0.3 + 0.7 * windStrength.value), wd = windDirection.value, time = uniforms.uTime.value;
      let y = 0, nx = 0, nz = 0;
      for (const [turn, len, share, phase] of [[0, 74, 1, 0], [0.55, 43, 0.6, 1.7], [-0.75, 25, 0.34, 4.1], [1.35, 15, 0.18, 2.3]]) {
        const c = Math.cos(turn), s = Math.sin(turn), dx = wd.x * c - wd.y * s, dz = wd.x * s + wd.y * c;
        const k = (Math.PI * 2) / len, a = amp * share, th = k * (dx * x + dz * z) - Math.sqrt(9.8 * k) * time + phase;
        y += a * Math.sin(th);
        nx -= dx * k * a * Math.cos(th);
        nz -= dz * k * a * Math.cos(th);
      }
      out.y = y;
      out.nx = nx;
      out.nz = nz;
      return out;
    },

    /**
     * The surf on an open beach at (x, z), as the shader draws it (see
     * BREAKERS and the coast's swash): `depth` under the still water (with
     * the tide; above it, on the sand, below 0), `slope` the bed's, `ocean`
     * how open the sea. { swash (the sheet's over the sand here), thick,
     * rushing (0..1: running up, not draining), front (at its foaming front),
     * breaker (a breaker's lip coming down here), height } or null.
     */
    surfAt(x, z, depth, slope, ocean) {
      if (!(ocean > 0.05) || depth > 4.5) return null;
      const sm = (a, b, v) => { const q = Math.min(1, Math.max(0, (v - a) / (b - a))); return q * q * (3 - 2 * q); };
      const fr = (v) => v - Math.floor(v);
      const t = uniforms.uTime.value, wind = windStrength.value, storm = seaStorm.value;
      const coastal = sm(0.004, 0.02, slope) * ocean;
      if (coastal < 0.05) return null;
      const bend = 3.5 * Math.sin(x * 0.061 + 1.3 * Math.sin(z * 0.023)) * Math.cos(z * 0.057 + 1.1 * Math.sin(x * 0.029));
      const phase = (d) => fr((bend - Math.max(d, -3) / Math.max(slope, 0.004)) / 17 + t / 8 + 0.15 * Math.sin(x * 0.011 - z * 0.008));
      if (depth <= 0) {
        const tt = fr(phase(0) - 0.82);
        const up = 1 - (1 - sm(0, 0.2, tt)) ** 2, down = 1 - sm(0.24, 0.9, tt);
        const reach = (0.28 + 0.3 * wind + 0.6 * storm) * coastal * up * down * sm(0.45, 0.18, slope);
        const behind = (reach + depth) / Math.max(slope, 0.01);
        if (behind <= 0) return null;
        const rushing = 1 - sm(0.1, 0.32, tt);
        return { swash: true, thick: 0.04 + 0.1 * rushing, rushing, front: behind < 2.5 };
      }
      const u = phase(depth);
      const height = (0.75 * sm(6, 2, depth) * sm(0.7, 1.6, depth) + 0.18 * sm(1.6, 0.4, depth) * sm(-0.4, 0.4, depth)) * coastal * (0.55 + 0.45 * wind + 0.8 * storm);
      return { swash: false, breaker: u > 0.74 && u < 0.84 && height > 0.12, height, u };
    },

    reuseKey: ({ resolution, lod }) => `${lod >= TILE_LOD ? 'tiled:' : ''}${resolution}`,

    build({ cx, cz, lod, heights, generator, config, prepared }) {
      // (Worked out by the chunk's worker, or here.)
      const data = prepared?.water !== undefined ? prepared.water : waterData(generator, config, cx, cz, heights, resolution);
      if (!data) return null;
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new BufferAttribute(data.positions, 3));
      geometry.setAttribute('color', new BufferAttribute(data.colors, 4));
      geometry.setAttribute('waveScale', new BufferAttribute(data.waves, 1));
      geometry.setAttribute('foam', new BufferAttribute(data.foams, 1));
      geometry.setAttribute('aFreeze', new BufferAttribute(data.freezes, 1));
      geometry.setAttribute('aDepth', new BufferAttribute(data.depths, 1));
      const count = data.depths.length;
      geometry.setAttribute('aCoast', new BufferAttribute(data.coasts ?? new Float32Array(count), 1));
      geometry.setAttribute('aEdgeAB', new BufferAttribute(data.edgeAB ?? new Float32Array(count * 4), 4));
      geometry.setAttribute('aEdgeW', new BufferAttribute(data.edgeW ?? new Float32Array(count * 4), 4));
      geometry.setAttribute('aEdgeD', new BufferAttribute(data.edgeD ?? new Float32Array(count * 4), 4));
      geometry.setAttribute('aShore', new BufferAttribute(data.shores ?? new Float32Array(data.depths.length * 3), 3));
      geometry.setAttribute('normal', new BufferAttribute(new Float32Array(data.positions.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
      geometry.computeBoundingSphere();
      // Waves move vertices about; pad the bounds so culling stays correct.
      geometry.boundingSphere.radius += waveHeight * 12;

      if (lod >= TILE_LOD) {
        // (Far off: into its square's one mesh; this chunk keeps only a handle on it, and the geometry.)
        const stub = new Group();
        stub.name = 'water';
        stub.userData.tile = tilerFor(config).add(cx, cz, geometry);
        stub.userData.geometry = geometry;
        return stub;
      }
      const mesh = new Mesh(geometry, material);
      mesh.name = 'water';
      mesh.renderOrder = 1;
      mesh.receiveShadow = true;
      return mesh;
    },

    dispose(object) {
      if (object.userData.tile) {
        tiler?.remove(object.userData.tile);
        object.userData.tile = null;
        object.userData.geometry?.dispose();
        return;
      }
      object.geometry.dispose();
    },
  };
}
