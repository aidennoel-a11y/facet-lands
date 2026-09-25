import { BufferAttribute, BufferGeometry, CircleGeometry, Color, ConeGeometry, CylinderGeometry, Group, IcosahedronGeometry, InstancedMesh, Matrix4, Mesh, MeshLambertMaterial, MeshPhongMaterial, Quaternion, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { hash2 } from '../../noise/random.js';
import { archSpan, caveRoof } from '../TerrainGenerator.js';

/** A little flat five-armed starfish, base at y = 0, arms reaching out ~1. */
function starfish() {
  const pos = [];
  const R = 1, r = 0.38, H = 0.18;
  for (let k = 0; k < 10; k++) {
    const a0 = (k / 10) * Math.PI * 2, a1 = ((k + 1) / 10) * Math.PI * 2;
    const r0 = k % 2 ? r : R, r1 = k % 2 ? R : r;
    const p0 = [Math.cos(a0) * r0, 0.02, Math.sin(a0) * r0], p1 = [Math.cos(a1) * r1, 0.02, Math.sin(a1) * r1];
    pos.push(0, H, 0, ...p1, ...p0);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.computeVertexNormals();
  return g;
}

/** A sea anemone: a squat stalk crowned with a ring of stubby tentacles. */
function anemone() {
  const parts = [new CylinderGeometry(0.45, 0.55, 0.5, 6).translate(0, 0.25, 0)];
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2;
    const t = new ConeGeometry(0.12, 0.6, 4).translate(0, 0.3, 0);
    t.rotateZ(0.5);
    t.rotateY(-a);
    t.translate(Math.cos(a) * 0.3, 0.45, Math.sin(a) * 0.3);
    parts.push(t);
  }
  return mergeGeometries(parts.map((p) => {
    const g = p.index ? p.toNonIndexed() : p;
    g.deleteAttribute('uv');
    return g;
  }));
}

/** A sea urchin: a ball of spines. */
function urchin() {
  const g = new IcosahedronGeometry(0.5, 0);
  g.deleteAttribute('uv');
  const p = g.attributes.position;
  // Pull each face's middle out into a spike.
  const out = [];
  for (let f = 0; f < p.count; f += 3) {
    const a = [p.getX(f), p.getY(f), p.getZ(f)], b = [p.getX(f + 1), p.getY(f + 1), p.getZ(f + 1)], c = [p.getX(f + 2), p.getY(f + 2), p.getZ(f + 2)];
    const m = [0, 1, 2].map((i) => ((a[i] + b[i] + c[i]) / 3) * 2.1);
    out.push(...a, ...b, ...m, ...b, ...c, ...m, ...c, ...a, ...m);
  }
  const s = new BufferGeometry();
  s.setAttribute('position', new BufferAttribute(new Float32Array(out), 3));
  s.translate(0, 0.35, 0);
  s.computeVertexNormals();
  return s;
}

const CREATURES = [
  { shape: starfish(), size: [0.14, 0.24], colors: [0xe0702a, 0x8a3c9a, 0xc0392b, 0xe8a23a] },
  { shape: anemone(), size: [0.18, 0.3], colors: [0x4caf7a, 0xe06a9a, 0xd8444f, 0x6fcfb0] },
  { shape: urchin(), size: [0.12, 0.2], colors: [0x3a2440, 0x2a2a3a, 0x5a2a4a] },
];

const color = new Color();
const m4 = new Matrix4(), pos = new Vector3(), rot = new Quaternion(), scl = new Vector3(), yAxis = new Vector3(0, 1, 0);

/**
 * The rock of the sea coast that the land's heightmap can't hold, being
 * overhung: the roofs over sea caves (see TerrainGenerator.seaCaves) and
 * the spans of sea arches (seaArches), in the terrain's own material so
 * they weather and take snow with it; and, near you, the water in tide
 * pools on the rock shelves (tidePools), with starfish, anemones and
 * urchins on their floors.
 */
export function createSeaCoastLayer(config, terrainMaterial) {
  const poolMaterial = new MeshPhongMaterial({ color: 0x2f7d8c, specular: 0x557788, shininess: 90, transparent: true, opacity: 0.72, depthWrite: false });
  const creatureMaterial = new MeshLambertMaterial({ flatShading: true });

  return {
    name: 'seaCoast',
    material: terrainMaterial,

    reuseKey: ({ lod }) => (lod > 3 ? 'none' : lod <= 1 ? 'near' : 'far'),

    build({ cx, cz, lod, generator, groundHeightAt }) {
      if (lod > 3 || !generator.seaCaves) return null;
      const size = config.chunkSize, sea = config.seaLevel;
      const x0 = cx * size, z0 = cz * size;
      const P = [], C = [], K = [];
      const vertex = (x, y, z, col, cold) => {
        P.push(x - x0, y, z - z0);
        C.push(col.r, col.g, col.b);
        K.push(cold);
      };
      // A quad a-b-c-d (each [x, y, z, colour, cold]).
      const quad = (a, b, c, d) => {
        for (const v of [a, b, c, a, c, d]) vertex(...v);
      };
      const shade = (x, z, y, up, dark = 1) => {
        const col = new Color();
        generator.surfaceColor(x, z, y, up, col);
        return dark === 1 ? col : col.multiplyScalar(dark);
      };

      // Sea caves: a roof of rock over the inlet, from the cliff's face back
      // to the end of the cave, its top the land's, its underside arched.
      for (const c of generator.seaCaves(x0, z0, x0 + size, z0 + size)) {
        const W = c.w + 1.5;
        const at = (a, b) => [c.x + c.nx * a - c.nz * b, c.z + c.nz * a + c.nx * b];
        const side = (a, s) => generator.getBaseHeight(...at(a, s * W));
        let front = 2;
        for (let a = -3; a <= 6; a += 0.5) {
          if (Math.min(side(a, -1), side(a, 1)) - sea > c.A + 2) {
            front = a;
            break;
          }
        }
        const alongs = [];
        for (let a = front; a < c.d + 1; a += 2) alongs.push(a);
        alongs.push(c.d + 1);
        const across = [-W, -c.w, -0.7 * c.w, -0.35 * c.w, 0, 0.35 * c.w, 0.7 * c.w, c.w, W];
        const rows = alongs.map((a) => {
          const hl = side(a, -1), hr = side(a, 1);
          const deep = Math.min(1, (a - front) / Math.max(1, c.d - front));
          return across.map((b) => {
            const [x, z] = at(a, b);
            const q = (b + W) / (2 * W);
            let top = hl + (hr - hl) * q - 0.1 + 0.2 * (1 - (b / W) ** 2);
            const bottom = Math.abs(b) < c.w ? sea + caveRoof(c, a, b) : sea - 1;
            top = Math.max(top, bottom + 1.5);
            const cold = generator.getSeasonality(x, z);
            return {
              top: [x, top, z, shade(x, z, top, 1), cold],
              bottom: [x, bottom, z, shade(x, z, bottom, 0.1, 0.5 - 0.3 * deep), 0],
            };
          });
        });
        for (let i = 0; i + 1 < rows.length; i++) {
          for (let k = 0; k + 1 < across.length; k++) {
            quad(rows[i][k].top, rows[i][k + 1].top, rows[i + 1][k + 1].top, rows[i + 1][k].top);
            quad(rows[i][k].bottom, rows[i + 1][k].bottom, rows[i + 1][k + 1].bottom, rows[i][k + 1].bottom);
          }
          // The sides, down into the cliff.
          for (const k of [0, across.length - 1]) quad(rows[i][k].bottom, rows[i + 1][k].bottom, rows[i + 1][k].top, rows[i][k].top);
        }
        // The face over the mouth, and the back (in the rock).
        for (const i of [0, rows.length - 1]) {
          for (let k = 0; k + 1 < across.length; k++) {
            const t0 = rows[i][k].top, t1 = rows[i][k + 1].top;
            const b0 = [...rows[i][k].bottom], b1 = [...rows[i][k + 1].bottom];
            b0[3] = shade(b0[0], b0[2], b0[1], 0.1);
            b1[3] = shade(b1[0], b1[2], b1[1], 0.1);
            quad(b0, b1, t1, t0);
          }
        }
      }

      // Sea arches: a bridge of rock from one leg to the other.
      for (const arch of generator.seaArches(x0, z0, x0 + size, z0 + size)) {
        const vx = arch.bx - arch.ax, vz = arch.bz - arch.az, L = Math.hypot(vx, vz);
        const ux = vx / L, uz = vz / L, px = -uz, pz = ux;
        const seed = generator.seed ^ 0xa4c;
        const rings = [];
        for (let k = 0; k <= 14; k++) {
          const t = -0.15 + (1.3 * k) / 14;
          const span = archSpan(arch, Math.min(1, Math.max(0, t)));
          const inside = Math.min(1, Math.max(0, t));
          const hw = arch.leg * (0.78 - 0.18 * Math.sin(Math.PI * inside)) * (t < 0 || t > 1 ? 0.75 : 1);
          const cxw = arch.ax + vx * t, czw = arch.az + vz * t;
          const mid = (span.top + span.bottom) / 2;
          const j = (n) => (hash2(k, n, seed + Math.floor(arch.x)) - 0.5) * 0.6;
          const pts = [
            [-hw, span.top + j(1)], [hw, span.top + j(2)], [hw * 1.08 + j(3), mid], [hw * 0.8, span.bottom + j(4)], [-hw * 0.8, span.bottom + j(5)], [-hw * 1.08 + j(6), mid],
          ];
          const ups = [1, 1, 0.1, -1, -1, 0.1];
          rings.push(pts.map(([o, y], n) => {
            const x = cxw + px * o, z = czw + pz * o;
            return [x, y, z, shade(x, z, y, Math.max(0, ups[n]), ups[n] < 0 ? 0.6 : 1), ups[n] > 0 ? generator.getSeasonality(x, z) : 0];
          }));
        }
        for (let k = 0; k + 1 < rings.length; k++) {
          for (let n = 0; n < 6; n++) {
            const m = (n + 1) % 6;
            quad(rings[k][n], rings[k][m], rings[k + 1][m], rings[k + 1][n]);
          }
        }
        for (const [ring, flip] of [[rings[0], true], [rings[rings.length - 1], false]]) {
          for (let n = 1; n + 1 < 6; n++) {
            const tri = flip ? [ring[0], ring[n + 1], ring[n]] : [ring[0], ring[n], ring[n + 1]];
            for (const v of tri) vertex(...v);
          }
        }
      }

      const group = new Group();
      group.name = 'seaCoast';
      if (P.length) {
        const g = new BufferGeometry();
        g.setAttribute('position', new BufferAttribute(new Float32Array(P), 3));
        g.setAttribute('color', new BufferAttribute(new Float32Array(C), 3));
        g.setAttribute('aCold', new BufferAttribute(new Float32Array(K), 1));
        g.computeVertexNormals();
        g.computeBoundingSphere();
        const mesh = new Mesh(g, terrainMaterial);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.name = 'overhangs';
        group.add(mesh);
      }

      // Tide pools: water to just under the lowest point of each rim.
      if (lod <= 1) {
        const discs = [];
        const placed = CREATURES.map(() => []);
        for (const p of generator.tidePools(x0, z0, x0 + size, z0 + size)) {
          const lx = p.x - x0, lz = p.z - z0;
          const centre = groundHeightAt(lx, lz);
          let rim = Infinity;
          for (let k = 0; k < 12; k++) {
            const a = (k / 12) * Math.PI * 2;
            const qx = lx + Math.cos(a) * p.r * 0.85, qz = lz + Math.sin(a) * p.r * 0.85;
            rim = Math.min(rim, qx >= 0 && qz >= 0 && qx < size && qz < size ? groundHeightAt(qx, qz) : generator.getBaseHeight(qx + x0, qz + z0));
          }
          const level = rim - 0.06;
          if (!(level > sea + 0.2 && centre < level - 0.2)) continue;
          const disc = new CircleGeometry(p.r * 0.85, 10);
          disc.rotateX(-Math.PI / 2);
          disc.translate(lx, level, lz);
          disc.deleteAttribute('uv');
          discs.push(disc);
          const n = 2 + Math.floor(p.seed * 5);
          for (let k = 0; k < n; k++) {
            const h = (q) => hash2(Math.floor(p.x * 7) + k * 31, Math.floor(p.z * 7) - q, 0x7a1);
            const a = h(1) * Math.PI * 2, d = Math.sqrt(h(2)) * p.r * 0.55;
            const qx = lx + Math.cos(a) * d, qz = lz + Math.sin(a) * d;
            const y = groundHeightAt(qx, qz);
            if (!(y < level - 0.08)) continue;
            const kind = Math.floor(h(3) * CREATURES.length);
            const cr = CREATURES[kind];
            const s = cr.size[0] + (cr.size[1] - cr.size[0]) * h(4);
            placed[kind].push([qx, y, qz, s, h(5), cr.colors[Math.floor(h(6) * cr.colors.length)]]);
          }
        }
        if (discs.length) {
          const water = new Mesh(mergeGeometries(discs), poolMaterial);
          water.renderOrder = 2;
          water.name = 'tidePools';
          group.add(water);
          placed.forEach((list, kind) => {
            if (!list.length) return;
            const mesh = new InstancedMesh(CREATURES[kind].shape, creatureMaterial, list.length);
            list.forEach(([x, y, z, s, r, c], n) => {
              pos.set(x, y, z);
              rot.setFromAxisAngle(yAxis, r * Math.PI * 2);
              scl.set(s, s, s);
              mesh.setMatrixAt(n, m4.compose(pos, rot, scl));
              mesh.setColorAt(n, color.setHex(c));
            });
            mesh.computeBoundingSphere();
            mesh.name = 'creatures';
            group.add(mesh);
          });
        }
      }
      return group.children.length ? group : null;
    },

    dispose(group) {
      for (const child of group.children) {
        if (child.name === 'creatures') child.dispose(); // (the shapes are shared)
        else child.geometry.dispose();
      }
    },
  };
}
