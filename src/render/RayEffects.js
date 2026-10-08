import {
  Color,
  DepthTexture,
  HalfFloatType,
  Matrix4,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  UnsignedIntType,
  Vector2,
  Vector3,
  WebGLRenderTarget,
} from 'three';

const AO_SAMPLES = 8;
const SHAFT_SAMPLES = 28;

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }`;

const fragmentShader = /* glsl */ `
  uniform sampler2D tColor;
  uniform sampler2D tDepth;
  uniform vec2 resolution;
  uniform mat4 projection;
  uniform mat4 projectionInverse;

  uniform float aoStrength;
  uniform float aoRadius;

  uniform vec2 sunUv;
  uniform float sunVisible;
  uniform vec3 sunColor;
  uniform float shaftStrength;
  uniform float shaftReach;
  uniform float haze; // heat haze, 0..1
  uniform float time;

  varying vec2 vUv;

  #define TAU 6.28318530718

  // View-space position of whatever is drawn at this screen point.
  vec3 viewPosition(vec2 uv) {
    float depth = texture2D(tDepth, uv).x;
    vec4 p = projectionInverse * vec4(vec3(uv, depth) * 2.0 - 1.0, 1.0);
    return p.xyz / p.w;
  }

  // Per-pixel rotation so a few samples cover the disc without banding.
  float noise(vec2 p) {
    return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
  }

  bool onScreen(vec2 uv) {
    return uv.x >= 0.0 && uv.y >= 0.0 && uv.x <= 1.0 && uv.y <= 1.0;
  }

  void main() {
    // Heat haze: over hot sand the air just above the ground shimmers, in
    // wavering columns rising off it, more the further off the ground is
    // (none on the sky, nor close by).
    vec2 cuv = vUv;
    if (haze > 0.0) {
      float d0 = texture2D(tDepth, vUv).x;
      if (d0 < 1.0) {
        float dist = -viewPosition(vUv).z;
        float far = smoothstep(25.0, 140.0, dist) * (1.0 - smoothstep(600.0, 1100.0, dist));
        float rise = vUv.y * 180.0 - time * 3.2;
        float wob = sin(rise + sin(vUv.x * 70.0 + time * 0.7) * 2.2) * (0.5 + 0.5 * sin(vUv.x * 23.0 - time * 0.4));
        cuv.x += wob * haze * far * 0.00045;
        cuv.y += sin(rise * 0.7 + vUv.x * 40.0) * haze * far * 0.00015;
      }
    }
    vec3 color = texture2D(tColor, cuv).rgb;
    float depth = texture2D(tDepth, vUv).x;
    float jitter = noise(gl_FragCoord.xy);

    // --- Ambient occlusion -------------------------------------------------
    // Cast short rays across the depth buffer around this pixel; the more of
    // them hit geometry rising above this face, the less sky light reaches
    // it. Darkens tree bases, creases between faces and where grass meets
    // the ground. The face normal comes straight from the depth buffer, so
    // it is exactly as faceted as the low-poly surfaces.
    if (depth < 1.0 && aoStrength > 0.0) {
      vec3 p = viewPosition(vUv);
      vec3 n = normalize(cross(dFdx(p), dFdy(p)));
      float radiusPx = min(aoRadius * projection[1][1] * 0.5 * resolution.y / -p.z, 90.0);
      float occlusion = 0.0;
      for (int i = 0; i < ${AO_SAMPLES}; i++) {
        float f = (float(i) + 0.5) / float(${AO_SAMPLES});
        float angle = (jitter + float(i) * 0.618034) * TAU;
        vec2 uv = vUv + vec2(cos(angle), sin(angle)) * (f * radiusPx) / resolution;
        if (!onScreen(uv)) continue;
        vec3 v = viewPosition(uv) - p;
        float dist2 = dot(v, v);
        float falloff = 1.0 - smoothstep(0.0, aoRadius * aoRadius, dist2);
        occlusion += max(0.0, dot(v, n) * inversesqrt(dist2 + 1e-4) - 0.08) * falloff;
      }
      float ao = clamp(1.0 - aoStrength * occlusion / float(${AO_SAMPLES}) * 2.2, 0.0, 1.0);
      // Fade out with distance, where the depth buffer gets too coarse.
      ao = mix(ao, 1.0, smoothstep(120.0, 380.0, -p.z));
      color *= ao;
    }

    // --- Light shafts ----------------------------------------------------------
    // March from this pixel towards the sun (or moon) on screen, counting how
    // much open sky the ray passes. Where clouds, trees or mountains block
    // it, the gaps between them become visible beams.
    // (Only where the glow reaches: further from the sun on screen than
    // that, no ray to march.)
    vec2 toSun = sunUv - vUv;
    float glow = pow(max(0.0, 1.0 - length(toSun * vec2(resolution.x / resolution.y, 1.0)) / shaftReach), 2.2);
    if (sunVisible > 0.0 && shaftStrength > 0.0 && glow > 0.002) {
      vec2 stepUv = toSun / float(${SHAFT_SAMPLES});
      vec2 uv = vUv + stepUv * jitter;
      float light = 0.0;
      float weight = 1.0;
      float total = 0.0;
      for (int i = 0; i < ${SHAFT_SAMPLES}; i++) {
        uv += stepUv;
        if (onScreen(uv) && texture2D(tDepth, uv).x >= 0.99999) light += weight;
        total += weight;
        weight *= 0.955;
      }
      color += sunColor * (light / total) * glow * shaftStrength * sunVisible;
    }

    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }`;

/**
 * Screen-space ray-marched lighting, applied after the scene is drawn.
 *
 * Browsers don't give access to ray-tracing hardware, so this does the next
 * best thing: it renders the scene into an off-screen image plus its depth
 * buffer, then marches rays through that depth buffer for two effects:
 *
 *  - ambient occlusion: short rays around each pixel find nearby geometry
 *    that blocks sky light (contact shadows in creases and under trees);
 *  - light shafts ("god rays"): a ray from each pixel towards the sun finds
 *    how much open sky lies that way, so beams stream between clouds, trees
 *    and peaks.
 */
export class RayEffects {
  constructor(renderer) {
    this.renderer = renderer;
    this.target = new WebGLRenderTarget(1, 1, {
      type: HalfFloatType,
      samples: 4,
      depthTexture: new DepthTexture(1, 1, UnsignedIntType),
    });

    this.uniforms = {
      tColor: { value: this.target.texture },
      tDepth: { value: this.target.depthTexture },
      resolution: { value: new Vector2(1, 1) },
      projection: { value: new Matrix4() },
      projectionInverse: { value: new Matrix4() },
      aoStrength: { value: 0.85 },
      aoRadius: { value: 2.5 },
      sunUv: { value: new Vector2() },
      sunVisible: { value: 0 },
      sunColor: { value: new Color() },
      shaftStrength: { value: 0.55 },
      shaftReach: { value: 1.6 },
      haze: { value: 0 },
      time: { value: 0 },
    };

    this.quad = new Mesh(
      new PlaneGeometry(2, 2),
      new ShaderMaterial({ uniforms: this.uniforms, vertexShader, fragmentShader, depthTest: false, depthWrite: false }),
    );
    this.quad.frustumCulled = false;
    this.screen = new Scene();
    this.screen.add(this.quad);
    this.screenCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this._size = new Vector2();
    this._sun = new Vector3();
    this._forward = new Vector3();
  }

  setSize() {
    this.renderer.getDrawingBufferSize(this._size);
    this.target.setSize(this._size.x, this._size.y);
    this.uniforms.resolution.value.copy(this._size);
  }

  /**
   * @param light  { direction: Vector3 towards the light, color: Color, strength (about 0..1.3), reach (screen heights) }
   */
  render(scene, camera, light) {
    const { renderer, uniforms: u } = this;

    renderer.setRenderTarget(this.target);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);

    u.projection.value.copy(camera.projectionMatrix);
    u.projectionInverse.value.copy(camera.projectionMatrixInverse);

    // Where the light sits on screen, and how much we're facing it.
    camera.getWorldDirection(this._forward);
    const facing = this._forward.dot(light.direction);
    this._sun.copy(camera.position).addScaledVector(light.direction, 1000).project(camera);
    u.sunUv.value.set(this._sun.x * 0.5 + 0.5, this._sun.y * 0.5 + 0.5);
    u.sunVisible.value = Math.max(0, Math.min(1, facing / 0.35));
    u.sunColor.value.copy(light.color);
    u.shaftStrength.value = light.strength;
    u.shaftReach.value = light.reach ?? 1.6;
    u.haze.value = light.haze ?? 0;
    u.time.value = (performance.now() / 1000) % 1000;

    renderer.render(this.screen, this.screenCamera);
  }
}
