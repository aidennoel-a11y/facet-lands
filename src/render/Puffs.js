import { Color, IcosahedronGeometry, InstancedBufferAttribute, InstancedMesh, Matrix4, ShaderMaterial, UniformsLib, UniformsUtils, Vector3 } from 'three';

const shape = new IcosahedronGeometry(1, 0);
const identity = new Matrix4();

/**
 * Puffs: a cloud of low-poly blobs rising and drifting from a point, each
 * going round its own cycle (born, swelling or shrinking, fading away,
 * born again), all worked out on the graphics card from the time: smoke
 * from a fire or a volcano, flames, glowing ash, dust. Only the centre,
 * the wind, how much of it there is and the light need setting each frame.
 */
export class Puffs {
  /**
   * @param count   how many puffs
   * @param make    (k) => { offset: [x, y, z] (from the centre), velocity: [x, y, z] (m/s),
   *                period (s), phase (0..1), from, to (size, m), colour (Color), glow (0..1) }
   * @param opacity how solid (0..1)
   */
  constructor(scene, count, make, { opacity = 0.7 } = {}) {
    const offsets = new Float32Array(count * 3), velocities = new Float32Array(count * 3), lives = new Float32Array(count * 4), colours = new Float32Array(count * 4);
    for (let k = 0; k < count; k++) {
      const p = make(k);
      offsets.set(p.offset, k * 3);
      velocities.set(p.velocity, k * 3);
      lives.set([p.period, p.phase, p.from, p.to], k * 4);
      colours.set([p.colour.r, p.colour.g, p.colour.b, p.glow ?? 0], k * 4);
    }
    const geometry = shape.clone();
    geometry.setAttribute('aOffset', new InstancedBufferAttribute(offsets, 3));
    geometry.setAttribute('aVelocity', new InstancedBufferAttribute(velocities, 3));
    geometry.setAttribute('aLife', new InstancedBufferAttribute(lives, 4));
    geometry.setAttribute('aColour', new InstancedBufferAttribute(colours, 4));
    this.uniforms = UniformsUtils.merge([
      UniformsLib.fog,
      {
        uTime: { value: 0 },
        uCentre: { value: new Vector3() },
        uWind: { value: new Vector3() },
        uReveal: { value: 1e6 }, // puffs further out than this from the centre are hidden
        uAmount: { value: 1 },
        uGlow: { value: 1 }, // how bright the glowing ones are (brighter at night)
        uLight: { value: new Color(1, 1, 1) },
        uOpacity: { value: opacity },
      },
    ]);
    const material = new ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      fog: true,
      vertexShader: /* glsl */ `
        attribute vec3 aOffset;
        attribute vec3 aVelocity;
        attribute vec4 aLife;
        attribute vec4 aColour;
        uniform float uTime;
        uniform vec3 uCentre;
        uniform vec3 uWind;
        uniform float uReveal;
        uniform float uAmount;
        varying vec4 vColour;
        varying float vAlpha;
        varying float vShade;
        #include <fog_pars_vertex>
        void main() {
          float age = fract(uTime / aLife.x + aLife.y);
          float t = age * aLife.x;
          float size = mix(aLife.z, aLife.w, age) * step(length(aOffset.xz), uReveal) * step(0.001, uAmount);
          vec3 centre = uCentre + aOffset + aVelocity * t + uWind * t;
          vec4 mvPosition = viewMatrix * vec4(centre + position * size, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          vColour = aColour;
          vAlpha = sin(3.14159 * age) * uAmount;
          vShade = 0.6 + 0.4 * max(dot(normal, normalize(vec3(0.3, 1.0, 0.2))), 0.0);
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uLight;
        uniform float uGlow;
        uniform float uOpacity;
        varying vec4 vColour;
        varying float vAlpha;
        varying float vShade;
        #include <fog_pars_fragment>
        void main() {
          vec3 c = vColour.rgb * mix(uLight * vShade, vec3(1.6 * uGlow), vColour.a);
          gl_FragColor = vec4(c, vAlpha * uOpacity);
          #include <fog_fragment>
        }`,
    });
    this.mesh = new InstancedMesh(geometry, material, count);
    for (let k = 0; k < count; k++) this.mesh.setMatrixAt(k, identity);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.name = 'puffs';
    scene.add(this.mesh);
    this.scene = scene;
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.mesh.dispose();
  }
}
