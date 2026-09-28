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

  // (`taper`: [x, z] scale of the box's top face, for rounder, less boxy shapes.)
  box(w, h, d, color, [x, y, z] = [0, 0, 0], [rx, ry, rz] = [0, 0, 0], taper = null) {
    const g = new BoxGeometry(w, h, d).toNonIndexed();
    g.deleteAttribute('uv');
    g.deleteAttribute('normal');
    if (taper) {
      const p = g.attributes.position;
      for (let k = 0; k < p.count; k++) if (p.getY(k) > 0) p.setXYZ(k, p.getX(k) * taper[0], p.getY(k), p.getZ(k) * taper[1]);
    }
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
  const coat = 0x9c6b3f, back = 0x86592f, belly = 0xdcc6a2, dark = 0x2e221a, white = 0xf2ece0, nose = 0x1c1612;
  return {
    body: new Blocks()
      .box(0.42, 0.5, 0.62, coat, [0, 1.04, 0.28], [0, 0, 0], [0.9, 0.95]) // chest and shoulders
      .box(0.4, 0.44, 0.56, coat, [0, 1.05, -0.24], [0, 0, 0], [0.92, 1]) // barrel
      .box(0.42, 0.5, 0.36, coat, [0, 1.07, -0.6], [0, 0, 0], [0.85, 0.9]) // haunches
      .box(0.3, 0.08, 1.2, back, [0, 1.3, -0.1]) // the darker line of the back
      .box(0.34, 0.1, 1.0, belly, [0, 0.8, -0.05], [0, 0, 0], [1.1, 1]) // belly
      .box(0.3, 0.32, 0.1, white, [0, 1.02, -0.79]) // the white rump
      .box(0.12, 0.22, 0.07, white, [0, 1.18, -0.84], [0.45, 0, 0]) // tail, up
      .box(0.1, 0.18, 0.06, coat, [0, 1.2, -0.82], [0.45, 0, 0])
      .box(0.24, 0.2, 0.12, belly, [0, 1.0, 0.6]) // pale throat
      .build(),
    headPivot: [0, 1.2, 0.52],
    head: new Blocks()
      .box(0.26, 0.3, 0.32, coat, [0, 0.02, -0.02], [0.2, 0, 0], [0.9, 0.9]) // the base of the neck, into the shoulders
      .box(0.2, 0.5, 0.22, coat, [0, 0.3, 0.1], [0.45, 0, 0], [0.8, 0.85]) // neck, leaning forward up to the head
      .box(0.14, 0.36, 0.08, belly, [0, 0.24, 0.2], [0.45, 0, 0]) // pale throat
      .box(0.22, 0.2, 0.26, coat, [0, 0.58, 0.22]) // skull
      .box(0.16, 0.16, 0.22, coat, [0, 0.54, 0.44], [0, 0, 0], [0.85, 1]) // face
      .box(0.12, 0.09, 0.08, nose, [0, 0.52, 0.56]) // nose
      .box(0.03, 0.04, 0.04, 0x0e0a08, [0.11, 0.62, 0.32]) // eyes
      .box(0.03, 0.04, 0.04, 0x0e0a08, [-0.11, 0.62, 0.32])
      .box(0.05, 0.2, 0.12, coat, [0.15, 0.74, 0.16], [0, 0.3, -0.7], [0.6, 0.6]) // ears
      .box(0.05, 0.2, 0.12, coat, [-0.15, 0.74, 0.16], [0, -0.3, 0.7], [0.6, 0.6])
      .box(0.02, 0.14, 0.08, 0xe8c8b0, [0.17, 0.74, 0.18], [0, 0.3, -0.7])
      .box(0.02, 0.14, 0.08, 0xe8c8b0, [-0.17, 0.74, 0.18], [0, -0.3, 0.7])
      .build(),
    antlers: (() => {
      const b = new Blocks(), bone = 0xcbb690;
      for (const side of [1, -1]) {
        b.box(0.04, 0.3, 0.04, bone, [side * 0.1, 0.82, 0.22], [0, 0, -side * 0.35]); // beam
        b.box(0.035, 0.28, 0.035, bone, [side * 0.2, 1.02, 0.16], [-0.4, 0, -side * 0.2]);
        b.box(0.03, 0.2, 0.03, bone, [side * 0.24, 1.18, 0.1], [-0.6, 0, -side * 0.1]);
        b.box(0.03, 0.16, 0.03, bone, [side * 0.17, 1.0, 0.3], [0.7, 0, -side * 0.2]); // tines
        b.box(0.03, 0.14, 0.03, bone, [side * 0.26, 1.12, 0.24], [0.6, 0, -side * 0.3]);
        b.box(0.03, 0.12, 0.03, bone, [side * 0.22, 1.28, 0.06], [0.2, 0, -side * 0.3]);
      }
      return b.build();
    })(),
    // A leg: the thick upper leg, a knee bent back, the slender shank, the hoof.
    leg: new Blocks()
      .box(0.13, 0.4, 0.16, coat, [0, -0.2, 0], [0, 0, 0], [1.2, 1.2])
      .box(0.08, 0.2, 0.09, coat, [0, -0.48, -0.03], [0.25, 0, 0])
      .box(0.06, 0.26, 0.07, coat, [0, -0.7, 0])
      .box(0.08, 0.07, 0.1, dark, [0, -0.84, 0.01])
      .build(),
    legs: [[0.13, 0.87, 0.46], [-0.13, 0.87, 0.46], [0.14, 0.87, -0.58], [-0.14, 0.87, -0.58]],
  };
}

export function bison() {
  const coat = 0x5e4028, shag = 0x3e2a1a, mane = 0x33231a, dark = 0x1e140e, horn = 0x2a2420, nose = 0x16100c;
  return {
    body: new Blocks()
      .box(0.86, 0.9, 1.1, coat, [0, 1.12, -0.62], [0, 0, 0], [0.9, 0.95]) // hindquarters
      .box(0.96, 1.05, 0.7, coat, [0, 1.2, -0.02], [0, 0, 0], [0.92, 1]) // barrel
      .box(1.16, 1.28, 0.7, shag, [0, 1.3, 0.5], [0, 0, 0], [0.9, 0.95]) // shaggy shoulders
      .box(1.02, 0.6, 0.86, mane, [0, 1.92, 0.36], [0, 0, 0], [0.7, 0.75]) // the hump
      .box(0.7, 0.34, 0.6, mane, [0, 2.3, 0.32], [0, 0, 0], [0.6, 0.7])
      .box(0.8, 0.3, 0.6, shag, [0, 1.62, -0.35], [0, 0, 0], [0.8, 0.9]) // back falling to the rump
      .box(1.2, 0.5, 0.5, mane, [0, 0.72, 0.52], [0, 0, 0], [1.1, 1.05]) // the long hair hanging from the chest
      .box(0.9, 0.22, 0.4, mane, [0, 0.46, 0.56], [0, 0, 0], [0.8, 0.9])
      .box(0.72, 0.16, 1.2, dark, [0, 0.66, -0.35]) // belly
      .box(0.08, 0.5, 0.08, dark, [0, 1.22, -1.2], [0.2, 0, 0]) // tail
      .box(0.14, 0.2, 0.12, mane, [0, 0.95, -1.25]) // its tuft
      .build(),
    headPivot: [0, 1.4, 0.92],
    head: new Blocks()
      .box(0.64, 0.6, 0.54, shag, [0, -0.08, 0.26], [0, 0, 0], [0.9, 0.9]) // skull
      .box(0.76, 0.38, 0.42, mane, [0, 0.22, 0.18], [0, 0, 0], [0.8, 0.8]) // the woolly brow
      .box(0.46, 0.4, 0.34, coat, [0, -0.3, 0.54], [0, 0, 0], [0.9, 1]) // muzzle
      .box(0.36, 0.14, 0.06, nose, [0, -0.26, 0.72]) // nose
      .box(0.38, 0.48, 0.26, mane, [0, -0.6, 0.34], [0, 0, 0], [1.2, 1.1]) // beard
      .box(0.05, 0.06, 0.05, 0x0a0806, [0.3, -0.02, 0.44]) // eyes
      .box(0.05, 0.06, 0.05, 0x0a0806, [-0.3, -0.02, 0.44])
      .box(0.12, 0.08, 0.12, shag, [0.38, 0.08, 0.2]) // ears
      .box(0.12, 0.08, 0.12, shag, [-0.38, 0.08, 0.2])
      .box(0.1, 0.09, 0.2, horn, [0.4, 0.2, 0.3], [0, 0.5, 0]) // horns: out, then up and in
      .box(0.08, 0.16, 0.08, horn, [0.49, 0.3, 0.36], [0, 0, 0.35])
      .box(0.1, 0.09, 0.2, horn, [-0.4, 0.2, 0.3], [0, -0.5, 0])
      .box(0.08, 0.16, 0.08, horn, [-0.49, 0.3, 0.36], [0, 0, -0.35])
      .build(),
    antlers: null,
    leg: new Blocks()
      .box(0.3, 0.4, 0.34, shag, [0, -0.18, 0], [0, 0, 0], [1.15, 1.1]) // shaggy upper leg
      .box(0.2, 0.3, 0.22, coat, [0, -0.48, 0])
      .box(0.17, 0.12, 0.2, coat, [0, -0.66, 0.01])
      .box(0.22, 0.08, 0.26, dark, [0, -0.73, 0.02]) // hoof
      .build(),
    legs: [[0.3, 0.76, 0.5], [-0.3, 0.76, 0.5], [0.28, 0.76, -0.88], [-0.28, 0.76, -0.88]],
  };
}

export function rabbit() {
  const fur = 0x8f7f6a, pale = 0xe8e0d2, dark = 0x2a221c, pink = 0xd8a0a0;
  return {
    body: new Blocks()
      .box(0.24, 0.22, 0.24, fur, [0, 0.19, -0.05], [0, 0, 0], [0.85, 0.9]) // haunches
      .box(0.2, 0.19, 0.18, fur, [0, 0.2, 0.1], [0, 0, 0], [0.85, 0.9]) // chest
      .box(0.16, 0.06, 0.26, pale, [0, 0.1, 0.02]) // belly
      .box(0.1, 0.1, 0.08, pale, [0, 0.24, -0.2]) // tail
      .box(0.08, 0.05, 0.16, fur, [0.1, 0.09, -0.08]) // big hind feet
      .box(0.08, 0.05, 0.16, fur, [-0.1, 0.09, -0.08])
      .build(),
    headPivot: [0, 0.27, 0.15],
    head: new Blocks()
      .box(0.15, 0.14, 0.16, fur, [0, 0.03, 0.06], [0, 0, 0], [0.9, 0.9])
      .box(0.12, 0.09, 0.08, pale, [0, 0.0, 0.14]) // muzzle
      .box(0.04, 0.03, 0.02, pink, [0, 0.02, 0.18]) // nose
      .box(0.025, 0.035, 0.03, dark, [0.07, 0.06, 0.1]) // eyes
      .box(0.025, 0.035, 0.03, dark, [-0.07, 0.06, 0.1])
      .box(0.045, 0.2, 0.025, fur, [0.04, 0.18, 0.02], [-0.25, 0, -0.12], [0.7, 1])
      .box(0.045, 0.2, 0.025, fur, [-0.04, 0.18, 0.02], [-0.25, 0, 0.12], [0.7, 1])
      .box(0.025, 0.15, 0.01, pink, [0.04, 0.18, 0.035], [-0.25, 0, -0.12])
      .box(0.025, 0.15, 0.01, pink, [-0.04, 0.18, 0.035], [-0.25, 0, 0.12])
      .build(),
    antlers: null,
    leg: new Blocks().box(0.05, 0.12, 0.07, fur, [0, -0.06, 0]).box(0.05, 0.03, 0.08, pale, [0, -0.11, 0.02]).build(),
    legs: [[0.06, 0.12, 0.13], [-0.06, 0.12, 0.13], [0.09, 0.12, -0.08], [-0.09, 0.12, -0.08]],
  };
}

/**
 * A bear: a heavy, rounded body on thick legs, low-slung head with a long
 * snout and small round ears. Black bears are black with a tan muzzle;
 * grizzlies brown, silver-tipped, with the big hump over the shoulders.
 */
function bear({ coat, back, muzzle, claws = 0x2a2420, hump = 0 }) {
  const body = new Blocks()
    .box(0.78, 0.8, 0.7, coat, [0, 0.95, -0.42], [0, 0, 0], [0.8, 0.85]) // rump
    .box(0.84, 0.86, 0.66, coat, [0, 0.98, 0.1], [0, 0, 0], [0.82, 0.9]) // belly and flanks
    .box(0.86, 0.9, 0.5, coat, [0, 1.02, 0.5], [0, 0, 0], [0.8, 0.9]) // shoulders
    .box(0.56, 0.2, 1.3, back, [0, 1.38, 0.02], [0, 0, 0], [0.8, 0.95]) // the back
    .box(0.12, 0.1, 0.1, coat, [0, 1.12, -0.8]); // stub of a tail
  if (hump) body.box(0.6, 0.3 * hump, 0.46, back, [0, 1.46 + 0.1 * hump, 0.46], [0, 0, 0], [0.6, 0.7]);
  return {
    body: body.build(),
    headPivot: [0, 1.15, 0.72],
    head: new Blocks()
      .box(0.44, 0.4, 0.4, coat, [0, 0.02, 0.16], [0, 0, 0], [0.9, 0.9]) // skull
      .box(0.24, 0.2, 0.26, muzzle, [0, -0.06, 0.44], [0, 0, 0], [0.85, 0.9]) // snout
      .box(0.12, 0.08, 0.06, 0x100c0a, [0, -0.02, 0.58]) // nose
      .box(0.04, 0.04, 0.03, 0x0a0806, [0.12, 0.08, 0.35]) // eyes
      .box(0.04, 0.04, 0.03, 0x0a0806, [-0.12, 0.08, 0.35])
      .box(0.12, 0.12, 0.06, coat, [0.18, 0.25, 0.1]) // round ears
      .box(0.12, 0.12, 0.06, coat, [-0.18, 0.25, 0.1])
      .build(),
    antlers: null,
    leg: new Blocks()
      .box(0.26, 0.4, 0.3, coat, [0, -0.18, 0], [0, 0, 0], [1.1, 1.1])
      .box(0.22, 0.3, 0.24, coat, [0, -0.48, 0.01])
      .box(0.24, 0.08, 0.3, back, [0, -0.66, 0.04]) // paw
      .box(0.2, 0.03, 0.06, claws, [0, -0.68, 0.2])
      .build(),
    legs: [[0.26, 0.7, 0.5], [-0.26, 0.7, 0.5], [0.26, 0.7, -0.52], [-0.26, 0.7, -0.52]],
  };
}
export const blackBear = () => bear({ coat: 0x1c1816, back: 0x141110, muzzle: 0xa88a64 });
export const grizzly = () => bear({ coat: 0x6e4c2e, back: 0x8a6a4a, muzzle: 0x5a3e26, hump: 1 });

// The wild dogs, each built its own way (about a metre long at scale 1,
// each kind drawn at its own scale, facing +z).

/**
 * A grey wolf: big and deep in the chest, a thick ruff of fur about the
 * neck and shoulders, a broad head with short rounded ears and a pale mask,
 * long legs, and a straight bushy tail hanging down.
 */
export function wolf() {
  const coat = 0x8a8984, back = 0x4e4c48, pale = 0xd8d4c8, ruff = 0xa4a29a, dark = 0x2e2c2a;
  const body = new Blocks()
    .box(0.36, 0.38, 0.4, coat, [0, 0.7, 0.22], [0, 0, 0], [0.85, 0.9]) // deep chest
    .box(0.42, 0.34, 0.26, ruff, [0, 0.8, 0.36], [0.3, 0, 0], [0.8, 0.9]) // the ruff, shaggy
    .box(0.28, 0.28, 0.44, coat, [0, 0.72, -0.14], [0, 0, 0], [0.9, 1]) // barrel, tucked up
    .box(0.29, 0.29, 0.24, coat, [0, 0.72, -0.44], [0, 0, 0], [0.85, 0.9]) // hips
    .box(0.24, 0.07, 0.72, back, [0, 0.89, -0.08], [0, 0, 0], [0.8, 1]) // dark saddle
    .box(0.2, 0.08, 0.46, pale, [0, 0.54, 0.02]) // pale belly
    .box(0.26, 0.26, 0.24, ruff, [0, 0.88, 0.5], [0.5, 0, 0], [0.8, 0.85]) // thick neck
    .box(0.2, 0.2, 0.14, pale, [0, 0.7, 0.5]) // pale throat
    .box(0.13, 0.13, 0.42, coat, [0, 0.6, -0.68], [-0.95, 0, 0], [1.25, 1.25]) // bushy tail, hanging
    .box(0.12, 0.12, 0.12, dark, [0, 0.42, -0.8], [-1.1, 0, 0]);
  return {
    body: body.build(),
    headPivot: [0, 0.94, 0.62],
    head: new Blocks()
      .box(0.28, 0.24, 0.26, coat, [0, 0.02, 0.08], [0, 0, 0], [0.9, 0.9]) // broad skull
      .box(0.3, 0.12, 0.1, ruff, [0, -0.04, 0.0]) // cheek fur
      .box(0.15, 0.12, 0.22, pale, [0, -0.04, 0.3], [0, 0, 0], [0.8, 0.85]) // blunt muzzle, pale
      .box(0.08, 0.06, 0.04, 0x141010, [0, 0.0, 0.42]) // nose
      .box(0.1, 0.03, 0.1, back, [0, 0.14, 0.14]) // dark brow
      .box(0.035, 0.03, 0.02, 0xc8a040, [0.08, 0.06, 0.21]) // amber eyes
      .box(0.035, 0.03, 0.02, 0xc8a040, [-0.08, 0.06, 0.21])
      .box(0.08, 0.1, 0.05, coat, [0.09, 0.17, 0.02], [0, 0, 0.2], [0.35, 0.5]) // short rounded ears
      .box(0.08, 0.1, 0.05, coat, [-0.09, 0.17, 0.02], [0, 0, -0.2], [0.35, 0.5])
      .build(),
    antlers: null,
    leg: new Blocks()
      .box(0.11, 0.34, 0.12, coat, [0, -0.17, 0], [0, 0, 0], [0.85, 0.9])
      .box(0.08, 0.2, 0.08, pale, [0, -0.44, 0.01])
      .box(0.11, 0.05, 0.14, 0x6a6660, [0, -0.54, 0.03]) // big paw
      .build(),
    legs: [[0.12, 0.56, 0.32], [-0.12, 0.56, 0.32], [0.11, 0.56, -0.42], [-0.11, 0.56, -0.42]],
  };
}

/**
 * A coyote: lean and rangy, a narrow pointed muzzle, big tall ears, thin
 * legs, tawny with a grizzled back, and the tail carried low, the tip dark.
 */
export function coyote() {
  const coat = 0xae8a5e, back = 0x7a6450, grizzle = 0x9a8a7a, pale = 0xe2d2b4, dark = 0x2e2620;
  const body = new Blocks()
    .box(0.24, 0.28, 0.32, coat, [0, 0.66, 0.24], [0, 0, 0], [0.85, 0.9]) // narrow chest
    .box(0.2, 0.22, 0.44, coat, [0, 0.67, -0.1], [0, 0, 0], [0.9, 1]) // slim barrel, tucked well up
    .box(0.22, 0.24, 0.22, coat, [0, 0.67, -0.4], [0, 0, 0], [0.85, 0.9]) // hips
    .box(0.16, 0.06, 0.8, grizzle, [0, 0.8, -0.06]) // grizzled back
    .box(0.1, 0.04, 0.6, back, [0, 0.83, -0.06])
    .box(0.15, 0.06, 0.42, pale, [0, 0.54, 0.02]) // pale belly
    .box(0.16, 0.2, 0.18, coat, [0, 0.8, 0.42], [0.7, 0, 0], [0.8, 0.9]) // thin neck, reaching forward
    .box(0.14, 0.14, 0.12, pale, [0, 0.66, 0.42]) // pale throat
    .box(0.1, 0.1, 0.4, grizzle, [0, 0.52, -0.62], [-1.2, 0, 0], [1.15, 1.15]) // tail, carried low
    .box(0.09, 0.09, 0.12, dark, [0, 0.33, -0.7], [-1.35, 0, 0]);
  return {
    body: body.build(),
    headPivot: [0, 0.86, 0.54],
    head: new Blocks()
      .box(0.18, 0.17, 0.2, coat, [0, 0.02, 0.07], [0, 0, 0], [0.9, 0.9]) // small skull
      .box(0.08, 0.07, 0.26, pale, [0, -0.03, 0.28], [0, 0, 0], [0.75, 0.8]) // long pointed muzzle
      .box(0.05, 0.04, 0.04, 0x141010, [0, -0.01, 0.42]) // nose
      .box(0.03, 0.025, 0.02, 0xb89040, [0.06, 0.05, 0.17]) // yellow eyes
      .box(0.03, 0.025, 0.02, 0xb89040, [-0.06, 0.05, 0.17])
      .box(0.08, 0.17, 0.04, coat, [0.07, 0.18, 0.02], [0, 0, 0.12], [0.2, 0.4]) // big tall ears
      .box(0.08, 0.17, 0.04, coat, [-0.07, 0.18, 0.02], [0, 0, -0.12], [0.2, 0.4])
      .box(0.05, 0.1, 0.01, pale, [0.07, 0.16, 0.045], [0, 0, 0.12], [0.3, 0.4]) // pale inner ears
      .box(0.05, 0.1, 0.01, pale, [-0.07, 0.16, 0.045], [0, 0, -0.12], [0.3, 0.4])
      .build(),
    antlers: null,
    leg: new Blocks()
      .box(0.075, 0.3, 0.085, coat, [0, -0.15, 0], [0, 0, 0], [0.85, 0.9])
      .box(0.055, 0.2, 0.055, 0xc4a47a, [0, -0.4, 0.01]) // thin shanks
      .box(0.07, 0.04, 0.1, 0x8a6e50, [0, -0.5, 0.03]) // small paw
      .build(),
    legs: [[0.08, 0.52, 0.3], [-0.08, 0.52, 0.3], [0.08, 0.52, -0.38], [-0.08, 0.52, -0.38]],
  };
}

/**
 * A red fox: small and long in the body on short legs in black stockings,
 * a slender snout, a white bib and chin, black-backed pointed ears, and a
 * great brush of a tail, as long as its body, held out behind, white-tipped.
 */
export function fox() {
  const coat = 0xc8622a, back = 0xa84e1c, white = 0xf2ece0, black = 0x241a14;
  const body = new Blocks()
    .box(0.26, 0.26, 0.3, coat, [0, 0.48, 0.3], [0, 0, 0], [0.85, 0.9]) // chest
    .box(0.24, 0.23, 0.52, coat, [0, 0.49, -0.06], [0, 0, 0], [0.9, 1]) // long body
    .box(0.25, 0.25, 0.24, coat, [0, 0.5, -0.4], [0, 0, 0], [0.85, 0.9]) // hips
    .box(0.16, 0.05, 0.8, back, [0, 0.62, -0.04]) // darker back
    .box(0.18, 0.08, 0.26, white, [0, 0.36, 0.34]) // white bib
    .box(0.14, 0.06, 0.4, 0xe8d8c4, [0, 0.36, -0.06]) // pale belly
    .box(0.18, 0.2, 0.18, coat, [0, 0.62, 0.48], [0.45, 0, 0], [0.8, 0.9]) // neck
    .box(0.16, 0.18, 0.1, white, [0, 0.5, 0.52]) // white throat
    .box(0.2, 0.2, 0.34, coat, [0, 0.46, -0.66], [-0.3, 0, 0], [1.1, 1.1]) // the brush, thick
    .box(0.24, 0.23, 0.3, coat, [0, 0.38, -0.94], [-0.22, 0, 0], [0.8, 0.8])
    .box(0.16, 0.15, 0.16, white, [0, 0.33, -1.14], [-0.2, 0, 0]); // white tip
  return {
    body: body.build(),
    headPivot: [0, 0.68, 0.6],
    head: new Blocks()
      .box(0.2, 0.17, 0.2, coat, [0, 0.02, 0.06], [0, 0, 0], [0.9, 0.9]) // skull
      .box(0.24, 0.1, 0.08, white, [0, -0.05, 0.05]) // white cheeks
      .box(0.08, 0.07, 0.22, coat, [0, -0.02, 0.24], [0, 0, 0], [0.7, 0.8]) // slender snout
      .box(0.07, 0.03, 0.2, white, [0, -0.06, 0.24]) // white chin
      .box(0.045, 0.04, 0.04, 0x141010, [0, 0.0, 0.36]) // nose
      .box(0.03, 0.025, 0.02, 0x1a0c06, [0.06, 0.05, 0.16]) // eyes
      .box(0.03, 0.025, 0.02, 0x1a0c06, [-0.06, 0.05, 0.16])
      .box(0.08, 0.15, 0.04, black, [0.07, 0.17, 0.0], [0, 0, 0.15], [0.2, 0.4]) // black-backed ears
      .box(0.08, 0.15, 0.04, black, [-0.07, 0.17, 0.0], [0, 0, -0.15], [0.2, 0.4])
      .box(0.05, 0.09, 0.01, white, [0.07, 0.15, 0.025], [0, 0, 0.15], [0.3, 0.4])
      .box(0.05, 0.09, 0.01, white, [-0.07, 0.15, 0.025], [0, 0, -0.15], [0.3, 0.4])
      .build(),
    antlers: null,
    leg: new Blocks()
      .box(0.08, 0.16, 0.09, coat, [0, -0.08, 0], [0, 0, 0], [0.85, 0.9])
      .box(0.06, 0.17, 0.06, black, [0, -0.24, 0.01]) // black stockings
      .box(0.07, 0.035, 0.09, black, [0, -0.33, 0.025])
      .build(),
    legs: [[0.08, 0.35, 0.34], [-0.08, 0.35, 0.34], [0.08, 0.35, -0.38], [-0.08, 0.35, -0.38]],
  };
}

/**
 * A sheep: a fat, lumpy fleece of cream wool on thin black legs, a narrow
 * black face with the ears sticking out sideways, and a stub of a tail.
 */
export function sheep() {
  const wool = 0xece6d6, woolDark = 0xd8d0bc, face = 0x241e1a;
  const body = new Blocks()
    .box(0.52, 0.48, 0.86, wool, [0, 0.7, -0.02], [0, 0, 0], [0.85, 0.9]) // the fleece
    .box(0.44, 0.2, 0.7, woolDark, [0, 0.95, -0.02], [0, 0, 0], [0.8, 0.9]) // lumpy on top
    .box(0.3, 0.3, 0.3, wool, [0.14, 0.78, 0.28]) // lumps
    .box(0.3, 0.3, 0.3, woolDark, [-0.15, 0.74, -0.3])
    .box(0.28, 0.28, 0.28, wool, [0.12, 0.72, -0.34])
    .box(0.34, 0.3, 0.28, wool, [0, 0.82, 0.42], [0, 0, 0], [0.8, 0.85]) // the chest
    .box(0.12, 0.1, 0.1, woolDark, [0, 0.8, -0.48]); // tail
  return {
    body: body.build(),
    headPivot: [0, 0.9, 0.52],
    head: new Blocks()
      .box(0.16, 0.2, 0.26, face, [0, -0.02, 0.12], [0.3, 0, 0], [0.8, 0.85]) // long narrow face
      .box(0.22, 0.14, 0.14, wool, [0, 0.08, 0.0]) // a woolly cap
      .box(0.14, 0.05, 0.05, face, [0.13, 0.04, 0.04], [0, 0, -0.3]) // ears, out sideways
      .box(0.14, 0.05, 0.05, face, [-0.13, 0.04, 0.04], [0, 0, 0.3])
      .box(0.03, 0.03, 0.02, 0xd8c060, [0.07, 0.04, 0.2]) // pale eyes
      .box(0.03, 0.03, 0.02, 0xd8c060, [-0.07, 0.04, 0.2])
      .build(),
    antlers: null,
    leg: new Blocks()
      .box(0.1, 0.18, 0.1, woolDark, [0, -0.06, 0])
      .box(0.06, 0.36, 0.06, face, [0, -0.3, 0])
      .box(0.07, 0.04, 0.08, 0x141010, [0, -0.48, 0.01])
      .build(),
    legs: [[0.14, 0.5, 0.3], [-0.14, 0.5, 0.3], [0.14, 0.5, -0.3], [-0.14, 0.5, -0.3]],
  };
}

// --- Birds ------------------------------------------------------------------
// About 0.3 m long at scale 1 (each kind drawn at its own scale), centred on
// the body, facing +z. Wings hinge at the shoulders (flapped and folded):
// covert feathers, then the long flight feathers fanned out at the tip.

function bird({ body, belly = body, head = body, beak = 0x3a2e22, wing = body, tip = wing, tail = body, eye = 0x0a0808, legs = 0x4a3a2a, crest = null }) {
  const wingOf = (side) => {
    const b = new Blocks()
      .box(0.16, 0.025, 0.15, wing, [side * 0.08, 0, 0.005])
      .box(0.12, 0.02, 0.12, wing, [side * 0.2, 0, -0.01]);
    for (let k = 0; k < 4; k++) b.box(0.13, 0.015, 0.035, tip, [side * (0.3 + k * 0.012), 0, 0.03 - k * 0.035], [0, side * (0.1 + k * 0.12), 0]);
    return b.build();
  };
  const b = new Blocks()
    .box(0.11, 0.1, 0.16, body, [0, 0, 0.02], [0, 0, 0], [0.85, 0.9])
    .box(0.1, 0.085, 0.1, body, [0, 0.005, -0.09], [0, 0, 0], [0.8, 0.9])
    .box(0.09, 0.04, 0.2, belly, [0, -0.045, 0.0], [0, 0, 0], [1.1, 1])
    .box(0.09, 0.085, 0.09, head, [0, 0.06, 0.13], [0, 0, 0], [0.85, 0.85])
    .box(0.03, 0.025, 0.05, beak, [0, 0.05, 0.2], [0, 0, 0], [0.5, 0.6])
    .box(0.015, 0.02, 0.02, eye, [0.042, 0.075, 0.15])
    .box(0.015, 0.02, 0.02, eye, [-0.042, 0.075, 0.15])
    .box(0.04, 0.012, 0.13, tail, [0.025, 0.005, -0.2], [0, 0.15, 0]) // tail fan
    .box(0.04, 0.012, 0.13, tail, [-0.025, 0.005, -0.2], [0, -0.15, 0])
    .box(0.04, 0.012, 0.14, tail, [0, 0.008, -0.21])
    .box(0.012, 0.06, 0.012, legs, [0.025, -0.08, 0.02]) // legs
    .box(0.012, 0.06, 0.012, legs, [-0.025, -0.08, 0.02]);
  if (crest) b.box(0.02, 0.05, 0.05, crest, [0, 0.115, 0.1], [-0.4, 0, 0]);
  return { body: b.build(), wingL: wingOf(1), wingR: wingOf(-1) };
}

export const songbird = () => bird({ body: 0xd8d0c4, belly: 0xf0ece4, head: 0xd0c8bc, wing: 0xb8b0a4, tip: 0x8a8278 }); // (tinted bird by bird)
export const starling = () => bird({ body: 0x2c2a34, belly: 0x3a3844, head: 0x24222c, beak: 0xd8b040, wing: 0x26242e, legs: 0xc08a5a });
export const crow = () => bird({ body: 0x18181c, head: 0x121216, beak: 0x0c0c0e, wing: 0x1a1a20, tip: 0x101014, legs: 0x101010 });
export const gull = () => bird({ body: 0xf2f2f0, belly: 0xffffff, head: 0xf8f8f6, beak: 0xe8c040, wing: 0xb8c0c8, tip: 0x2a2a2e, tail: 0xf2f2f0, legs: 0xe0a060 });
export const hawk = () => bird({ body: 0x6e4a2c, belly: 0xd8c8a8, head: 0x5a3a22, beak: 0x2a2a2a, wing: 0x7a5434, tip: 0x3a2a1e, tail: 0x9a5a34, legs: 0xd8b040, crest: 0x5a3a22 });

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

/**
 * A dragonfly: a long thin body (blue, or green), a round head with big
 * eyes, and four clear wings held out flat. About 8 cm long at scale 1.
 */
export const dragonfly = (body = 0x2a82c8, eyes = 0x1e3a5a) => new Blocks()
  .box(0.012, 0.012, 0.06, body, [0, 0, -0.035]) // the long tail
  .box(0.018, 0.018, 0.025, body, [0, 0, 0.005]) // thorax
  .box(0.022, 0.018, 0.016, eyes, [0, 0.002, 0.025]) // head, all eyes
  .box(0.05, 0.002, 0.014, 0xdce8f0, [0.03, 0.008, 0.012], [0, -0.12, 0]) // wings
  .box(0.05, 0.002, 0.014, 0xdce8f0, [-0.03, 0.008, 0.012], [0, 0.12, 0])
  .box(0.045, 0.002, 0.013, 0xdce8f0, [0.028, 0.008, -0.006], [0, 0.15, 0])
  .box(0.045, 0.002, 0.013, 0xdce8f0, [-0.028, 0.008, -0.006], [0, -0.15, 0])
  .build();

/**
 * A frog sitting at the water's edge: a squat green body, its big hind
 * legs folded at its sides, bulging eyes, a pale throat. About 9 cm long at
 * scale 1, facing +z, sitting on y = 0.
 */
export const frog = () => new Blocks()
  .box(0.05, 0.03, 0.07, 0x4f7f2e, [0, 0.022, 0], [-0.25, 0, 0], [0.8, 0.8]) // body, sitting up a little
  .box(0.044, 0.02, 0.03, 0x5a8a34, [0, 0.035, 0.034], [0, 0, 0], [0.85, 0.8]) // head
  .box(0.04, 0.008, 0.03, 0xd8d0a0, [0, 0.022, 0.032]) // pale throat
  .box(0.014, 0.014, 0.014, 0x2e3a1c, [0.016, 0.05, 0.036]) // eyes
  .box(0.014, 0.014, 0.014, 0x2e3a1c, [-0.016, 0.05, 0.036])
  .box(0.016, 0.018, 0.05, 0x44702a, [0.03, 0.01, -0.01]) // folded hind legs
  .box(0.016, 0.018, 0.05, 0x44702a, [-0.03, 0.01, -0.01])
  .box(0.022, 0.006, 0.026, 0x3e6624, [0.034, 0.003, 0.018]) // big feet
  .box(0.022, 0.006, 0.026, 0x3e6624, [-0.034, 0.003, 0.018])
  .box(0.008, 0.022, 0.008, 0x44702a, [0.018, 0.012, 0.04]) // front legs
  .box(0.008, 0.022, 0.008, 0x44702a, [-0.018, 0.012, 0.04])
  .box(0.012, 0.004, 0.03, 0x2e4a1a, [0.012, 0.038, -0.012]) // dark spots
  .box(0.012, 0.004, 0.02, 0x2e4a1a, [-0.014, 0.036, -0.02])
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
