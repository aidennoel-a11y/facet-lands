import { BoxGeometry, BufferAttribute, Color } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const tint = new Color();

/**
 * Builds a low-poly model out of coloured blocks: box(w, h, d, colour,
 * position, rotation), each face keeping its block's colour (a touch darker
 * underneath), merged into one flat-shaded geometry.
 */
class Blocks {
  constructor() {
    this.parts = [];
  }

  box(w, h, d, color, [x, y, z] = [0, 0, 0], [rx, ry, rz] = [0, 0, 0]) {
    const g = new BoxGeometry(w, h, d).toNonIndexed();
    g.deleteAttribute('uv');
    g.deleteAttribute('normal');
    if (rx) g.rotateX(rx);
    if (ry) g.rotateY(ry);
    if (rz) g.rotateZ(rz);
    g.translate(x, y, z);
    const pos = g.attributes.position;
    const col = new Float32Array(pos.count * 3);
    for (let k = 0; k < pos.count; k += 3) {
      // (Faces lower down the block a shade darker.)
      const low = (pos.getY(k) + pos.getY(k + 1) + pos.getY(k + 2)) / 3 < y - h * 0.3 ? 0.85 : 1;
      tint.set(color).multiplyScalar(low);
      for (let v = 0; v < 3; v++) col.set([tint.r, tint.g, tint.b], (k + v) * 3);
    }
    g.setAttribute('color', new BufferAttribute(col, 3));
    this.parts.push(g);
    return this;
  }

  build() {
    const g = mergeGeometries(this.parts);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

// --- Four-legged animals ----------------------------------------------------
// Standing on the ground at y = 0, facing +z. Parts: body; head (turned
// about its pivot to graze or look up); optional antlers (on the head's
// pivot); legs (one geometry, hanging from its hip pivot, drawn four times).

export function deer() {
  const coat = 0x9c6b3f, belly = 0xdcc6a2, dark = 0x3a2a1e, white = 0xf2ece0;
  return {
    body: new Blocks()
      .box(0.44, 0.5, 1.25, coat, [0, 1.02, 0])
      .box(0.36, 0.1, 1.0, belly, [0, 0.76, 0])
      .box(0.34, 0.3, 0.12, white, [0, 1.0, -0.64]) // the white rump
      .box(0.12, 0.2, 0.08, white, [0, 1.16, -0.7], [0.5, 0, 0]) // tail, up
      .build(),
    headPivot: [0, 1.18, 0.52],
    head: new Blocks()
      .box(0.2, 0.6, 0.24, coat, [0, 0.26, 0.1], [-0.45, 0, 0]) // neck
      .box(0.22, 0.22, 0.42, coat, [0, 0.56, 0.3]) // head
      .box(0.14, 0.12, 0.14, dark, [0, 0.52, 0.52]) // muzzle
      .box(0.05, 0.16, 0.1, coat, [0.13, 0.7, 0.18], [0, 0, -0.6]) // ears
      .box(0.05, 0.16, 0.1, coat, [-0.13, 0.7, 0.18], [0, 0, 0.6])
      .build(),
    antlers: new Blocks()
      .box(0.04, 0.34, 0.04, 0xcbb690, [0.1, 0.84, 0.22], [0, 0, -0.3])
      .box(0.04, 0.34, 0.04, 0xcbb690, [-0.1, 0.84, 0.22], [0, 0, 0.3])
      .box(0.04, 0.2, 0.04, 0xcbb690, [0.2, 1.0, 0.3], [0.6, 0, -0.5])
      .box(0.04, 0.2, 0.04, 0xcbb690, [-0.2, 1.0, 0.3], [0.6, 0, 0.5])
      .box(0.04, 0.18, 0.04, 0xcbb690, [0.15, 0.98, 0.12], [-0.5, 0, -0.2])
      .box(0.04, 0.18, 0.04, 0xcbb690, [-0.15, 0.98, 0.12], [-0.5, 0, 0.2])
      .build(),
    leg: new Blocks().box(0.1, 0.82, 0.11, coat, [0, -0.41, 0]).box(0.11, 0.08, 0.13, dark, [0, -0.8, 0.01]).build(),
    legs: [[0.14, 0.84, 0.48], [-0.14, 0.84, 0.48], [0.14, 0.84, -0.5], [-0.14, 0.84, -0.5]],
  };
}

export function bison() {
  const coat = 0x5a3c26, shag = 0x3e2a1a, dark = 0x241810, horn = 0x2a2420;
  return {
    body: new Blocks()
      .box(0.95, 1.0, 1.8, coat, [0, 1.12, -0.25])
      .box(1.15, 1.25, 0.9, shag, [0, 1.25, 0.55]) // the shaggy fore-quarters
      .box(0.9, 0.55, 0.8, shag, [0, 1.95, 0.4]) // the hump
      .box(0.1, 0.5, 0.1, dark, [0, 1.25, -1.2], [0.3, 0, 0]) // tail
      .build(),
    headPivot: [0, 1.35, 0.95],
    head: new Blocks()
      .box(0.62, 0.66, 0.62, shag, [0, -0.1, 0.3])
      .box(0.5, 0.4, 0.3, dark, [0, -0.3, 0.62]) // muzzle
      .box(0.34, 0.4, 0.2, shag, [0, -0.55, 0.3]) // beard
      .box(0.1, 0.1, 0.24, horn, [0.36, 0.16, 0.34], [0, 0.4, 0])
      .box(0.1, 0.1, 0.24, horn, [-0.36, 0.16, 0.34], [0, -0.4, 0])
      .build(),
    antlers: null,
    leg: new Blocks().box(0.22, 0.74, 0.24, coat, [0, -0.37, 0]).box(0.24, 0.1, 0.26, dark, [0, -0.72, 0.01]).build(),
    legs: [[0.3, 0.74, 0.55], [-0.3, 0.74, 0.55], [0.3, 0.74, -0.85], [-0.3, 0.74, -0.85]],
  };
}

export function rabbit() {
  const fur = 0x8f7f6a, pale = 0xe8e0d2, dark = 0x3a302a;
  return {
    body: new Blocks()
      .box(0.2, 0.2, 0.32, fur, [0, 0.2, 0])
      .box(0.1, 0.1, 0.08, pale, [0, 0.24, -0.18]) // tail
      .build(),
    headPivot: [0, 0.26, 0.14],
    head: new Blocks()
      .box(0.14, 0.13, 0.16, fur, [0, 0.03, 0.06])
      .box(0.04, 0.04, 0.03, dark, [0, 0.02, 0.15])
      .box(0.04, 0.18, 0.03, fur, [0.04, 0.16, 0.02], [-0.25, 0, -0.1])
      .box(0.04, 0.18, 0.03, fur, [-0.04, 0.16, 0.02], [-0.25, 0, 0.1])
      .build(),
    antlers: null,
    leg: new Blocks().box(0.05, 0.12, 0.07, fur, [0, -0.06, 0]).build(),
    legs: [[0.06, 0.12, 0.1], [-0.06, 0.12, 0.1], [0.08, 0.12, -0.1], [-0.08, 0.12, -0.1]],
  };
}

// --- Birds ------------------------------------------------------------------
// About 0.3 m long at scale 1 (each kind drawn at its own scale), centred on
// the body, facing +z. Wings hinge at the shoulders (flapped and folded).

function bird({ body, belly = body, head = body, beak = 0x3a2e22, wing = body, tip = wing, tail = body }) {
  const wingOf = (side) => new Blocks()
    .box(0.18, 0.02, 0.14, wing, [side * 0.09, 0, 0])
    .box(0.18, 0.018, 0.1, tip, [side * 0.26, 0, -0.02])
    .build();
  return {
    body: new Blocks()
      .box(0.11, 0.1, 0.24, body, [0, 0, 0])
      .box(0.09, 0.04, 0.18, belly, [0, -0.045, 0.01])
      .box(0.09, 0.09, 0.09, head, [0, 0.05, 0.15])
      .box(0.03, 0.03, 0.06, beak, [0, 0.04, 0.22])
      .box(0.08, 0.015, 0.12, tail, [0, 0.01, -0.17])
      .build(),
    wingL: wingOf(1),
    wingR: wingOf(-1),
  };
}

export const songbird = () => bird({ body: 0xd8d0c4, belly: 0xf0ece4, head: 0xd0c8bc, wing: 0xb8b0a4, tip: 0x8a8278 }); // (tinted bird by bird)
export const starling = () => bird({ body: 0x2c2a34, belly: 0x3a3844, head: 0x24222c, beak: 0xd8b040, wing: 0x26242e });
export const crow = () => bird({ body: 0x18181c, head: 0x121216, beak: 0x0c0c0e, wing: 0x1a1a20, tip: 0x101014 });
export const gull = () => bird({ body: 0xf2f2f0, belly: 0xffffff, head: 0xf8f8f6, beak: 0xe8c040, wing: 0xb8c0c8, tip: 0x2a2a2e, tail: 0xf2f2f0 });
export const hawk = () => bird({ body: 0x6e4a2c, belly: 0xd8c8a8, head: 0x5a3a22, beak: 0x2a2a2a, wing: 0x7a5434, tip: 0x3a2a1e, tail: 0x9a5a34 });

// --- Insects and hives -------------------------------------------------------

/** A bee: little yellow and black blocks, with two pale wings. */
export const bee = () => new Blocks()
  .box(0.05, 0.05, 0.03, 0xf2c028, [0, 0, 0.04])
  .box(0.05, 0.05, 0.03, 0x1e1a14, [0, 0, 0.01])
  .box(0.05, 0.05, 0.03, 0xf2c028, [0, 0, -0.02])
  .box(0.04, 0.04, 0.02, 0x1e1a14, [0, 0, -0.045])
  .box(0.05, 0.005, 0.04, 0xe8f0f4, [0.04, 0.03, 0.01], [0, 0, 0.3])
  .box(0.05, 0.005, 0.04, 0xe8f0f4, [-0.04, 0.03, 0.01], [0, 0, -0.3])
  .build();

/** A firefly's light: a tiny block. */
export const firefly = () => new Blocks().box(0.05, 0.05, 0.07, 0xffffff).build();

/**
 * A wild bees' nest hanging under a bough: tiers of waxy comb, widest at
 * the top, from a dark twig, the entrance a dark slot low on one side.
 * (Its top at y = 0.)
 */
export const hive = () => new Blocks()
  .box(0.08, 0.3, 0.08, 0x4a3624, [0, 0.1, 0])
  .box(0.46, 0.13, 0.46, 0xc8923a, [0, -0.06, 0])
  .box(0.52, 0.14, 0.52, 0xd6a044, [0, -0.19, 0])
  .box(0.48, 0.14, 0.48, 0xc8923a, [0, -0.33, 0])
  .box(0.4, 0.13, 0.4, 0xd6a044, [0, -0.46, 0])
  .box(0.28, 0.11, 0.28, 0xc08a34, [0, -0.58, 0])
  .box(0.16, 0.06, 0.06, 0x2a1c10, [0, -0.4, 0.22])
  .build();
