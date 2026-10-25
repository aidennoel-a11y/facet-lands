import { ShaderLib } from 'three';

/**
 * A chunk of land changing its level of detail (finer ground, full trees
 * for simple ones, or back) doesn't swap in a frame: for half a second the
 * old and the new are both there, the new showing through more and more of
 * the screen's pixels as the old shows through fewer (a fine dither, each
 * pixel one or the other, never both or neither), so the change melts in
 * rather than pops.
 *
 * Each fading thing draws with its own copy of its material, whose
 * `opacity` (otherwise always 1 on the land and what grows on it) carries
 * how far the fade has got: 2 + v fading in, 4 + v fading out, v from 0 to
 * 1. Patched into the lit materials' shaders here, before any is compiled
 * (imported first thing, main.js).
 */
export const FADE_SECONDS = 0.55;

const DITHER = /* glsl */ `
	if ( opacity > 1.5 ) {
		// (Interleaved gradient noise: an even, fine scatter of pixels.)
		float fadeAt = fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) );
		float fadeV = fract( opacity );
		if ( opacity < 3.5 ? fadeAt >= fadeV : fadeAt < fadeV ) discard;
		diffuseColor.a /= floor( opacity );
	}
	#include <alphatest_fragment>`;

for (const name of ['basic', 'lambert', 'phong', 'standard', 'physical', 'toon']) {
  const lib = ShaderLib[name];
  if (!lib.fragmentShader.includes('#include <alphatest_fragment>')) throw new Error(`chunkFade: three.js ${name} shader changed`);
  lib.fragmentShader = lib.fragmentShader.replace('#include <alphatest_fragment>', DITHER);
}

/** A copy of `material` to fade one thing with (the same shader: nothing new to compile), or null if it can't be. */
export function fadeCopy(material) {
  if (!material || Array.isArray(material) || material.isShaderMaterial || material.transparent || material.opacity !== 1) return null;
  // (Its userData left behind: it may hold what can't be copied.)
  const userData = material.userData;
  material.userData = {};
  let copy;
  try {
    copy = material.clone();
  } finally {
    material.userData = userData;
  }
  copy.onBeforeCompile = material.onBeforeCompile;
  copy.customProgramCacheKey = material.customProgramCacheKey;
  if (material.defines) copy.defines = { ...material.defines };
  copy.userData.fadeOf = material;
  return copy;
}

/** The opacity that says "fading in (or out), `v` of the way". */
export const fadeOpacity = (v, out) => (out ? 4 : 2) + Math.min(0.999, Math.max(0, v));
