import { ShaderChunk } from 'three';

/**
 * The sun's shadow in two parts (see DayNight): a sharp map close round
 * you, redrawn every frame, and a broader one out to the shadows' reach,
 * redrawn every third frame. The broad one belongs to a second directional
 * light that gives no light of its own; here, every lit material takes the
 * sun's shadow from the near map where it reaches and from the far one
 * beyond, blending the two over a band at the near map's edge (so no line
 * shows where they meet), and leaves the stand-in light out altogether.
 *
 * Imported first thing (main.js), before any material copies the chunk.
 */
// (The directional lights' shadow and light, as three.js writes them.)
const chunk = ShaderChunk.lights_fragment_begin;
const start = chunk.indexOf('#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )', chunk.indexOf('directionalLight = directionalLights[ i ];'));
const end = chunk.indexOf(';', chunk.indexOf('RE_Direct(', start)) + 1;
if (start < 0 || end <= 0 || !chunk.slice(start, end).includes('vDirectionalShadowCoord[ i ]')) throw new Error('splitShadow: three.js light chunk changed');
const SHADOW = chunk.slice(start, end);

const SPLIT = `
		#if defined( USE_SHADOWMAP ) && ( NUM_DIR_LIGHT_SHADOWS > 1 ) && ( UNROLLED_LOOP_INDEX == 0 )
		if ( directLight.visible && receiveShadow ) {
			vec2 nearAt = vDirectionalShadowCoord[ 0 ].xy / vDirectionalShadowCoord[ 0 ].w;
			float toFar = smoothstep( 0.86, 0.97, max( abs( nearAt.x - 0.5 ), abs( nearAt.y - 0.5 ) ) * 2.0 );
			float sunShadow = 1.0;
			if ( toFar < 1.0 ) sunShadow = getShadow( directionalShadowMap[ 0 ], directionalLightShadows[ 0 ].shadowMapSize, directionalLightShadows[ 0 ].shadowIntensity, directionalLightShadows[ 0 ].shadowBias, directionalLightShadows[ 0 ].shadowRadius, vDirectionalShadowCoord[ 0 ] );
			if ( toFar > 0.0 ) sunShadow = mix( sunShadow, getShadow( directionalShadowMap[ 1 ], directionalLightShadows[ 1 ].shadowMapSize, directionalLightShadows[ 1 ].shadowIntensity, directionalLightShadows[ 1 ].shadowBias, directionalLightShadows[ 1 ].shadowRadius, vDirectionalShadowCoord[ 1 ] ), toFar );
			directLight.color *= sunShadow;
		}
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
		#elif defined( USE_SHADOWMAP ) && ( NUM_DIR_LIGHT_SHADOWS > 1 ) && ( UNROLLED_LOOP_INDEX == 1 )
		// (The far shadow's stand-in light: no light of its own.)
		#else
${SHADOW}
		#endif
`;

ShaderChunk.lights_fragment_begin = chunk.slice(0, start) + SPLIT + chunk.slice(end);
