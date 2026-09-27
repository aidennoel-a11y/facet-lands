import { BoxGeometry, BufferAttribute, BufferGeometry, CircleGeometry, Color, ConeGeometry, CylinderGeometry, Group, IcosahedronGeometry, InstancedBufferAttribute, InstancedMesh, Matrix4, Mesh, MeshLambertMaterial, MeshPhongMaterial, Quaternion, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { hash2 } from '../../noise/random.js';
import { caveRoof, mesaArchAt } from '../TerrainGenerator.js';

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
  const poolMaterial = new MeshPhongMaterial({ color: 0x1f6f7c, specular: 0x88aabb, shininess: 120, transparent: true, opacity: 0.62, depthWrite: false });
  const creatureMaterial = new MeshLambertMaterial({ flatShading: true });

  // Surf: as each wave comes in, it bursts against the foot of the cliffs
  // and over the rock ledges (and their tide pools), throwing up spray:
  // blocks of white water flung up the rock, falling back. Each spot's burst
  // comes when the wave reaches it, so they run along the coast. (All worked
  // out on the GPU from the time.)
  const time = { value: 0 };
  const surfMaterial = new MeshLambertMaterial({ color: 0xf2f8fa, emissive: 0x506a72 });
  surfMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nattribute vec3 aStart;\nattribute vec3 aVelocity;\nattribute vec4 aLife;')
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `// aLife: x = the waves' period (s), y = when this spot's comes (0..1 of it), z = size, w = delay within the burst.
        float age = mod(uTime - (aLife.y * aLife.x + aLife.w), aLife.x);
        float fly = 2.0 * aVelocity.y / 9.8;
        float k = age / fly;
        float spin = aLife.y * 50.0 + age * 4.0;
        vec3 p = position;
        p.xz = mat2(cos(spin), sin(spin), -sin(spin), cos(spin)) * p.xz;
        vec3 transformed = p * aLife.z * (1.0 - k * k) * step(age, fly) + aStart + aVelocity * age + vec3(0.0, -4.9 * age * age, 0.0);`,
      );
  };
  surfMaterial.customProgramCacheKey = () => 'surf';
  const block = new BoxGeometry(1, 1, 1);

  // Where the waves meet rock in this chunk: the foot of the cliffs, the
  // edges of the ledges; each with the way out to sea and how much of a
  // cliff there is.
  function surfSpots(generator, x0, z0, size, sea) {
    const spots = [];
    const S = 6;
    for (let j = 0; j < size / S; j++) {
      for (let i = 0; i < size / S; i++) {
        const x = x0 + (i + 0.5) * S, z = z0 + (j + 0.5) * S;
        const h = generator.getBaseHeight(x, z);
        if (h < sea - 0.4 || h > sea + 3.5) continue;
        let out = null;
        for (let k = 0; k < 8 && !out; k++) {
          const a = (k / 8) * Math.PI * 2;
          if (generator.getBaseHeight(x + Math.cos(a) * 5, z + Math.sin(a) * 5) < sea - 1) out = [Math.cos(a), Math.sin(a)];
        }
        if (!out || generator.getOceanness(x, z) < 0.5) continue;
        const rock = Math.max(generator.getSeaCliff(x, z), 0.3);
        if (hash2(Math.floor(x), Math.floor(z), 0x5a1f) > 0.35 + 0.5 * rock) continue;
        spots.push({ x, z, out, rock });
      }
    }
    return spots;
  }

  function surf(spots, x0, z0, sea) {
    const starts = [], velocities = [], lives = [];
    for (const s of spots) {
      let seed = Math.floor(s.x * 13 + s.z * 7) >>> 0;
      const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
      const period = 7.5;
      const when = ((s.x * 0.8 + s.z * 0.45) / 55) % 1; // (the wave rolling along the coast)
      const n = Math.round(8 + 10 * s.rock);
      for (let k = 0; k < n; k++) {
        const along = (rand() - 0.5) * 5;
        starts.push(s.x - x0 - s.out[1] * along + s.out[0] * 0.8, sea + 0.2, s.z - z0 + s.out[0] * along + s.out[1] * 0.8);
        const up = (3 + rand() * 4) * (0.6 + 0.8 * s.rock);
        const back = 0.8 + rand() * 2.2; // (thrown up the rock face, landward)
        velocities.push(-s.out[0] * back + (rand() - 0.5) * 1.5, up, -s.out[1] * back + (rand() - 0.5) * 1.5);
        lives.push(period, ((when % 1) + 1) % 1, 0.25 + rand() * 0.35, rand() * 0.5);
      }
    }
    if (!starts.length) return null;
    const geometry = block.clone();
    geometry.setAttribute('aStart', new InstancedBufferAttribute(new Float32Array(starts), 3));
    geometry.setAttribute('aVelocity', new InstancedBufferAttribute(new Float32Array(velocities), 3));
    geometry.setAttribute('aLife', new InstancedBufferAttribute(new Float32Array(lives), 4));
    const mesh = new InstancedMesh(geometry, surfMaterial, starts.length / 3);
    mesh.frustumCulled = false; // (it moves on the GPU)
    mesh.name = 'surf';
    return mesh;
  }

  return {
    name: 'seaCoast',
    material: terrainMaterial,

    update(t) {
      time.value = t;
    },

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
        // The face over the mouth (bare rock like the cliff's, in a few
        // knobbled bands), and the back (in the rock).
        for (const i of [0, rows.length - 1]) {
          const bands = i === 0 ? 3 : 1;
          const ring = (k, f) => {
            const t = rows[i][k].top, b = rows[i][k].bottom;
            const y = b[1] + (t[1] - b[1]) * f;
            const out = i === 0 && f > 0 && f < 1 ? 0.5 * (hash2(k, Math.round(f * 10), Math.floor(c.x)) - 0.3) : 0;
            const x = b[0] - c.nx * out, z = b[2] - c.nz * out;
            return [x, y, z, shade(x, z, y, f >= 1 ? 0.55 : 0.1), f >= 1 ? t[4] : 0];
          };
          for (let k = 0; k + 1 < across.length; k++) {
            for (let n = 0; n < bands; n++) quad(ring(k, n / bands), ring(k + 1, n / bands), ring(k + 1, (n + 1) / bands), ring(k, (n + 1) / bands));
          }
        }
      }

      // Arches, in the mesas and out in the sea: one band of rock bowed over
      // from foot to foot (see mesaArchAt), lumpy all round.
      for (const arch of [...generator.seaArches(x0, z0, x0 + size, z0 + size), ...(generator.mesaArches?.(x0, z0, x0 + size, z0 + size) ?? [])]) {
        const K = 30, M = 10;
        const rings = [];
        for (let k = 0; k <= K; k++) {
          const b = mesaArchAt(arch, (k / K) * Math.PI);
          const ring = [];
          for (let n = 0; n < M; n++) {
            const f = (n / M) * Math.PI * 2;
            const lump = 1 + 0.22 * (hash2(k, n, arch.seed) - 0.5) + 0.1 * Math.sin(k * 0.9 + n * 2.1 + arch.seed);
            const cn = Math.cos(f) * b.th * lump, cs = Math.sin(f) * b.wd * lump;
            const dx = b.n[0] * cn + b.side[0] * cs, dy = b.n[1] * cn, dz = b.n[2] * cn + b.side[2] * cs;
            const x = b.x + dx, y = b.y + dy, z = b.z + dz;
            const up = dy / (Math.hypot(dx, dy, dz) || 1);
            ring.push([x, y, z, shade(x, z, y, Math.max(0, up), up < -0.3 ? 0.7 : 1), up > 0.5 ? generator.getSeasonality(x, z) : 0]);
          }
          rings.push(ring);
        }
        for (let k = 0; k < K; k++) {
          for (let n = 0; n < M; n++) {
            const m = (n + 1) % M;
            quad(rings[k][n], rings[k][m], rings[k + 1][m], rings[k + 1][n]);
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
          for (let k = 0; k < 24; k++) {
            const a = (k / 12) * Math.PI * 2, d = p.r * (k < 12 ? 0.72 : 0.9);
            const qx = lx + Math.cos(a) * d, qz = lz + Math.sin(a) * d;
            rim = Math.min(rim, qx >= 0 && qz >= 0 && qx < size && qz < size ? groundHeightAt(qx, qz) : generator.getBaseHeight(qx + x0, qz + z0));
          }
          const level = rim - 0.06;
          if (!(level > sea + 0.2 && centre < level - 0.2)) continue;
          const disc = new CircleGeometry(p.r * 0.72, 12);
          disc.rotateX(-Math.PI / 2);
          disc.translate(lx, level, lz);
          disc.deleteAttribute('uv');
          discs.push(disc);
          const n = 2 + Math.floor(p.seed * 5);
          for (let k = 0; k < n; k++) {
            const h = (q) => hash2(Math.floor(p.x * 7) + k * 31, Math.floor(p.z * 7) - q, 0x7a1);
            const a = h(1) * Math.PI * 2, d = Math.sqrt(h(2)) * p.r * 0.5;
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
      // The surf, near you.
      const seaside = [[0.5, 0.5], [0, 0], [1, 0], [0, 1], [1, 1]].some(([u, v]) => generator.getBaseHeight(x0 + u * size, z0 + v * size) < sea - 0.5);
      if (lod <= 1 && seaside) {
        const mesh = surf(surfSpots(generator, x0, z0, size, sea), x0, z0, sea);
        if (mesh) group.add(mesh);
      }
      return group.children.length ? group : null;
    },

    dispose(group) {
      for (const child of group.children) {
        if (child.name === 'creatures') child.dispose(); // (the shapes are shared)
        else if (child.name === 'surf') (child.geometry.dispose(), child.dispose());
        else child.geometry.dispose();
      }
    },
  };
}
