import { AdditiveBlending, BufferAttribute, BufferGeometry, Mesh, ShaderMaterial, Vector3 } from 'three';

const DISTANCE = 1400; // how far off they're drawn (well inside the view, beyond everything else)

const a = new Vector3(), b = new Vector3(), side = new Vector3(), look = new Vector3();

/**
 * Shooting stars on a clear night: now and then one streaks across the
 * sky, a bright head trailing a fading tail, and is gone in under a second.
 */
// (A number 0..1 for these, the same for everyone online.)
function hash01(...n) {
  let h = n.reduce((h, v) => Math.imul(h ^ Math.round(v), 0x85ebca6b) ^ (h >>> 13), 0x27d4eb2f);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  return ((h ^ (h >>> 12)) >>> 0) / 4294967296;
}

export class ShootingStars {
  constructor(scene) {
    this.geometry = new BufferGeometry();
    this.geometry.setAttribute('position', new BufferAttribute(new Float32Array(12), 3));
    this.geometry.setAttribute('glow', new BufferAttribute(new Float32Array([0, 0, 1, 1]), 1));
    this.geometry.setIndex([0, 1, 2, 2, 1, 3]);
    this.material = new ShaderMaterial({
      uniforms: { opacity: { value: 0 } },
      vertexShader: /* glsl */ `
        attribute float glow;
        varying float vGlow;
        void main() {
          vGlow = glow;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float opacity;
        varying float vGlow;
        void main() {
          gl_FragColor = vec4(vec3(0.95, 0.97, 1.0), vGlow * vGlow * opacity);
        }`,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      fog: false,
    });
    this.mesh = new Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.renderOrder = 0;
    scene.add(this.mesh);
    this.star = null;
  }

  /**
   * @param dark   how dark and clear the night is (0 by day or under cloud .. 1)
   */
  update(dt, camera, dark, clock = performance.now() / 1000) {
    if (!this.star) {
      this.mesh.visible = false;
      if (dark < 0.5) return;
      // (When, and where in the sky: by the clock (online, the room's), so
      // everyone looking up sees the same one. A chance every 20 seconds.)
      const slot = Math.floor(clock / 20), r = (k) => hash01(slot, k);
      const at = slot * 20 + 18 * r(0);
      if (this.slot === slot || clock < at || clock - at > 0.3 || r(1) > 0.6 * dark) return;
      this.slot = slot;
      // Somewhere up the sky, falling slantwise across it.
      const az = r(2) * Math.PI * 2, el = 0.45 + r(3) * 0.7;
      const from = new Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
      const across = new Vector3(-Math.sin(az), 0, Math.cos(az)).multiplyScalar(r(4) < 0.5 ? 1 : -1);
      const dir = across.multiplyScalar(0.8).addScaledVector(new Vector3(0, -1, 0), 0.5).normalize();
      this.star = { from, dir, age: 0, life: 0.5 + r(5) * 0.6, sweep: 0.25 + r(6) * 0.25, bright: 0.6 + r(7) * 0.4 };
    }
    const s = this.star;
    s.age += dt;
    const t = s.age / s.life;
    if (t >= 1) {
      this.star = null;
      this.mesh.visible = false;
      return;
    }
    // The head along its path; the tail a stretch behind it, the whole
    // drawn as a thin strip facing you.
    const head = a.copy(s.from).addScaledVector(s.dir, s.sweep * t).normalize();
    const tail = b.copy(s.from).addScaledVector(s.dir, s.sweep * Math.max(0, t - 0.35)).normalize();
    const cam = camera.position;
    look.copy(head);
    side.crossVectors(look, s.dir).normalize().multiplyScalar(DISTANCE * 0.0012);
    const p = this.geometry.attributes.position;
    const H = head.multiplyScalar(DISTANCE).add(cam), T = tail.multiplyScalar(DISTANCE).add(cam);
    p.setXYZ(0, T.x - side.x * 0.3, T.y - side.y * 0.3, T.z - side.z * 0.3);
    p.setXYZ(1, T.x + side.x * 0.3, T.y + side.y * 0.3, T.z + side.z * 0.3);
    p.setXYZ(2, H.x - side.x, H.y - side.y, H.z - side.z);
    p.setXYZ(3, H.x + side.x, H.y + side.y, H.z + side.z);
    p.needsUpdate = true;
    this.material.uniforms.opacity.value = s.bright * dark * Math.sin(Math.PI * t);
    this.mesh.visible = true;
  }
}
