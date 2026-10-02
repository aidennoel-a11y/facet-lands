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

  /**
   * A pair of eyes (at ±x): the iris, in its colour, the pupil in front
   * of it ('round'; 'slit', upright, a cat's or a crocodile's; 'bar', level,
   * a goat's or a sheep's), and a glint of light in each: so they read as
   * eyes, not as a dark dot on the fur.
   */
  eyes(w, h, d, iris, [x, y, z], pupil = 'round') {
    const front = z + d / 2;
    const [pw, ph] = pupil === 'slit' ? [w * 0.2, h * 0.85] : pupil === 'bar' ? [w * 0.7, h * 0.28] : [w * 0.5, h * 0.55];
    for (const sx of [1, -1]) {
      this.box(w, h, d, iris, [sx * x, y, z]);
      this.box(pw, ph, 0.006, 0x050404, [sx * x, y, front + 0.002]);
      this.box(w * 0.24, h * 0.26, 0.004, 0xf2f0ea, [sx * (x + w * 0.2), y + h * 0.22, front + 0.005]); // (the glint)
    }
    return this;
  }

  build() {
    const g = mergeGeometries(this.parts);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

// --- Four-legged animals (and two-legged birds that walk) -------------------
// Standing on the ground at y = 0, facing +z. Parts: body; head (turned
// about its pivot to graze or look up); optional antlers (on the head's
// pivot); and the legs, each in two parts, jointed: the upper (from the hip
// or shoulder) and the lower (from the knee or hock, with the hoof or paw),
// set by the gait so each foot stands where it's put down (see Gait.js).
// `legs`: the hip and shoulder joints (fore near, fore off, hind near, hind
// off; a bird's two). `torso` and `skull`: boxes for what a blow or an arrow
// hits ([x, y, z, half width, half height, half length]; the skull's in the
// head's own frame, about its pivot).

/**
 * A leg in two parts, each hanging down -y from its joint: the upper
 * (length l1, from `top` [width, depth] at the hip to `knee` at the joint)
 * and the lower (length l2, down to `ankle`, with the foot [w, h, d,
 * colour, how far forward] at its end, standing on the ground).
 */
function limb(l1, l2, { top, knee, ankle = [knee[0] * 0.8, knee[1] * 0.8], color, low = color, foot }) {
  const upper = new Blocks().box(knee[0], l1, knee[1], color, [0, -l1 / 2, 0], [0, 0, 0], [top[0] / knee[0], top[1] / knee[1]]);
  const lower = new Blocks().box(ankle[0], l2, ankle[1], low, [0, -l2 / 2, 0], [0, 0, 0], [(knee[0] * 0.85) / ankle[0], (knee[1] * 0.85) / ankle[1]]);
  const [fw, fh, fd, fc, fz = 0] = foot;
  lower.box(fw, fh, fd, fc, [0, -l2 + fh / 2, fz]);
  return { upper: upper.build(), lower: lower.build(), l1, l2 };
}

/**
 * A deer (or an elk): a slender body on long thin legs, the white rump and
 * tail, a long neck and a narrow head with big ears; a buck's antlers. An
 * elk is bigger and darker in the neck, with a shaggy mane, a pale straw
 * rump, and great swept-back antlers.
 */
function cervid({ coat, back, belly, rump = 0xf2ece0, neck = coat, mane = null, elk = false }) {
  const dark = 0x2e221a, nose = 0x1c1612;
  const body = new Blocks()
    .box(0.42, 0.5, 0.62, coat, [0, 1.04, 0.28], [0, 0, 0], [0.9, 0.95]) // chest and shoulders
    .box(0.4, 0.44, 0.56, coat, [0, 1.05, -0.24], [0, 0, 0], [0.92, 1]) // barrel
    .box(0.42, 0.5, 0.36, coat, [0, 1.07, -0.6], [0, 0, 0], [0.85, 0.9]) // haunches
    .box(0.3, 0.08, 1.2, back, [0, 1.3, -0.1]) // the darker line of the back
    .box(0.34, 0.1, 1.0, belly, [0, 0.8, -0.05], [0, 0, 0], [1.1, 1]) // belly
    .box(elk ? 0.38 : 0.3, elk ? 0.4 : 0.32, 0.1, rump, [0, 1.04, -0.79]) // the pale rump
    .box(0.24, 0.2, 0.12, elk ? neck : belly, [0, 1.0, 0.6]); // throat
  if (elk) body.box(0.08, 0.1, 0.06, coat, [0, 1.16, -0.84], [0.3, 0, 0]); // a stub of a tail
  else body.box(0.12, 0.22, 0.07, rump, [0, 1.18, -0.84], [0.45, 0, 0]).box(0.1, 0.18, 0.06, coat, [0, 1.2, -0.82], [0.45, 0, 0]); // tail, up
  const head = new Blocks()
    .box(0.26, 0.3, 0.32, neck, [0, 0.02, -0.02], [0.2, 0, 0], [0.9, 0.9]) // the base of the neck, into the shoulders
    .box(0.2, 0.5, 0.22, neck, [0, 0.3, 0.1], [0.45, 0, 0], [0.8, 0.85]) // neck, leaning forward up to the head
    .box(0.14, 0.36, 0.08, elk ? neck : belly, [0, 0.24, 0.2], [0.45, 0, 0]) // throat
    .box(0.22, 0.2, 0.26, elk ? neck : coat, [0, 0.58, 0.22]) // skull
    .box(0.16, 0.16, 0.22, coat, [0, 0.54, 0.44], [0, 0, 0], [0.85, 1]) // face
    .box(0.12, 0.09, 0.08, nose, [0, 0.52, 0.56]) // nose
    .box(0.03, 0.04, 0.04, 0x0e0a08, [0.11, 0.62, 0.32]) // eyes
    .box(0.03, 0.04, 0.04, 0x0e0a08, [-0.11, 0.62, 0.32])
    .box(0.05, 0.2, 0.12, coat, [0.15, 0.74, 0.16], [0, 0.3, -0.7], [0.6, 0.6]) // ears
    .box(0.05, 0.2, 0.12, coat, [-0.15, 0.74, 0.16], [0, -0.3, 0.7], [0.6, 0.6])
    .box(0.02, 0.14, 0.08, 0xe8c8b0, [0.17, 0.74, 0.18], [0, 0.3, -0.7])
    .box(0.02, 0.14, 0.08, 0xe8c8b0, [-0.17, 0.74, 0.18], [0, -0.3, 0.7]);
  if (mane) head.box(0.26, 0.4, 0.2, mane, [0, 0.16, -0.02], [0.45, 0, 0], [0.9, 0.9]); // the shaggy mane under the neck
  const antlers = new Blocks(), bone = 0xcbb690;
  for (const side of [1, -1]) {
    if (elk) {
      // A long beam sweeping up and back, and six tines off it, forward.
      antlers.box(0.05, 0.4, 0.05, bone, [side * 0.12, 0.88, 0.16], [-0.35, 0, -side * 0.3]);
      antlers.box(0.045, 0.4, 0.045, bone, [side * 0.22, 1.2, 0.02], [-0.6, 0, -side * 0.18]);
      antlers.box(0.04, 0.34, 0.04, bone, [side * 0.26, 1.46, -0.2], [-0.9, 0, -side * 0.1]);
      antlers.box(0.035, 0.2, 0.035, bone, [side * 0.16, 0.86, 0.34], [1.0, 0, -side * 0.2]); // brow tine
      antlers.box(0.035, 0.18, 0.035, bone, [side * 0.2, 1.0, 0.24], [0.9, 0, -side * 0.2]);
      antlers.box(0.035, 0.2, 0.035, bone, [side * 0.26, 1.28, 0.12], [0.5, 0, -side * 0.25]);
      antlers.box(0.03, 0.18, 0.03, bone, [side * 0.29, 1.46, -0.04], [0.3, 0, -side * 0.3]);
      antlers.box(0.03, 0.16, 0.03, bone, [side * 0.28, 1.6, -0.24], [-0.1, 0, -side * 0.3]);
    } else {
      antlers.box(0.04, 0.3, 0.04, bone, [side * 0.1, 0.82, 0.22], [0, 0, -side * 0.35]); // beam
      antlers.box(0.035, 0.28, 0.035, bone, [side * 0.2, 1.02, 0.16], [-0.4, 0, -side * 0.2]);
      antlers.box(0.03, 0.2, 0.03, bone, [side * 0.24, 1.18, 0.1], [-0.6, 0, -side * 0.1]);
      antlers.box(0.03, 0.16, 0.03, bone, [side * 0.17, 1.0, 0.3], [0.7, 0, -side * 0.2]); // tines
      antlers.box(0.03, 0.14, 0.03, bone, [side * 0.26, 1.12, 0.24], [0.6, 0, -side * 0.3]);
      antlers.box(0.03, 0.12, 0.03, bone, [side * 0.22, 1.28, 0.06], [0.2, 0, -side * 0.3]);
    }
  }
  const legColor = elk ? neck : coat;
  return {
    body: body.build(),
    headPivot: [0, 1.2, 0.52],
    head: head.build(),
    antlers: antlers.build(),
    // (Long slender legs: the forearm and the thin cannon below the knee;
    // the thigh and gaskin, and the cannon below the hock.)
    fore: limb(0.44, 0.47, { top: [0.15, 0.2], knee: [0.08, 0.09], ankle: [0.055, 0.06], color: legColor, foot: [0.075, 0.07, 0.1, dark, 0.01] }),
    hind: limb(0.46, 0.45, { top: [0.17, 0.26], knee: [0.08, 0.1], ankle: [0.055, 0.06], color: coat, foot: [0.075, 0.07, 0.1, dark, 0.01] }),
    legs: [[0.13, 0.87, 0.46], [-0.13, 0.87, 0.46], [0.14, 0.87, -0.58], [-0.14, 0.87, -0.58]],
    torso: [[0, 1.05, -0.08, 0.21, 0.27, 0.74]],
    neck: [0, 0.28, 0.08, 0.12, 0.28, 0.13],
    skull: [0, 0.57, 0.32, 0.12, 0.12, 0.27],
  };
}
export const deer = () => cervid({ coat: 0x9c6b3f, back: 0x86592f, belly: 0xdcc6a2 });
export const elk = () => cervid({ coat: 0xa8845a, back: 0x8a6a44, belly: 0x5a3e28, neck: 0x4e3622, mane: 0x3e2a1a, rump: 0xe0cc9a, elk: true });

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
      .eyes(0.05, 0.06, 0.05, 0x3a2414, [0.3, -0.02, 0.44], 'round') // eyes
      .box(0.12, 0.08, 0.12, shag, [0.38, 0.08, 0.2]) // ears
      .box(0.12, 0.08, 0.12, shag, [-0.38, 0.08, 0.2])
      .box(0.1, 0.09, 0.2, horn, [0.4, 0.2, 0.3], [0, 0.5, 0]) // horns: out, then up and in
      .box(0.08, 0.16, 0.08, horn, [0.49, 0.3, 0.36], [0, 0, 0.35])
      .box(0.1, 0.09, 0.2, horn, [-0.4, 0.2, 0.3], [0, -0.5, 0])
      .box(0.08, 0.16, 0.08, horn, [-0.49, 0.3, 0.36], [0, 0, -0.35])
      .build(),
    antlers: null,
    fore: limb(0.38, 0.42, { top: [0.36, 0.4], knee: [0.22, 0.24], ankle: [0.17, 0.19], color: shag, low: coat, foot: [0.22, 0.08, 0.26, dark, 0.02] }),
    hind: limb(0.39, 0.41, { top: [0.34, 0.44], knee: [0.2, 0.24], ankle: [0.16, 0.18], color: coat, foot: [0.22, 0.08, 0.26, dark, 0.02] }),
    legs: [[0.3, 0.76, 0.5], [-0.3, 0.76, 0.5], [0.28, 0.76, -0.88], [-0.28, 0.76, -0.88]],
    torso: [[0, 1.15, -0.62, 0.42, 0.48, 0.62], [0, 1.45, 0.38, 0.56, 0.9, 0.48]],
    skull: [0, -0.15, 0.4, 0.33, 0.36, 0.36],
  };
}

/**
 * A moose: the biggest of the deer, dark and humped at the shoulders, on
 * long pale legs; a long drooping muzzle, the bell hanging from the throat,
 * and (a bull's) broad flat palms of antler.
 */
export function moose() {
  const coat = 0x3a2a1e, dark = 0x241a12, leg = 0x9a8a72, muzzle = 0x4e3a2a, bone = 0xc8b48c;
  const antlers = new Blocks();
  for (const side of [1, -1]) {
    antlers.box(0.08, 0.08, 0.2, bone, [side * 0.2, 0.26, 0.36], [0, 0, 0]); // the base, out sideways
    antlers.box(0.62, 0.05, 0.4, bone, [side * 0.52, 0.42, 0.34], [0, 0, side * 0.42]); // the palm
    for (let k = 0; k < 5; k++) antlers.box(0.04, 0.16, 0.04, bone, [side * (0.36 + k * 0.1), 0.44 + k * 0.07, 0.52], [0.3, 0, side * 0.2]); // tines along its edge
  }
  return {
    body: new Blocks()
      .box(0.72, 0.84, 0.8, coat, [0, 1.56, 0.42], [0, 0, 0], [0.85, 0.9]) // deep chest and shoulders
      .box(0.66, 0.72, 0.8, coat, [0, 1.5, -0.24], [0, 0, 0], [0.9, 1]) // barrel
      .box(0.6, 0.68, 0.46, coat, [0, 1.46, -0.76], [0, 0, 0], [0.82, 0.9]) // hindquarters, lower
      .box(0.46, 0.34, 0.66, dark, [0, 2.02, 0.36], [0, 0, 0], [0.6, 0.8]) // the hump over the shoulders
      .box(0.52, 0.12, 1.4, dark, [0, 1.12, -0.12]) // belly
      .box(0.1, 0.14, 0.08, dark, [0, 1.6, -1.0], [0.4, 0, 0]) // stub of a tail
      .build(),
    headPivot: [0, 1.82, 0.78],
    head: new Blocks()
      .box(0.34, 0.44, 0.48, coat, [0, 0.0, 0.18], [0.7, 0, 0], [0.85, 0.85]) // thick short neck, reaching forward
      .box(0.3, 0.3, 0.34, coat, [0, 0.04, 0.5]) // skull
      .box(0.26, 0.3, 0.42, muzzle, [0, -0.1, 0.82], [0.15, 0, 0], [0.9, 0.9]) // long heavy muzzle
      .box(0.26, 0.18, 0.14, dark, [0, -0.18, 1.04]) // the overhanging nose
      .box(0.08, 0.36, 0.14, dark, [0, -0.36, 0.44], [0.15, 0, 0]) // the bell
      .box(0.04, 0.05, 0.04, 0x0a0806, [0.15, 0.1, 0.62]) // eyes
      .box(0.04, 0.05, 0.04, 0x0a0806, [-0.15, 0.1, 0.62])
      .box(0.08, 0.22, 0.12, coat, [0.2, 0.24, 0.4], [0, 0.3, -0.9], [0.6, 0.6]) // ears
      .box(0.08, 0.22, 0.12, coat, [-0.2, 0.24, 0.4], [0, -0.3, 0.9], [0.6, 0.6])
      .build(),
    antlers: antlers.build(),
    fore: limb(0.6, 0.64, { top: [0.24, 0.3], knee: [0.12, 0.13], ankle: [0.08, 0.09], color: coat, low: leg, foot: [0.11, 0.09, 0.15, dark, 0.02] }),
    hind: limb(0.62, 0.62, { top: [0.26, 0.36], knee: [0.12, 0.14], ankle: [0.08, 0.09], color: coat, low: leg, foot: [0.11, 0.09, 0.15, dark, 0.02] }),
    legs: [[0.2, 1.18, 0.55], [-0.2, 1.18, 0.55], [0.19, 1.18, -0.78], [-0.19, 1.18, -0.78]],
    torso: [[0, 1.55, -0.14, 0.35, 0.46, 0.92]],
    neck: [0, 0.0, 0.2, 0.18, 0.24, 0.26],
    skull: [0, -0.04, 0.72, 0.16, 0.2, 0.42],
  };
}

export function rabbit({ fur = 0x8f7f6a, pale = 0xe8e0d2, hare = false } = {}) {
  const dark = 0x2a221c, pink = 0xd8a0a0, ear = hare ? 0.28 : 0.2;
  return {
    body: new Blocks()
      .box(0.24, 0.22, 0.24, fur, [0, 0.19, -0.05], [0, 0, 0], [0.85, 0.9]) // haunches
      .box(0.2, 0.19, 0.18, fur, [0, 0.2, 0.1], [0, 0, 0], [0.85, 0.9]) // chest
      .box(0.16, 0.06, 0.26, pale, [0, 0.1, 0.02]) // belly
      .box(0.1, 0.1, 0.08, pale, [0, 0.24, -0.2]) // tail
      .build(),
    headPivot: [0, 0.27, 0.15],
    head: new Blocks()
      .box(0.15, 0.14, 0.16, fur, [0, 0.03, 0.06], [0, 0, 0], [0.9, 0.9])
      .box(0.12, 0.09, 0.08, pale, [0, 0.0, 0.14]) // muzzle
      .box(0.04, 0.03, 0.02, pink, [0, 0.02, 0.18]) // nose
      .eyes(0.025, 0.035, 0.03, 0x2e1c10, [0.07, 0.06, 0.1], 'round') // eyes
      .box(0.045, ear, 0.025, fur, [0.04, 0.08 + ear / 2, 0.02], [-0.25, 0, -0.12], [0.7, 1]) // long ears
      .box(0.045, ear, 0.025, fur, [-0.04, 0.08 + ear / 2, 0.02], [-0.25, 0, 0.12], [0.7, 1])
      .box(0.025, ear * 0.75, 0.01, hare ? dark : pink, [0.04, 0.08 + ear / 2, 0.035], [-0.25, 0, -0.12]) // (a hare's ears tipped black)
      .box(0.025, ear * 0.75, 0.01, hare ? dark : pink, [-0.04, 0.08 + ear / 2, 0.035], [-0.25, 0, 0.12])
      .build(),
    antlers: null,
    // Short forelegs; the long hind legs folded, on their big long feet.
    fore: limb(0.07, 0.07, { top: [0.06, 0.07], knee: [0.045, 0.05], color: fur, foot: [0.05, 0.03, 0.07, pale, 0.02] }),
    hind: limb(0.1, hare ? 0.12 : 0.1, { top: [0.1, 0.14], knee: [0.06, 0.07], color: fur, foot: [0.07, 0.04, hare ? 0.2 : 0.17, fur, 0.06] }),
    legs: [[0.06, 0.13, 0.12], [-0.06, 0.13, 0.12], [0.09, 0.18, -0.1], [-0.09, 0.18, -0.1]],
    torso: [[0, 0.2, 0.0, 0.12, 0.11, 0.2]],
    skull: [0, 0.03, 0.08, 0.08, 0.08, 0.1],
  };
}
// (A hare, drawn white: tinted brown except in the winter.)
export const hare = () => rabbit({ fur: 0xf4f2ee, pale: 0xffffff, hare: true });

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
  const paw = [0.24, 0.08, 0.32, back, 0.05];
  return {
    body: body.build(),
    headPivot: [0, 1.15, 0.72],
    head: new Blocks()
      .box(0.44, 0.4, 0.4, coat, [0, 0.02, 0.16], [0, 0, 0], [0.9, 0.9]) // skull
      .box(0.24, 0.2, 0.26, muzzle, [0, -0.06, 0.44], [0, 0, 0], [0.85, 0.9]) // snout
      .box(0.12, 0.08, 0.06, 0x100c0a, [0, -0.02, 0.58]) // nose
      .eyes(0.04, 0.04, 0.03, 0x4a2c16, [0.12, 0.08, 0.35], 'round') // eyes
      .box(0.12, 0.12, 0.06, coat, [0.18, 0.25, 0.1]) // round ears
      .box(0.12, 0.12, 0.06, coat, [-0.18, 0.25, 0.1])
      .build(),
    antlers: null,
    // (Thick legs, flat on the ground on their broad clawed paws.)
    fore: limb(0.36, 0.38, { top: [0.3, 0.34], knee: [0.23, 0.25], ankle: [0.21, 0.23], color: coat, foot: paw }),
    hind: limb(0.37, 0.37, { top: [0.3, 0.38], knee: [0.22, 0.25], ankle: [0.2, 0.22], color: coat, foot: paw }),
    legs: [[0.26, 0.7, 0.5], [-0.26, 0.7, 0.5], [0.26, 0.7, -0.52], [-0.26, 0.7, -0.52]],
    torso: [[0, 1.0, -0.02, 0.4, 0.45 + 0.05 * hump, 0.78]],
    skull: [0, 0.0, 0.3, 0.22, 0.21, 0.32],
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
      .eyes(0.035, 0.03, 0.02, 0xc8a040, [0.08, 0.06, 0.21], 'round') // amber eyes
      .box(0.08, 0.1, 0.05, coat, [0.09, 0.17, 0.02], [0, 0, 0.2], [0.35, 0.5]) // short rounded ears
      .box(0.08, 0.1, 0.05, coat, [-0.09, 0.17, 0.02], [0, 0, -0.2], [0.35, 0.5])
      .build(),
    antlers: null,
    fore: limb(0.28, 0.3, { top: [0.12, 0.15], knee: [0.08, 0.08], ankle: [0.065, 0.065], color: coat, low: pale, foot: [0.11, 0.05, 0.14, 0x6a6660, 0.03] }),
    hind: limb(0.29, 0.29, { top: [0.13, 0.18], knee: [0.08, 0.09], ankle: [0.065, 0.065], color: coat, low: pale, foot: [0.11, 0.05, 0.14, 0x6a6660, 0.03] }),
    legs: [[0.12, 0.56, 0.32], [-0.12, 0.56, 0.32], [0.11, 0.56, -0.42], [-0.11, 0.56, -0.42]],
    torso: [[0, 0.72, 0.03, 0.18, 0.21, 0.58]],
    skull: [0, 0.0, 0.18, 0.14, 0.12, 0.25],
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
      .eyes(0.03, 0.025, 0.02, 0xb89040, [0.06, 0.05, 0.17], 'round') // yellow eyes
      .box(0.08, 0.17, 0.04, coat, [0.07, 0.18, 0.02], [0, 0, 0.12], [0.2, 0.4]) // big tall ears
      .box(0.08, 0.17, 0.04, coat, [-0.07, 0.18, 0.02], [0, 0, -0.12], [0.2, 0.4])
      .box(0.05, 0.1, 0.01, pale, [0.07, 0.16, 0.045], [0, 0, 0.12], [0.3, 0.4]) // pale inner ears
      .box(0.05, 0.1, 0.01, pale, [-0.07, 0.16, 0.045], [0, 0, -0.12], [0.3, 0.4])
      .build(),
    antlers: null,
    fore: limb(0.26, 0.28, { top: [0.085, 0.1], knee: [0.055, 0.06], ankle: [0.045, 0.045], color: coat, low: 0xc4a47a, foot: [0.07, 0.04, 0.1, 0x8a6e50, 0.03] }),
    hind: limb(0.27, 0.27, { top: [0.1, 0.14], knee: [0.06, 0.065], ankle: [0.045, 0.045], color: coat, low: 0xc4a47a, foot: [0.07, 0.04, 0.1, 0x8a6e50, 0.03] }),
    legs: [[0.08, 0.52, 0.3], [-0.08, 0.52, 0.3], [0.08, 0.52, -0.38], [-0.08, 0.52, -0.38]],
    torso: [[0, 0.68, 0.0, 0.12, 0.16, 0.52]],
    skull: [0, 0.0, 0.2, 0.09, 0.09, 0.24],
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
      .eyes(0.03, 0.025, 0.02, 0xc08a30, [0.06, 0.05, 0.16], 'slit') // eyes
      .box(0.08, 0.15, 0.04, black, [0.07, 0.17, 0.0], [0, 0, 0.15], [0.2, 0.4]) // black-backed ears
      .box(0.08, 0.15, 0.04, black, [-0.07, 0.17, 0.0], [0, 0, -0.15], [0.2, 0.4])
      .box(0.05, 0.09, 0.01, white, [0.07, 0.15, 0.025], [0, 0, 0.15], [0.3, 0.4])
      .box(0.05, 0.09, 0.01, white, [-0.07, 0.15, 0.025], [0, 0, -0.15], [0.3, 0.4])
      .build(),
    antlers: null,
    fore: limb(0.17, 0.19, { top: [0.08, 0.1], knee: [0.06, 0.06], color: coat, low: black, foot: [0.07, 0.035, 0.09, black, 0.025] }),
    hind: limb(0.18, 0.18, { top: [0.09, 0.13], knee: [0.06, 0.065], color: coat, low: black, foot: [0.07, 0.035, 0.09, black, 0.025] }),
    legs: [[0.08, 0.35, 0.34], [-0.08, 0.35, 0.34], [0.08, 0.35, -0.38], [-0.08, 0.35, -0.38]],
    torso: [[0, 0.49, -0.02, 0.13, 0.14, 0.52]],
    skull: [0, 0.0, 0.15, 0.1, 0.09, 0.22],
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
      .eyes(0.03, 0.03, 0.02, 0xc8b070, [0.07, 0.04, 0.2], 'bar') // pale eyes
      .build(),
    antlers: null,
    // (Woolly at the top, thin and black below.)
    fore: limb(0.25, 0.27, { top: [0.12, 0.12], knee: [0.06, 0.06], ankle: [0.05, 0.05], color: woolDark, low: face, foot: [0.07, 0.04, 0.08, 0x141010, 0.01] }),
    hind: limb(0.26, 0.26, { top: [0.13, 0.15], knee: [0.06, 0.065], ankle: [0.05, 0.05], color: woolDark, low: face, foot: [0.07, 0.04, 0.08, 0x141010, 0.01] }),
    legs: [[0.14, 0.5, 0.3], [-0.14, 0.5, 0.3], [0.14, 0.5, -0.3], [-0.14, 0.5, -0.3]],
    torso: [[0, 0.76, -0.02, 0.27, 0.3, 0.52]],
    skull: [0, -0.02, 0.14, 0.1, 0.12, 0.16],
  };
}

/**
 * A wild boar: a heavy wedge of a body, high at the shoulders with a
 * bristling dark mane down the back, a big long head ending in a flat
 * snout, curved white tusks, small ears, short strong legs, a thin tail.
 */
export function boar() {
  const coat = 0x4a3c30, dark = 0x2a221c, mane = 0x1e1814, snout = 0x6a5a50, tusk = 0xf0e8d8;
  return {
    body: new Blocks()
      .box(0.46, 0.6, 0.5, coat, [0, 0.74, 0.28], [0, 0, 0], [0.8, 0.9]) // high shoulders
      .box(0.44, 0.52, 0.6, coat, [0, 0.68, -0.18], [0, 0, 0], [0.85, 0.95]) // barrel
      .box(0.38, 0.46, 0.34, coat, [0, 0.62, -0.56], [0, 0, 0], [0.8, 0.9]) // rump, lower
      .box(0.1, 0.12, 0.9, mane, [0, 1.06, 0.06], [0, 0, 0], [0.6, 1]) // the bristling mane
      .box(0.34, 0.08, 0.9, dark, [0, 0.42, -0.1]) // belly
      .box(0.03, 0.26, 0.03, dark, [0, 0.58, -0.76], [0.25, 0, 0]) // thin tail
      .box(0.06, 0.08, 0.05, mane, [0, 0.45, -0.8])
      .build(),
    headPivot: [0, 0.8, 0.5],
    head: new Blocks()
      .box(0.34, 0.38, 0.34, coat, [0, -0.02, 0.12], [0, 0, 0], [0.85, 0.85]) // big head
      .box(0.2, 0.22, 0.36, coat, [0, -0.14, 0.4], [0.25, 0, 0], [0.8, 0.8]) // long face, sloping down
      .box(0.16, 0.14, 0.05, snout, [0, -0.24, 0.6]) // the flat snout
      .box(0.03, 0.12, 0.03, tusk, [0.09, -0.14, 0.5], [0.3, 0, -0.5]) // tusks, curving up and out
      .box(0.03, 0.12, 0.03, tusk, [-0.09, -0.14, 0.5], [0.3, 0, 0.5])
      .eyes(0.035, 0.035, 0.03, 0x4a2a16, [0.12, 0.04, 0.3], 'round') // small eyes
      .box(0.08, 0.12, 0.04, coat, [0.12, 0.2, 0.06], [0.3, 0, -0.3], [0.4, 0.6]) // small pointed ears
      .box(0.08, 0.12, 0.04, coat, [-0.12, 0.2, 0.06], [0.3, 0, 0.3], [0.4, 0.6])
      .box(0.08, 0.14, 0.2, mane, [0, 0.2, -0.02]) // the mane, starting on the head
      .build(),
    antlers: null,
    fore: limb(0.22, 0.24, { top: [0.16, 0.2], knee: [0.09, 0.1], ankle: [0.07, 0.07], color: coat, low: dark, foot: [0.08, 0.05, 0.09, 0x141010, 0.01] }),
    hind: limb(0.22, 0.24, { top: [0.16, 0.22], knee: [0.09, 0.1], ankle: [0.07, 0.07], color: coat, low: dark, foot: [0.08, 0.05, 0.09, 0x141010, 0.01] }),
    legs: [[0.14, 0.44, 0.34], [-0.14, 0.44, 0.34], [0.13, 0.44, -0.5], [-0.13, 0.44, -0.5]],
    torso: [[0, 0.7, -0.1, 0.23, 0.32, 0.66]],
    skull: [0, -0.06, 0.28, 0.17, 0.2, 0.34],
  };
}

/**
 * A cougar: a long, low tawny cat, lean in the flank, a small round head
 * with a white muzzle and dark marks at the lips, small round ears, big
 * soft paws, and a long heavy tail, curling up at its dark tip.
 */
export function cougar() {
  const coat = 0xb88a58, back = 0x9a7048, pale = 0xece0cc, dark = 0x2a1e16;
  return {
    body: new Blocks()
      .box(0.3, 0.34, 0.4, coat, [0, 0.62, 0.3], [0, 0, 0], [0.85, 0.9]) // chest
      .box(0.26, 0.28, 0.6, coat, [0, 0.62, -0.14], [0, 0, 0], [0.9, 1]) // long lean flank
      .box(0.3, 0.34, 0.3, coat, [0, 0.65, -0.52], [0, 0, 0], [0.85, 0.9]) // hips
      .box(0.16, 0.05, 1.1, back, [0, 0.8, -0.1]) // a darker back
      .box(0.2, 0.06, 0.8, pale, [0, 0.47, -0.04]) // pale belly
      .box(0.09, 0.09, 0.4, coat, [0, 0.54, -0.8], [-1.0, 0, 0], [0.95, 0.95]) // the long tail, hanging
      .box(0.085, 0.085, 0.34, coat, [0, 0.3, -0.98], [-0.2, 0, 0])
      .box(0.08, 0.08, 0.18, dark, [0, 0.33, -1.2], [0.6, 0, 0]) // curling up at the dark tip
      .build(),
    headPivot: [0, 0.76, 0.52],
    head: new Blocks()
      .box(0.2, 0.22, 0.22, coat, [0, -0.06, 0.0], [0.5, 0, 0], [0.85, 0.9]) // neck
      .box(0.22, 0.19, 0.2, coat, [0, 0.04, 0.14], [0, 0, 0], [0.9, 0.9]) // small round head
      .box(0.13, 0.1, 0.1, pale, [0, -0.02, 0.27]) // white muzzle
      .box(0.05, 0.04, 0.03, 0x6a4a3a, [0, 0.02, 0.33]) // nose
      .box(0.13, 0.03, 0.02, dark, [0, -0.05, 0.32]) // the dark lip line
      .eyes(0.035, 0.03, 0.02, 0xc8a040, [0.06, 0.08, 0.24], 'round') // amber eyes
      .box(0.07, 0.07, 0.04, coat, [0.08, 0.16, 0.1], [0, 0, 0.2], [0.6, 0.6]) // small round ears
      .box(0.07, 0.07, 0.04, coat, [-0.08, 0.16, 0.1], [0, 0, -0.2], [0.6, 0.6])
      .build(),
    antlers: null,
    fore: limb(0.26, 0.28, { top: [0.12, 0.15], knee: [0.09, 0.09], ankle: [0.075, 0.075], color: coat, foot: [0.12, 0.05, 0.13, pale, 0.03] }),
    hind: limb(0.27, 0.27, { top: [0.14, 0.2], knee: [0.08, 0.09], ankle: [0.07, 0.07], color: coat, foot: [0.12, 0.05, 0.13, pale, 0.03] }),
    legs: [[0.1, 0.52, 0.36], [-0.1, 0.52, 0.36], [0.1, 0.52, -0.5], [-0.1, 0.52, -0.5]],
    torso: [[0, 0.63, -0.1, 0.16, 0.2, 0.64]],
    neck: [0, -0.07, -0.02, 0.11, 0.13, 0.1],
    skull: [0, 0.03, 0.17, 0.12, 0.12, 0.17],
  };
}

/**
 * A wild turkey: a plump bronze body on long pink legs, barred wings
 * folded at its sides, a fan of a tail (spread wide, in the spring, to
 * show off), and a small bare blue-and-red head on a long neck, the
 * wattle hanging.
 */
export function turkey() {
  const bronze = 0x4a3a2a, sheen = 0x6a5438, bar = 0xd8d0c0, skin = 0x7a98c8, red = 0xc02a20, leg = 0xc89a8a;
  const tail = new Blocks();
  for (let k = -3; k <= 3; k++) tail.box(0.09, 0.02, 0.36, k % 2 ? sheen : bronze, [Math.sin(k * 0.3) * 0.2, 0.72 + Math.cos(k * 0.3) * 0.18, -0.38], [-1.1, k * 0.3, 0]);
  return {
    body: new Blocks()
      .box(0.36, 0.4, 0.5, bronze, [0, 0.66, 0.0], [0, 0, 0], [0.8, 0.85]) // plump body
      .box(0.32, 0.34, 0.26, sheen, [0, 0.62, 0.22], [0, 0, 0], [0.8, 0.8]) // breast
      .box(0.04, 0.12, 0.04, 0x1a1410, [0, 0.62, 0.36]) // the beard
      .box(0.06, 0.26, 0.42, sheen, [0.18, 0.68, -0.04], [0, 0, 0], [1, 0.9]) // folded wings, barred
      .box(0.06, 0.26, 0.42, sheen, [-0.18, 0.68, -0.04], [0, 0, 0], [1, 0.9])
      .box(0.065, 0.04, 0.3, bar, [0.18, 0.6, -0.06])
      .box(0.065, 0.04, 0.3, bar, [-0.18, 0.6, -0.06])
      .box(0.2, 0.06, 0.36, bronze, [0, 0.62, -0.34], [0.5, 0, 0]) // tail, folded down
      .build(),
    fan: tail.build(),
    headPivot: [0, 0.8, 0.24],
    head: new Blocks()
      .box(0.07, 0.28, 0.07, skin, [0, 0.12, 0.04], [0.15, 0, 0]) // long bare neck
      .box(0.08, 0.08, 0.1, skin, [0, 0.28, 0.08]) // small head
      .box(0.03, 0.03, 0.05, 0xd8c8a0, [0, 0.27, 0.15]) // beak
      .box(0.04, 0.1, 0.04, red, [0, 0.2, 0.1]) // wattle
      .box(0.02, 0.07, 0.02, red, [0, 0.3, 0.14], [0.3, 0, 0]) // snood
      .box(0.02, 0.02, 0.02, 0x0a0806, [0.04, 0.3, 0.1])
      .box(0.02, 0.02, 0.02, 0x0a0806, [-0.04, 0.3, 0.1])
      .build(),
    antlers: null,
    biped: true,
    hind: limb(0.2, 0.24, { top: [0.1, 0.12], knee: [0.035, 0.035], ankle: [0.03, 0.03], color: bronze, low: leg, foot: [0.1, 0.02, 0.12, leg, 0.03] }),
    legs: [[0.08, 0.44, 0.0], [-0.08, 0.44, 0.0]],
    torso: [[0, 0.66, 0.02, 0.19, 0.2, 0.3]],
    neck: [0, 0.1, 0.04, 0.05, 0.14, 0.05],
    skull: [0, 0.27, 0.09, 0.05, 0.06, 0.07],
  };
}

/**
 * A mallard: a boat of a body, grey and brown, the drake's green head with
 * its white collar, a yellow bill, a curl of black at the tail, and short
 * orange legs well back (a waddle on land; on the water, paddling).
 */
export function duck() {
  const grey = 0x9a948a, brown = 0x6a4a34, green = 0x1e5a3a, bill = 0xd8b030, leg = 0xe08a30;
  const wing = (side) => new Blocks()
    .box(0.24, 0.02, 0.14, brown, [side * 0.12, 0, 0])
    .box(0.12, 0.015, 0.1, 0x3a4a9a, [side * 0.18, 0.005, -0.02]) // the blue speculum
    .box(0.14, 0.015, 0.1, brown, [side * 0.3, 0, -0.03], [0, side * 0.3, 0])
    .build();
  return {
    body: new Blocks()
      .box(0.2, 0.14, 0.36, grey, [0, 0.16, 0.0], [0, 0, 0], [0.85, 0.85]) // body
      .box(0.18, 0.12, 0.14, brown, [0, 0.17, 0.16]) // chestnut breast
      .box(0.14, 0.06, 0.24, brown, [0, 0.24, -0.04]) // brown back
      .box(0.1, 0.08, 0.1, 0x1a1a1a, [0, 0.19, -0.2], [-0.4, 0, 0]) // black tail curl
      .box(0.08, 0.04, 0.08, 0xf2f2f0, [0, 0.16, -0.22])
      .build(),
    wingL: wing(1),
    wingR: wing(-1),
    wingAt: [0, 0.22, 0.02],
    headPivot: [0, 0.22, 0.16],
    head: new Blocks()
      .box(0.07, 0.03, 0.06, 0xf2f2f0, [0, 0.03, 0.02]) // white collar
      .box(0.07, 0.1, 0.07, green, [0, 0.09, 0.03]) // green neck
      .box(0.08, 0.08, 0.1, green, [0, 0.15, 0.06]) // head
      .box(0.05, 0.02, 0.08, bill, [0, 0.13, 0.14]) // bill
      .box(0.015, 0.015, 0.015, 0x0a0806, [0.04, 0.17, 0.08])
      .box(0.015, 0.015, 0.015, 0x0a0806, [-0.04, 0.17, 0.08])
      .build(),
    antlers: null,
    biped: true,
    swims: true,
    hind: limb(0.05, 0.06, { top: [0.03, 0.03], knee: [0.02, 0.02], color: leg, foot: [0.06, 0.012, 0.06, leg, 0.02] }),
    legs: [[0.05, 0.11, -0.02], [-0.05, 0.11, -0.02]],
    torso: [[0, 0.17, 0, 0.1, 0.09, 0.2]],
    neck: [0, 0.05, 0.03, 0.045, 0.06, 0.045],
    skull: [0, 0.14, 0.08, 0.05, 0.05, 0.09],
  };
}

/**
 * A rattlesnake: a long body drawn as a chain of segments (the body tan
 * with dark diamonds down the back), a broad flat head, the rattle at the
 * end of the tail.
 */
export function snake() {
  const tan = 0xb0986a, dark = 0x4a3a26;
  return {
    segment: new Blocks()
      .box(0.07, 0.05, 0.1, tan, [0, 0.025, 0])
      .box(0.045, 0.012, 0.06, dark, [0, 0.052, 0], [0, 0.785, 0]) // a diamond on its back
      .build(),
    head: new Blocks()
      .box(0.08, 0.04, 0.1, tan, [0, 0.022, 0.04], [0, 0, 0], [0.8, 0.8]) // broad flat head
      .box(0.05, 0.03, 0.04, tan, [0, 0.02, 0.1])
      .box(0.015, 0.015, 0.015, 0x1a1008, [0.035, 0.035, 0.07])
      .box(0.015, 0.015, 0.015, 0x1a1008, [-0.035, 0.035, 0.07])
      .box(0.012, 0.004, 0.04, 0x3a1010, [0, 0.01, 0.14]) // tongue
      .build(),
    rattle: new Blocks()
      .box(0.035, 0.03, 0.03, 0xd8c8a0, [0, 0.02, -0.02])
      .box(0.03, 0.026, 0.03, 0xc8b890, [0, 0.02, -0.05])
      .box(0.025, 0.022, 0.03, 0xd8c8a0, [0, 0.02, -0.08])
      .build(),
    segments: 16,
    spacing: 0.075,
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
/** A fly: a dark body, a big reddish head, two clear wings held back. About 1 cm long, shown a little large. */
export const housefly = () => new Blocks()
  .box(0.022, 0.018, 0.034, 0x1e1c1a, [0, 0, -0.004])
  .box(0.018, 0.016, 0.012, 0x4a1a14, [0, 0.002, 0.018])
  .box(0.028, 0.002, 0.018, 0xc8d4dc, [0.014, 0.01, -0.006], [0, -0.3, 0])
  .box(0.028, 0.002, 0.018, 0xc8d4dc, [-0.014, 0.01, -0.006], [0, 0.3, 0])
  .build();

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

// --- The jungle's, the swamps' and the crags' -------------------------------

/**
 * A tiger: big and heavy-shouldered, deep orange with bold black stripes
 * running down its sides, white belly, cheeks and eye spots, a broad
 * ruffed face, small round ears with white marks behind, a long ringed tail.
 */
export function tiger() {
  const coat = 0xd8782a, dark = 0x1a1210, white = 0xf2ece0, back = 0xc8682a;
  const body = new Blocks()
    .box(0.46, 0.5, 0.5, coat, [0, 0.84, 0.42], [0, 0, 0], [0.85, 0.9]) // heavy shoulders
    .box(0.4, 0.44, 0.8, coat, [0, 0.82, -0.12], [0, 0, 0], [0.9, 1]) // long body
    .box(0.42, 0.48, 0.4, coat, [0, 0.84, -0.62], [0, 0, 0], [0.85, 0.9]) // hips
    .box(0.24, 0.05, 1.5, back, [0, 1.08, -0.1]) // deeper orange along the back
    .box(0.3, 0.08, 1.2, white, [0, 0.6, -0.05]); // white belly
  // The stripes: dark bars down both flanks and over the back.
  for (let k = 0; k < 8; k++) {
    const z = 0.55 - k * 0.18, h = 0.3 + 0.08 * Math.sin(k * 1.7);
    body.box(0.03, h, 0.05, dark, [0.215, 0.88, z], [0.25, 0, 0]);
    body.box(0.03, h, 0.05, dark, [-0.215, 0.88, z], [-0.25, 0, 0]);
    body.box(0.36, 0.03, 0.05, dark, [0, 1.09, z + 0.06]);
  }
  // The long tail, ringed, hanging and curving up at its black tip.
  body.box(0.09, 0.09, 0.42, coat, [0, 0.74, -0.98], [-0.9, 0, 0], [0.95, 0.95]);
  body.box(0.1, 0.03, 0.1, dark, [0, 0.62, -1.0]);
  body.box(0.085, 0.085, 0.36, coat, [0, 0.44, -1.16], [-0.2, 0, 0]);
  body.box(0.09, 0.03, 0.09, dark, [0, 0.42, -1.2]);
  body.box(0.08, 0.08, 0.16, dark, [0, 0.46, -1.38], [0.6, 0, 0]);
  return {
    body: body.build(),
    headPivot: [0, 1.0, 0.7],
    head: new Blocks()
      .box(0.32, 0.3, 0.26, coat, [0, -0.08, 0.0], [0.5, 0, 0], [0.85, 0.9]) // thick neck
      .box(0.36, 0.3, 0.3, coat, [0, 0.04, 0.18], [0, 0, 0], [0.9, 0.9]) // broad head
      .box(0.42, 0.18, 0.14, white, [0, -0.04, 0.2]) // white ruff of the cheeks
      .box(0.18, 0.13, 0.16, white, [0, -0.06, 0.36]) // white muzzle
      .box(0.08, 0.05, 0.04, 0x8a4a3a, [0, 0.0, 0.45]) // nose
      .eyes(0.05, 0.03, 0.02, 0xd8b040, [0.08, 0.08, 0.34], 'round') // gold eyes
      .box(0.06, 0.03, 0.02, white, [0.09, 0.12, 0.33]) // white spots over the eyes
      .box(0.06, 0.03, 0.02, white, [-0.09, 0.12, 0.33])
      .box(0.03, 0.12, 0.02, dark, [0, 0.16, 0.33]) // stripes on the brow
      .box(0.03, 0.08, 0.02, dark, [0.07, 0.17, 0.32], [0, 0, 0.3])
      .box(0.03, 0.08, 0.02, dark, [-0.07, 0.17, 0.32], [0, 0, -0.3])
      .box(0.03, 0.03, 0.16, dark, [0.2, 0.0, 0.2]) // cheek stripes
      .box(0.03, 0.03, 0.16, dark, [-0.2, 0.0, 0.2])
      .box(0.1, 0.1, 0.05, coat, [0.13, 0.22, 0.1], [0, 0, 0.2], [0.6, 0.6]) // small round ears
      .box(0.1, 0.1, 0.05, coat, [-0.13, 0.22, 0.1], [0, 0, -0.2], [0.6, 0.6])
      .box(0.05, 0.05, 0.01, white, [0.13, 0.22, 0.075]) // white marks behind them
      .box(0.05, 0.05, 0.01, white, [-0.13, 0.22, 0.075])
      .build(),
    antlers: null,
    fore: limb(0.32, 0.34, { top: [0.18, 0.22], knee: [0.13, 0.14], ankle: [0.11, 0.11], color: coat, foot: [0.17, 0.06, 0.19, white, 0.03] }),
    hind: limb(0.34, 0.33, { top: [0.2, 0.28], knee: [0.12, 0.13], ankle: [0.1, 0.1], color: coat, foot: [0.17, 0.06, 0.19, white, 0.03] }),
    legs: [[0.15, 0.66, 0.48], [-0.15, 0.66, 0.48], [0.15, 0.66, -0.64], [-0.15, 0.66, -0.64]],
    torso: [[0, 0.84, -0.1, 0.23, 0.28, 0.8]],
    neck: [0, -0.08, 0.0, 0.16, 0.16, 0.13],
    skull: [0, 0.03, 0.2, 0.18, 0.15, 0.2],
  };
}

/**
 * A black panther (a melanistic jaguar or leopard): sleek and glossy
 * black, the rosettes only just showing darker on it, compact and
 * muscular, a big round head with pale green-gold eyes, a long tail.
 */
export function panther() {
  const coat = 0x1e1c22, sheen = 0x2c2a32, rosette = 0x121014, eye = 0xb8c850;
  const body = new Blocks()
    .box(0.32, 0.36, 0.4, coat, [0, 0.64, 0.32], [0, 0, 0], [0.85, 0.9]) // chest
    .box(0.28, 0.3, 0.62, coat, [0, 0.64, -0.12], [0, 0, 0], [0.9, 1]) // body
    .box(0.32, 0.36, 0.32, coat, [0, 0.66, -0.52], [0, 0, 0], [0.85, 0.9]) // hips
    .box(0.18, 0.04, 1.1, sheen, [0, 0.83, -0.1]); // the glossy back, catching the light
  // The faint rosettes, darker on the black.
  for (const [x, y, z] of [[0.15, 0.66, 0.3], [0.15, 0.72, 0.0], [0.145, 0.62, -0.25], [0.155, 0.7, -0.5], [-0.15, 0.68, 0.22], [-0.15, 0.62, -0.05], [-0.145, 0.72, -0.32], [-0.155, 0.66, -0.55]]) {
    body.box(0.02, 0.07, 0.08, rosette, [x, y, z]);
  }
  body.box(0.08, 0.08, 0.44, coat, [0, 0.54, -0.84], [-1.0, 0, 0], [0.95, 0.95]); // long tail
  body.box(0.075, 0.075, 0.4, coat, [0, 0.3, -1.04], [-0.25, 0, 0]);
  body.box(0.07, 0.07, 0.2, sheen, [0, 0.36, -1.28], [0.7, 0, 0]);
  return {
    body: body.build(),
    headPivot: [0, 0.78, 0.54],
    head: new Blocks()
      .box(0.22, 0.22, 0.22, coat, [0, -0.06, 0.0], [0.5, 0, 0], [0.85, 0.9]) // neck
      .box(0.26, 0.22, 0.24, coat, [0, 0.05, 0.15], [0, 0, 0], [0.92, 0.92]) // big round head
      .box(0.15, 0.11, 0.12, sheen, [0, -0.02, 0.3]) // muzzle
      .box(0.06, 0.04, 0.03, 0x0a080a, [0, 0.02, 0.37]) // nose
      .eyes(0.05, 0.035, 0.02, eye, [0.07, 0.09, 0.27], 'round') // pale green-gold eyes
      .box(0.08, 0.08, 0.04, coat, [0.1, 0.18, 0.1], [0, 0, 0.25], [0.6, 0.6]) // small round ears
      .box(0.08, 0.08, 0.04, coat, [-0.1, 0.18, 0.1], [0, 0, -0.25], [0.6, 0.6])
      .build(),
    antlers: null,
    fore: limb(0.25, 0.27, { top: [0.13, 0.16], knee: [0.1, 0.1], ankle: [0.08, 0.08], color: coat, foot: [0.13, 0.05, 0.14, sheen, 0.03] }),
    hind: limb(0.27, 0.26, { top: [0.15, 0.21], knee: [0.09, 0.1], ankle: [0.075, 0.075], color: coat, foot: [0.13, 0.05, 0.14, sheen, 0.03] }),
    legs: [[0.11, 0.52, 0.38], [-0.11, 0.52, 0.38], [0.11, 0.52, -0.52], [-0.11, 0.52, -0.52]],
    torso: [[0, 0.65, -0.1, 0.17, 0.21, 0.64]],
    neck: [0, -0.06, 0.0, 0.12, 0.13, 0.11],
    skull: [0, 0.04, 0.17, 0.13, 0.12, 0.17],
  };
}

/**
 * A giant panda: round and heavy, white with black legs, a black band
 * over the shoulders, black round ears and the black patches round the
 * eyes; a short white stub of a tail.
 */
export function panda() {
  const white = 0xf0ece4, black = 0x161414, cream = 0xe0d8c8;
  return {
    body: new Blocks()
      .box(0.8, 0.78, 0.66, white, [0, 0.92, -0.36], [0, 0, 0], [0.8, 0.85]) // round white rump
      .box(0.84, 0.82, 0.5, white, [0, 0.95, 0.06], [0, 0, 0], [0.82, 0.88]) // belly
      .box(0.86, 0.84, 0.44, black, [0, 0.98, 0.44], [0, 0, 0], [0.8, 0.88]) // the black band over the shoulders
      .box(0.5, 0.18, 0.7, cream, [0, 1.32, -0.22], [0, 0, 0], [0.8, 0.95]) // a creamy back
      .box(0.14, 0.12, 0.08, white, [0, 1.0, -0.74]) // stub of a tail
      .build(),
    headPivot: [0, 1.12, 0.66],
    head: new Blocks()
      .box(0.5, 0.44, 0.42, white, [0, 0.04, 0.16], [0, 0, 0], [0.92, 0.92]) // big round head
      .box(0.26, 0.18, 0.18, white, [0, -0.08, 0.42], [0, 0, 0], [0.85, 0.9]) // short muzzle
      .box(0.1, 0.07, 0.05, black, [0, -0.03, 0.52]) // nose
      .box(0.13, 0.11, 0.04, black, [0.11, 0.08, 0.37], [0, 0, -0.4]) // the black eye patches
      .box(0.13, 0.11, 0.04, black, [-0.11, 0.08, 0.37], [0, 0, 0.4])
      .eyes(0.035, 0.035, 0.02, 0x4a3a2c, [0.11, 0.09, 0.395], 'round') // small dark eyes in them
      .box(0.15, 0.14, 0.08, black, [0.2, 0.28, 0.08]) // round black ears
      .box(0.15, 0.14, 0.08, black, [-0.2, 0.28, 0.08])
      .build(),
    antlers: null,
    // (Black legs, thick, on broad paws.)
    fore: limb(0.34, 0.36, { top: [0.3, 0.32], knee: [0.23, 0.24], ankle: [0.21, 0.22], color: black, foot: [0.24, 0.08, 0.3, black, 0.05] }),
    hind: limb(0.35, 0.35, { top: [0.3, 0.36], knee: [0.22, 0.24], ankle: [0.2, 0.21], color: black, foot: [0.24, 0.08, 0.3, black, 0.05] }),
    legs: [[0.25, 0.66, 0.44], [-0.25, 0.66, 0.44], [0.25, 0.66, -0.48], [-0.25, 0.66, -0.48]],
    torso: [[0, 0.95, -0.04, 0.4, 0.42, 0.72]],
    skull: [0, 0.04, 0.24, 0.24, 0.22, 0.3],
  };
}

/**
 * A mountain goat: a stocky white goat in a shaggy coat, long hair hanging
 * in a skirt about its legs and a beard under its chin, a hump of a
 * shoulder, short black dagger horns curving back, black hooves.
 */
export function mountainGoat() {
  const white = 0xf2f0e8, shade = 0xdcd8cc, black = 0x18161a;
  return {
    body: new Blocks()
      .box(0.32, 0.38, 0.4, white, [0, 0.84, 0.26], [0, 0, 0], [0.82, 0.9]) // chest
      .box(0.22, 0.12, 0.26, white, [0, 1.04, 0.26], [0, 0, 0], [0.7, 0.8]) // the hump of the shoulder, low
      .box(0.28, 0.32, 0.6, white, [0, 0.84, -0.18], [0, 0, 0], [0.9, 0.95]) // lean body
      .box(0.3, 0.3, 0.26, white, [0, 0.86, -0.5], [0, 0, 0], [0.85, 0.9]) // hindquarters
      .box(0.26, 0.1, 0.9, shade, [0, 0.64, -0.04], [0, 0, 0], [1.08, 1.0]) // shaggy hair hanging under the belly
      .box(0.06, 0.12, 0.3, shade, [0.15, 0.7, 0.26]) // and the shaggy 'trousers' on the forelegs' tops
      .box(0.06, 0.12, 0.3, shade, [-0.15, 0.7, 0.26])
      .box(0.08, 0.1, 0.07, white, [0, 0.94, -0.66]) // short tail
      .build(),
    headPivot: [0, 1.02, 0.46],
    head: new Blocks()
      .box(0.16, 0.22, 0.18, white, [0, -0.04, 0.02], [0.4, 0, 0], [0.85, 0.9]) // neck
      .box(0.17, 0.18, 0.3, white, [0, 0.04, 0.2], [0.35, 0, 0], [0.8, 0.85]) // long narrow face
      .box(0.08, 0.14, 0.08, shade, [0, -0.12, 0.22], [0.2, 0, 0]) // the beard
      .box(0.06, 0.04, 0.03, black, [0, -0.04, 0.37]) // nose
      .eyes(0.03, 0.03, 0.02, 0xb88a3a, [0.07, 0.1, 0.24], 'bar') // eyes
      .box(0.035, 0.18, 0.035, black, [0.05, 0.22, 0.1], [-0.5, 0, 0], [0.4, 0.4]) // short black horns, swept back
      .box(0.035, 0.18, 0.035, black, [-0.05, 0.22, 0.1], [-0.5, 0, 0], [0.4, 0.4])
      .box(0.08, 0.04, 0.03, white, [0.1, 0.14, 0.06], [0, 0, -0.4]) // ears
      .box(0.08, 0.04, 0.03, white, [-0.1, 0.14, 0.06], [0, 0, 0.4])
      .build(),
    antlers: null,
    fore: limb(0.27, 0.27, { top: [0.12, 0.14], knee: [0.075, 0.075], ankle: [0.065, 0.065], color: white, low: shade, foot: [0.08, 0.06, 0.09, black, 0.01] }),
    hind: limb(0.28, 0.26, { top: [0.13, 0.17], knee: [0.075, 0.08], ankle: [0.065, 0.065], color: white, low: shade, foot: [0.08, 0.06, 0.09, black, 0.01] }),
    legs: [[0.11, 0.56, 0.3], [-0.11, 0.56, 0.3], [0.11, 0.56, -0.5], [-0.11, 0.56, -0.5]],
    torso: [[0, 0.84, -0.1, 0.16, 0.2, 0.6]],
    skull: [0, 0.04, 0.2, 0.1, 0.12, 0.18],
  };
}

/**
 * A crocodile: long and low, armoured in rows of raised dark scutes down
 * its back and tail, olive-grey with a pale belly, a long flat snout with
 * a ragged row of teeth showing, eyes and nostrils raised on top of the
 * head, a heavy tail tapering to a point, short legs sprawled out at its sides.
 */
export function crocodile() {
  const hide = 0x4a5a3a, dark = 0x2e3a26, belly = 0xb8b48a, tooth = 0xf0ead8;
  const body = new Blocks()
    .box(0.6, 0.3, 0.9, hide, [0, 0.3, 0.1], [0, 0, 0], [0.85, 0.9]) // broad flat body
    .box(0.5, 0.06, 0.9, belly, [0, 0.14, 0.1]) // pale belly
    .box(0.42, 0.26, 0.6, hide, [0, 0.27, -0.6], [0, 0, 0], [0.8, 0.85]) // the tail's thick root
    .box(0.3, 0.2, 0.6, hide, [0, 0.22, -1.15], [0, 0, 0], [0.75, 0.8]) // tapering...
    .box(0.18, 0.14, 0.6, hide, [0, 0.18, -1.7], [0, 0, 0], [0.7, 0.75])
    .box(0.08, 0.08, 0.5, hide, [0, 0.16, -2.2], [0, 0, 0], [0.6, 0.6]); // ...to a point
  // Rows of raised scutes down the back, a double crest down the tail.
  for (let k = 0; k < 7; k++) {
    const z = 0.48 - k * 0.14;
    body.box(0.07, 0.06, 0.08, dark, [0.13, 0.47, z]);
    body.box(0.07, 0.06, 0.08, dark, [-0.13, 0.47, z]);
    body.box(0.06, 0.05, 0.07, dark, [0.24, 0.42, z + 0.05]);
    body.box(0.06, 0.05, 0.07, dark, [-0.24, 0.42, z + 0.05]);
  }
  for (let k = 0; k < 10; k++) {
    const z = -0.45 - k * 0.2, s = 1 - k * 0.07;
    body.box(0.04, 0.09 * s, 0.1, dark, [0.07 * s, 0.4 - k * 0.022, z]);
    body.box(0.04, 0.09 * s, 0.1, dark, [-0.07 * s, 0.4 - k * 0.022, z]);
  }
  const head = new Blocks()
    .box(0.34, 0.2, 0.3, hide, [0, 0.02, 0.1], [0, 0, 0], [0.9, 0.9]) // the back of the head
    .box(0.24, 0.12, 0.6, hide, [0, -0.02, 0.5], [0, 0, 0], [0.75, 0.9]) // long flat snout
    .box(0.22, 0.06, 0.62, belly, [0, -0.1, 0.48]) // pale underjaw
    .box(0.1, 0.06, 0.08, hide, [0, 0.06, 0.78]) // nostrils raised at the tip
    .box(0.07, 0.07, 0.07, dark, [0.1, 0.13, 0.12]) // eyes raised on top
    .box(0.07, 0.07, 0.07, dark, [-0.1, 0.13, 0.12])
    .eyes(0.03, 0.03, 0.02, 0xc8b040, [0.1, 0.15, 0.155], 'slit'); // yellow eyes
  for (let k = 0; k < 6; k++) {
    const z = 0.3 + k * 0.09;
    head.box(0.02, 0.05, 0.02, tooth, [0.11 - k * 0.006, -0.07, z]); // the ragged row of teeth
    head.box(0.02, 0.05, 0.02, tooth, [-0.11 + k * 0.006, -0.07, z]);
  }
  return {
    body: body.build(),
    headPivot: [0, 0.3, 0.6],
    head: head.build(),
    antlers: null,
    // (Short, bent legs splayed out at its sides, on broad clawed feet.)
    fore: limb(0.14, 0.14, { top: [0.14, 0.16], knee: [0.1, 0.11], ankle: [0.09, 0.09], color: hide, foot: [0.16, 0.04, 0.16, dark, 0.04] }),
    hind: limb(0.15, 0.14, { top: [0.16, 0.2], knee: [0.11, 0.12], ankle: [0.09, 0.1], color: hide, foot: [0.18, 0.04, 0.18, dark, 0.04] }),
    legs: [[0.32, 0.28, 0.38], [-0.32, 0.28, 0.38], [0.3, 0.28, -0.3], [-0.3, 0.28, -0.3]],
    torso: [[0, 0.3, -0.3, 0.3, 0.17, 1.3]],
    skull: [0, 0.0, 0.4, 0.17, 0.11, 0.42],
  };
}

/**
 * A jaguar: stockier and heavier than a leopard, golden-yellow covered in
 * black rosettes (rings with a dark spot inside), a big broad head and
 * powerful jaw, thick legs, a shorter tail; pale belly and throat.
 */
export function jaguar() {
  const coat = 0xd8a640, pale = 0xf0e4c8, ring = 0x1a1410, inner = 0xa87428;
  const body = new Blocks()
    .box(0.4, 0.42, 0.44, coat, [0, 0.7, 0.34], [0, 0, 0], [0.85, 0.9]) // deep, powerful chest
    .box(0.36, 0.36, 0.66, coat, [0, 0.7, -0.12], [0, 0, 0], [0.9, 1]) // thickset body
    .box(0.38, 0.4, 0.34, coat, [0, 0.72, -0.54], [0, 0, 0], [0.85, 0.9]) // hips
    .box(0.28, 0.07, 1.1, pale, [0, 0.5, -0.08]); // pale belly
  // The rosettes: dark rings, each round a darker spot, all over the flanks and back.
  const spots = [[0.19, 0.74, 0.36], [0.19, 0.64, 0.2], [0.185, 0.78, 0.04], [0.18, 0.66, -0.12], [0.185, 0.76, -0.3], [0.19, 0.66, -0.46], [0.19, 0.78, -0.6]];
  for (const [x, y, z] of spots) {
    for (const s of [1, -1]) {
      body.box(0.02, 0.1, 0.11, ring, [s * x, y, z]);
      body.box(0.022, 0.05, 0.05, inner, [s * (x + 0.002), y, z]);
    }
  }
  for (let k = 0; k < 6; k++) body.box(0.07, 0.025, 0.07, ring, [(k % 2 ? 0.07 : -0.07), 0.89, 0.4 - k * 0.19]); // spots along the back
  body.box(0.085, 0.085, 0.36, coat, [0, 0.62, -0.86], [-0.9, 0, 0], [0.95, 0.95]); // the shorter tail
  body.box(0.09, 0.03, 0.09, ring, [0, 0.52, -0.92]);
  body.box(0.08, 0.08, 0.26, coat, [0, 0.4, -1.02], [-0.3, 0, 0]);
  body.box(0.075, 0.075, 0.1, ring, [0, 0.33, -1.14]);
  return {
    body: body.build(),
    headPivot: [0, 0.86, 0.6],
    head: new Blocks()
      .box(0.28, 0.28, 0.26, coat, [0, -0.06, 0.0], [0.5, 0, 0], [0.85, 0.9]) // thick neck
      .box(0.34, 0.27, 0.28, coat, [0, 0.04, 0.17], [0, 0, 0], [0.92, 0.92]) // big broad head
      .box(0.22, 0.14, 0.16, pale, [0, -0.05, 0.34]) // heavy pale jaw and muzzle
      .box(0.08, 0.05, 0.04, 0x5a3a2a, [0, 0.0, 0.43]) // nose
      .eyes(0.05, 0.035, 0.02, 0xd8b040, [0.08, 0.08, 0.32], 'round') // amber eyes
      .box(0.04, 0.04, 0.02, ring, [0.12, 0.15, 0.3]) // spots on the face
      .box(0.04, 0.04, 0.02, ring, [-0.12, 0.15, 0.3])
      .box(0.035, 0.035, 0.02, ring, [0, 0.18, 0.31])
      .box(0.09, 0.09, 0.05, coat, [0.13, 0.2, 0.1], [0, 0, 0.25], [0.6, 0.6]) // small round ears
      .box(0.09, 0.09, 0.05, coat, [-0.13, 0.2, 0.1], [0, 0, -0.25], [0.6, 0.6])
      .build(),
    antlers: null,
    fore: limb(0.28, 0.28, { top: [0.17, 0.2], knee: [0.13, 0.13], ankle: [0.11, 0.11], color: coat, foot: [0.16, 0.06, 0.17, pale, 0.03] }),
    hind: limb(0.3, 0.27, { top: [0.18, 0.25], knee: [0.12, 0.12], ankle: [0.1, 0.1], color: coat, foot: [0.16, 0.06, 0.17, pale, 0.03] }),
    legs: [[0.14, 0.56, 0.4], [-0.14, 0.56, 0.4], [0.14, 0.56, -0.56], [-0.14, 0.56, -0.56]],
    torso: [[0, 0.72, -0.1, 0.21, 0.24, 0.72]],
    neck: [0, -0.06, 0.0, 0.15, 0.15, 0.13],
    skull: [0, 0.04, 0.2, 0.17, 0.14, 0.2],
  };
}

/**
 * A howler monkey (dark, long-limbed, long prehensile tail), drawn sitting
 * up: its arms (as a bird's wings, see Wildlife) hang from the shoulders
 * and reach up when it climbs and leaps. About half a metre sitting.
 */
export function monkey() {
  const fur = 0x3a2a1e, dark = 0x24180f, face = 0x1a1210, gold = 0x7a5a32;
  const arm = (side) =>
    new Blocks()
      .box(0.07, 0.2, 0.07, fur, [side * 0.01, -0.1, 0]) // upper arm, hanging from the shoulder
      .box(0.06, 0.2, 0.06, fur, [side * 0.01, -0.28, 0.02]) // forearm
      .box(0.07, 0.05, 0.08, dark, [side * 0.01, -0.4, 0.03]) // hand
      .build();
  return {
    body: new Blocks()
      .box(0.22, 0.3, 0.17, fur, [0, 0.3, 0], [0, 0, 0], [0.85, 0.85]) // upright body
      .box(0.2, 0.12, 0.16, gold, [0, 0.4, -0.02], [0, 0, 0], [0.8, 0.9]) // golden-brown back of the shoulders
      .box(0.16, 0.15, 0.15, fur, [0, 0.52, 0.03], [0, 0, 0], [0.9, 0.9]) // head
      .box(0.11, 0.08, 0.06, face, [0, 0.5, 0.11]) // dark bare face
      .eyes(0.03, 0.025, 0.02, 0x8a5a2a, [0.035, 0.53, 0.14], 'round') // eyes
      .box(0.1, 0.06, 0.08, dark, [0, 0.44, 0.1]) // the bearded throat (the howler's)
      .box(0.08, 0.08, 0.22, fur, [0.07, 0.13, 0.09]) // thighs, folded up as it sits
      .box(0.08, 0.08, 0.22, fur, [-0.07, 0.13, 0.09])
      .box(0.06, 0.15, 0.06, fur, [0.08, 0.07, 0.19]) // shins
      .box(0.06, 0.15, 0.06, fur, [-0.08, 0.07, 0.19])
      .box(0.05, 0.05, 0.3, fur, [0, 0.12, -0.2], [0.4, 0, 0]) // the long tail, hanging down behind...
      .box(0.045, 0.045, 0.28, fur, [0, -0.06, -0.33], [1.2, 0, 0])
      .box(0.04, 0.04, 0.16, dark, [0, -0.22, -0.3], [2.3, 0, 0]) // ...curling at its tip
      .build(),
    wingL: arm(1),
    wingR: arm(-1),
  };
}
