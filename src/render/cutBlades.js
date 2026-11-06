import { Color, DoubleSide, DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshLambertMaterial, Quaternion, Vector3 } from 'three';
import { grassShapes } from '../world/layers/GrassLayer.js';

const MAX = 400; // (fallen tufts at once, of each kind)
const LIFE = 10; // seconds a cut tuft lies there, fading away
const m4 = new Matrix4(), q = new Quaternion(), q2 = new Quaternion(), p = new Vector3(), s = new Vector3(), X = new Vector3(1, 0, 0), Y = new Vector3(0, 1, 0);

/**
 * Grass cut with a sickle: each tuft that really stood there (its own
 * shape, size, turn and colour: see GrassLayer.tuftsNear), sheared off at
 * the foot and tipping over whole the way the blade swept, the same as it
 * stood, not gathered in; then lying there and fading slowly away over
 * the next ten seconds.
 */
export class CutBlades {
  constructor(scene) {
    const material = new MeshLambertMaterial({ vertexColors: true, side: DoubleSide, transparent: true, depthWrite: false });
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aFade;\nvarying float vFade;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFade = aFade;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vFade;')
        .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n#ifdef DOUBLE_SIDED\nnormal *= faceDirection;\n#endif')
        .replace('#include <opaque_fragment>', '#include <opaque_fragment>\ngl_FragColor.a *= vFade;');
    };
    material.customProgramCacheKey = () => 'cut-grass';
    this.meshes = grassShapes().map((g, kind) => {
      g.setAttribute('aFade', new InstancedBufferAttribute(new Float32Array(MAX), 1).setUsage(DynamicDrawUsage));
      const mesh = new InstancedMesh(g, material, MAX);
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.setColorAt(0, new Color());
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.name = `cut grass ${kind}`;
      scene.add(mesh);
      return mesh;
    });
    this.list = [];
    this.colour = new Color();
  }

  /**
   * The tufts that really stood there, cut: `ground(x, z)` the ground's
   * height, `sweep` the way the blade went (radians).
   */
  fell(tufts, ground, sweep) {
    for (const t of tufts.slice(0, 150)) {
      const y = ground(t.x, t.z);
      if (!Number.isFinite(y)) continue;
      this.list.push({
        x: t.x, y: y - 0.02, z: t.z, h: t.h, w: t.w ?? t.h, kind: Math.min(this.meshes.length - 1, t.kind ?? 0), turn: t.turn ?? 0, t: -Math.random() * 0.15,
        fall: sweep + (Math.random() - 0.5) * 0.9,
        colour: this.colour.setRGB(t.r, t.g, t.b).getHex(),
      });
    }
    if (this.list.length > MAX * 2) this.list.splice(0, this.list.length - MAX * 2);
  }

  update(dt) {
    const counts = this.meshes.map(() => 0), tint = this.colour;
    this.list = this.list.filter((b) => (b.t += dt) < LIFE);
    for (const b of this.list) {
      const mesh = this.meshes[b.kind], n = counts[b.kind];
      if (n >= MAX) continue;
      // (Tipping over: slow at first, quicker as it goes, a little bounce as it lands; it stays its own shape.)
      const u = Math.min(1, Math.max(0, b.t / 0.7));
      const over = (Math.PI / 2 - 0.12) * u * u + (u >= 1 ? 0.06 * Math.exp(-(b.t - 0.7) * 8) * Math.sin((b.t - 0.7) * 30) : 0);
      q.setFromAxisAngle(Y, b.fall).multiply(q2.setFromAxisAngle(X, over)).multiply(q2.setFromAxisAngle(Y, b.turn - b.fall));
      p.set(b.x, b.y, b.z);
      mesh.setMatrixAt(n, m4.compose(p, q, s.set(b.w, b.h, b.w)));
      mesh.setColorAt(n, tint.setHex(b.colour).multiplyScalar(1 - 0.25 * Math.min(1, b.t / LIFE)));
      // (Fading away slowly over the ten seconds, once it's down.)
      mesh.geometry.attributes.aFade.array[n] = 1 - Math.max(0, (b.t - 0.7) / (LIFE - 0.7)) ** 1.5;
      counts[b.kind] = n + 1;
    }
    this.meshes.forEach((mesh, k) => {
      mesh.count = counts[k];
      if (counts[k]) {
        mesh.instanceMatrix.needsUpdate = true;
        mesh.instanceColor.needsUpdate = true;
        mesh.geometry.attributes.aFade.needsUpdate = true;
      }
    });
  }
}
