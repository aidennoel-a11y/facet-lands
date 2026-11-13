/**
 * Firelight on water: a torch, a campfire, a lantern near the water lights
 * its surface (a warm pool on it, faint) and is mirrored in it (a bright,
 * rippling glint where the light bounces up to your eye). Added on top of
 * the water's own colour, after the sky's reflection has been mixed in
 * (which would otherwise wash the fire's light out). Needs `normal` (the
 * surface's, view space) and `vViewPosition`, as three's Phong shader has
 * them. GLSL, for a fragment shader.
 */
export const TORCH_GLINT = /* glsl */ `
  #if NUM_POINT_LIGHTS > 0
  {
    vec3 Vt = normalize(vViewPosition), here = -vViewPosition, fire = vec3(0.0);
    #pragma unroll_loop_start
    for (int i = 0; i < NUM_POINT_LIGHTS; i++) {
      vec3 toL = pointLights[i].position - here;
      float dl = length(toL);
      float att = getDistanceAttenuation(dl, pointLights[i].distance, pointLights[i].decay);
      vec3 L = toL / max(dl, 1e-3);
      float spec = pow(max(dot(normal, normalize(L + Vt)), 0.0), 60.0);
      fire += pointLights[i].color * att * (0.01 * max(dot(normal, L), 0.0) + 0.18 * spec);
    }
    #pragma unroll_loop_end
    gl_FragColor.rgb += fire;
    gl_FragColor.a = max(gl_FragColor.a, min(1.0, dot(fire, vec3(0.33))));
  }
  #endif
`;
