import { BufferAttribute, BufferGeometry, InstancedMesh, Matrix4, Mesh, MeshLambertMaterial, PlaneGeometry, Vector3 } from 'three';
import { seasonUniforms } from '../render/Seasons.js';

// A blanket of lying snow over the ground round about you: the land itself
// raised by up to SNOW_DEPTH, white, building up slowly while it snows
// (uSnowDepth) and melting away again in the sun. Coarser than the land
// under it (about half its triangles), so the snow smooths it over: the
// small bumps buried, only rocks and the steep slopes showing through. Not
// on water, not on slopes too steep to hold it, not in the lands without a
// cold winter, and not under your roofs and floors. You walk on the ground
// under it: your feet are down in the snow.
export const SNOW_DEPTH = 0.35;
const CELL = 2.8; // (the land's own triangles are 2 m: these about twice the area)
const N = 80; // cells across: 224 m
const EDGE = 14;
const TRAIL = 700; // (segments of the furrow you leave wading through it)
const tm = new Matrix4(), along = new Vector3(), across = new Vector3(), upward = new Vector3(), scaleV = new Vector3(); // metres of fading out round the edge, into the snow-coloured land beyond

export class SnowBlanket {
  /**
   * `ground(x, z)`: the land's height (NaN at a cave mouth). `cold(x, z)`:
   * how real a winter there is there (0 none .. 1). `wet(x, z)`: water over
   * the ground there. `sheltered(x, z)`: under a roof or a floor.
   */
  constructor(scene, { ground, cold, wet, sheltered }) {
    Object.assign(this, { ground, cold, wet, sheltered });
    const V = N + 1;
    this.base = new Float32Array(V * V); // (the smoothed land under each corner)
    this.cover = new Float32Array(V * V); // (how much snow lies there: 0..1)
    const pos = new Float32Array(V * V * 3), cover = new Float32Array(V * V);
    const idx = new Uint32Array(N * N * 6);
    let k = 0;
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        const a = j * V + i, b = a + 1, c = a + V, d = c + 1;
        // (The diagonal alternating, so the facets don't all run one way.)
        if ((i + j) & 1) idx.set([a, c, b, b, c, d], k);
        else idx.set([a, c, d, a, d, b], k);
        k += 6;
      }
    const g = new BufferGeometry();
    g.setAttribute('position', (this.posAttr = new BufferAttribute(pos, 3)));
    g.setAttribute('aCover', (this.coverAttr = new BufferAttribute(cover, 1)));
    g.setIndex(new BufferAttribute(idx, 1));
    const material = new MeshLambertMaterial({ color: 0xe4eaf0, flatShading: true });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uSnowDepth = seasonUniforms.uSnowDepth;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aCover;\nuniform float uSnowDepth;')
        .replace(
          '#include <begin_vertex>',
          /* glsl */ `#include <begin_vertex>
          {
            // Up off the land by its depth here; where there's next to none, tucked away under the land.
            float d = uSnowDepth * aCover;
            transformed.y += mix(-0.6, ${SNOW_DEPTH.toFixed(3)} * d, smoothstep(0.02, 0.12, d));
          }`,
        );
    };
    material.customProgramCacheKey = () => 'snow-blanket';
    this.mesh = new Mesh(g, material);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.ox = Infinity;
    this.oz = Infinity;
    this.row = 0;
  }

  /**
   * The way you've waded through it: a soft, shadowed furrow along the top
   * of the snow where your legs pushed it aside (fainter than the prints in
   * it), segment by segment behind you; filled in again by the snow as it
   * falls, and gone with it when it melts.
   */
  wade(x, z, ground) {
    if (!this.trail) {
      const g = new PlaneGeometry(1, 1);
      g.rotateX(-Math.PI / 2);
      const mat = new MeshLambertMaterial({ color: 0xb4c0d2, transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
      this.trail = new InstancedMesh(g, mat, TRAIL);
      this.trail.count = 0;
      this.trail.frustumCulled = false;
      this.trail.receiveShadow = true;
      this.mesh.parent.add(this.trail);
      this.trailAt = null;
      this.trailNext = 0;
    }
    const top = (px, pz) => ground(px, pz) + this.depthAt(px, pz);
    const d = this.depthAt(x, z);
    if (d < 0.08) return void (this.trailAt = null);
    if (!this.trailAt) return void (this.trailAt = { x, z });
    const dx = x - this.trailAt.x, dz = z - this.trailAt.z, len = Math.hypot(dx, dz);
    if (len < 0.45) return;
    if (len > 3) return void (this.trailAt = { x, z });
    const y0 = top(this.trailAt.x, this.trailAt.z), y1 = top(x, z);
    if (!Number.isFinite(y0) || !Number.isFinite(y1)) return void (this.trailAt = { x, z });
    // (Along the step, square across it, lying on the slope of the snow.)
    along.set(dx, y1 - y0, dz).normalize();
    across.set(dz, 0, -dx).normalize();
    upward.crossVectors(along, across).normalize();
    if (upward.y < 0) upward.negate(), across.negate();
    tm.makeBasis(across, upward, along).scale(scaleV.set(0.62 + Math.random() * 0.08, 1, len + 0.12));
    tm.setPosition((x + this.trailAt.x) / 2, (y0 + y1) / 2 + 0.02, (z + this.trailAt.z) / 2);
    this.trail.setMatrixAt(this.trailNext, tm);
    this.trailNext = (this.trailNext + 1) % TRAIL;
    this.trail.count = Math.min(TRAIL, this.trail.count + 1);
    this.trail.instanceMatrix.needsUpdate = true;
    this.trailAt = { x, z };
  }

  /** Follows you; a few rows of it worked out again each frame (the land loading in, a roof going up). */
  update(x, z) {
    const on = seasonUniforms.uSnowDepth.value > 0.01;
    this.mesh.visible = on;
    if (this.trail) {
      // (The furrows fill in as it snows, and go when it's melted.)
      this.trail.visible = seasonUniforms.uSnowDepth.value > 0.08;
      this.trail.material.opacity = 0.5 * Math.min(1, (seasonUniforms.uSnowDepth.value - 0.08) * 4);
      if (!this.trail.visible) this.trail.count = 0;
    }
    if (!on) return;
    const ox = Math.round(x / CELL) * CELL - (N / 2) * CELL, oz = Math.round(z / CELL) * CELL - (N / 2) * CELL;
    if (Math.abs(ox - this.ox) > CELL * 6 || Math.abs(oz - this.oz) > CELL * 6) {
      this.ox = ox;
      this.oz = oz;
      for (let j = 0; j <= N; j++) this.#row(j);
      this.posAttr.needsUpdate = this.coverAttr.needsUpdate = true;
      return;
    }
    for (let n = 0; n < 4; n++) {
      this.#row(this.row);
      this.row = (this.row + 1) % (N + 1);
    }
    this.posAttr.needsUpdate = this.coverAttr.needsUpdate = true;
  }

  #row(j) {
    const V = N + 1, pos = this.posAttr.array, cov = this.coverAttr.array, h = CELL / 2;
    const z = this.oz + j * CELL;
    for (let i = 0; i <= N; i++) {
      const x = this.ox + i * CELL, k = j * V + i;
      // The land there, smoothed over: never under it, the hollows between filled a little.
      const c = this.ground(x, z);
      const e = this.ground(x + h, z), w = this.ground(x - h, z), n = this.ground(x, z - h), s = this.ground(x, z + h);
      let cover = 0, y = c;
      if (Number.isFinite(c) && Number.isFinite(e) && Number.isFinite(w) && Number.isFinite(n) && Number.isFinite(s)) {
        y = Math.max(c, (c * 2 + e + w + n + s) / 6);
        // (Steep: it slides off. Water, shelter, the warm lands: none.)
        const slope = Math.max(Math.abs(e - w), Math.abs(s - n)) / CELL;
        cover = (1 - smooth(0.55, 0.95, slope)) * this.cold(x, z);
        if (cover > 0 && (this.wet(x, z) || this.sheltered(x, z))) cover = 0;
      } else if (!Number.isFinite(c)) y = Number.isFinite(e) ? e : 0;
      // (Fading out round the edge.)
      const edge = Math.min(i, N - i, j, N - j) * CELL;
      cover *= smooth(0, EDGE, edge);
      pos[k * 3] = x;
      pos[k * 3 + 1] = y;
      pos[k * 3 + 2] = z;
      cov[k] = cover;
      this.base[k] = y;
      this.cover[k] = cover;
    }
  }

  /**
   * How high the snow lies over the land at (x, z) (0 where there's none, or
   * it's off the blanket): its surface just as it's drawn, facet by facet, so
   * a footprint lies right on it, neither floating over it nor sunk under it.
   */
  depthAt(x, z) {
    const d = seasonUniforms.uSnowDepth.value;
    if (d < 0.01 || !Number.isFinite(this.ox)) return 0;
    const fi = (x - this.ox) / CELL, fj = (z - this.oz) / CELL;
    if (fi < 0 || fj < 0 || fi >= N || fj >= N) return 0;
    const i = Math.floor(fi), j = Math.floor(fj), u = fi - i, v = fj - j, V = N + 1, k = j * V + i;
    // (Each corner as the vertex shader raises it.)
    const at = (q) => {
      const dd = d * this.cover[q];
      return this.base[q] + (-0.6 + (SNOW_DEPTH * dd + 0.6) * smooth(0.02, 0.12, dd));
    };
    const a = at(k), b = at(k + 1), c = at(k + V), e = at(k + V + 1);
    // (The cell's two triangles, its diagonal running as the mesh's does.)
    let top;
    if ((i + j) & 1) top = u + v <= 1 ? a + (b - a) * u + (c - a) * v : e + (c - e) * (1 - u) + (b - e) * (1 - v);
    else top = v >= u ? a + (e - c) * u + (c - a) * v : a + (b - a) * u + (e - b) * v;
    const g = this.ground(x, z);
    return Number.isFinite(g) ? Math.max(0, top - g) : 0;
  }
}

function smooth(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
