import { BoxGeometry, BufferAttribute, Color, Vector3 } from 'three';
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
    // (A small dark block out to one side up front: an eye, for its shine in torchlight. See eyes.)
    if (!this.eye && x > 0.02 && w <= 0.06 && h <= 0.07 && d <= 0.06 && color <= 0x202020) this.eye = [x, y, z + d / 2];
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
    this.eye = [x, y, front]; // (where its eyes catch a light at night: see Wildlife, the eyeshine)
    const [pw, ph] = pupil === 'slit' ? [w * 0.2, h * 0.85] : pupil === 'bar' ? [w * 0.7, h * 0.28] : [w * 0.5, h * 0.55];
    for (const sx of [1, -1]) {
      this.box(w, h, d, iris, [sx * x, y, z]);
      this.box(pw, ph, 0.006, 0x050404, [sx * x, y, front + 0.002]);
      this.box(w * 0.24, h * 0.26, 0.004, 0xf2f0ea, [sx * (x + w * 0.2), y + h * 0.22, front + 0.005]); // (the glint)
    }
    return this;
  }

  /**
   * An ear (a block, as box): kept apart from the head, so it can turn on
   * its own (pricked, laid back, flicked at a fly), about its root: where
   * the first block on that side is nearest the middle of the head. Those
   * that follow on the same side (the pale inside of it, a dark tip) go
   * with it.
   */
  ear(w, h, d, color, at, rot, taper) {
    this.box(w, h, d, color, at, rot, taper);
    const g = this.parts.pop(), side = at[0] >= 0 ? 'L' : 'R';
    this.earParts ??= { L: [], R: [] };
    this.earRoot ??= {};
    if (!this.earRoot[side]) {
      const p = g.attributes.position, seen = new Map();
      for (let k = 0; k < p.count; k++) seen.set(`${p.getX(k).toFixed(4)},${p.getY(k).toFixed(4)},${p.getZ(k).toFixed(4)}`, [p.getX(k), p.getY(k), p.getZ(k)]);
      const near = [...seen.values()].sort((a, b) => Math.hypot(a[0], a[1], a[2] - at[2]) - Math.hypot(b[0], b[1], b[2] - at[2])).slice(0, 4);
      this.earRoot[side] = [0, 1, 2].map((i) => near.reduce((s, v) => s + v[i], 0) / near.length);
    }
    this.earParts[side].push(g);
    return this;
  }

  build() {
    const g = mergeGeometries(this.parts);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    if (this.eye) g.userData.eye = this.eye;
    // (The ears, each about its own root: see ear.)
    if (this.earParts) {
      g.userData.ears = {};
      for (const side of ['L', 'R']) {
        if (!this.earParts[side].length) continue;
        const e = mergeGeometries(this.earParts[side]), [x, y, z] = this.earRoot[side];
        e.translate(-x, -y, -z);
        e.computeVertexNormals();
        e.computeBoundingSphere();
        g.userData.ears[side] = { geometry: e, root: [x, y, z] };
      }
    }
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
    .ear(0.05, 0.2, 0.12, coat, [0.15, 0.74, 0.16], [0, 0.3, -0.7], [0.6, 0.6]) // ears
    .ear(0.05, 0.2, 0.12, coat, [-0.15, 0.74, 0.16], [0, -0.3, 0.7], [0.6, 0.6])
    .ear(0.02, 0.14, 0.08, 0xe8c8b0, [0.17, 0.74, 0.18], [0, 0.3, -0.7])
    .ear(0.02, 0.14, 0.08, 0xe8c8b0, [-0.17, 0.74, 0.18], [0, -0.3, 0.7]);
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
    tailAt: -0.835,
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
      .ear(0.12, 0.08, 0.12, shag, [0.38, 0.08, 0.2]) // ears
      .ear(0.12, 0.08, 0.12, shag, [-0.38, 0.08, 0.2])
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
      .ear(0.08, 0.22, 0.12, coat, [0.2, 0.24, 0.4], [0, 0.3, -0.9], [0.6, 0.6]) // ears
      .ear(0.08, 0.22, 0.12, coat, [-0.2, 0.24, 0.4], [0, -0.3, 0.9], [0.6, 0.6])
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
      .ear(0.045, ear, 0.025, fur, [0.04, 0.08 + ear / 2, 0.02], [-0.25, 0, -0.12], [0.7, 1]) // long ears
      .ear(0.045, ear, 0.025, fur, [-0.04, 0.08 + ear / 2, 0.02], [-0.25, 0, 0.12], [0.7, 1])
      .ear(0.025, ear * 0.75, 0.01, hare ? dark : pink, [0.04, 0.08 + ear / 2, 0.035], [-0.25, 0, -0.12]) // (a hare's ears tipped black)
      .ear(0.025, ear * 0.75, 0.01, hare ? dark : pink, [-0.04, 0.08 + ear / 2, 0.035], [-0.25, 0, 0.12])
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
      .ear(0.12, 0.12, 0.06, coat, [0.18, 0.25, 0.1]) // round ears
      .ear(0.12, 0.12, 0.06, coat, [-0.18, 0.25, 0.1])
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
      .ear(0.08, 0.1, 0.05, coat, [0.09, 0.17, 0.02], [0, 0, 0.2], [0.35, 0.5]) // short rounded ears
      .ear(0.08, 0.1, 0.05, coat, [-0.09, 0.17, 0.02], [0, 0, -0.2], [0.35, 0.5])
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
      .ear(0.08, 0.17, 0.04, coat, [0.07, 0.18, 0.02], [0, 0, 0.12], [0.2, 0.4]) // big tall ears
      .ear(0.08, 0.17, 0.04, coat, [-0.07, 0.18, 0.02], [0, 0, -0.12], [0.2, 0.4])
      .ear(0.05, 0.1, 0.01, pale, [0.07, 0.16, 0.045], [0, 0, 0.12], [0.3, 0.4]) // pale inner ears
      .ear(0.05, 0.1, 0.01, pale, [-0.07, 0.16, 0.045], [0, 0, -0.12], [0.3, 0.4])
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
      .ear(0.08, 0.15, 0.04, black, [0.07, 0.17, 0.0], [0, 0, 0.15], [0.2, 0.4]) // black-backed ears
      .ear(0.08, 0.15, 0.04, black, [-0.07, 0.17, 0.0], [0, 0, -0.15], [0.2, 0.4])
      .ear(0.05, 0.09, 0.01, white, [0.07, 0.15, 0.025], [0, 0, 0.15], [0.3, 0.4])
      .ear(0.05, 0.09, 0.01, white, [-0.07, 0.15, 0.025], [0, 0, -0.15], [0.3, 0.4])
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
      .ear(0.14, 0.05, 0.05, face, [0.13, 0.04, 0.04], [0, 0, -0.3]) // ears, out sideways
      .ear(0.14, 0.05, 0.05, face, [-0.13, 0.04, 0.04], [0, 0, 0.3])
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
      .ear(0.08, 0.12, 0.04, coat, [0.12, 0.2, 0.06], [0.3, 0, -0.3], [0.4, 0.6]) // small pointed ears
      .ear(0.08, 0.12, 0.04, coat, [-0.12, 0.2, 0.06], [0.3, 0, 0.3], [0.4, 0.6])
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
      .ear(0.07, 0.07, 0.04, coat, [0.08, 0.16, 0.1], [0, 0, 0.2], [0.6, 0.6]) // small round ears
      .ear(0.07, 0.07, 0.04, coat, [-0.08, 0.16, 0.1], [0, 0, -0.2], [0.6, 0.6])
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
 * A beaver: a heavy brown body low in the water, the broad flat scaly tail
 * behind, a blunt head with small round ears and the orange front teeth.
 */
export function beaver() {
  const fur = 0x6a4a30, dark = 0x4a3222, tail = 0x2a2420, teeth = 0xe08a30;
  return {
    body: new Blocks()
      .box(0.34, 0.28, 0.6, fur, [0, 0.2, -0.02], [0, 0, 0], [0.85, 0.85])
      .box(0.28, 0.08, 0.5, dark, [0, 0.33, -0.04])
      .box(0.22, 0.04, 0.36, tail, [0, 0.14, -0.48], [0.12, 0, 0]) // (the flat paddle of a tail)
      .build(),
    headPivot: [0, 0.26, 0.26],
    head: new Blocks()
      .box(0.2, 0.17, 0.2, fur, [0, 0.02, 0.06], [0, 0, 0], [0.9, 0.9])
      .box(0.13, 0.1, 0.08, dark, [0, -0.01, 0.17])
      .box(0.05, 0.05, 0.02, teeth, [0, -0.06, 0.2])
      .eyes(0.025, 0.025, 0.02, 0x1a1008, [0.07, 0.06, 0.13], 'round')
      .box(0.04, 0.04, 0.02, dark, [0.08, 0.11, 0.04])
      .box(0.04, 0.04, 0.02, dark, [-0.08, 0.11, 0.04])
      .build(),
    antlers: null,
    fore: limb(0.07, 0.06, { top: [0.06, 0.06], knee: [0.04, 0.04], color: dark, foot: [0.06, 0.02, 0.07, dark, 0.02] }),
    hind: limb(0.08, 0.07, { top: [0.08, 0.08], knee: [0.05, 0.05], color: dark, foot: [0.09, 0.02, 0.12, tail, 0.03] }),
    legs: [[0.1, 0.12, 0.16], [-0.1, 0.12, 0.16], [0.11, 0.14, -0.16], [-0.11, 0.14, -0.16]],
    torso: [[0, 0.2, 0, 0.15, 0.13, 0.27]],
    skull: [0, 0.02, 0.1, 0.09, 0.08, 0.11],
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
/**
 * Another player: a low-poly walker in a shirt of their colour, with a pack
 * on their back. Parts, each about its own joint (for swinging): the body
 * (hips at y = 0.92), the head (neck), the arms (shoulders) and the legs
 * (hips), and the arms and legs again in two (see upperArm). About 1.8 m tall.
 */
export function person(shirt = 0x3a86c8) {
  const skin = 0xd8a47a, hair = 0x3a2a1e, trousers = 0x3a3a44, boots = 0x2a2018, pack = 0x7a5a32;
  return {
    body: new Blocks()
      .box(0.36, 0.5, 0.2, shirt, [0, 0.26, 0], [0, 0, 0], [0.92, 0.9]) // chest
      .box(0.34, 0.12, 0.19, trousers, [0, -0.02, 0]) // belt and hips
      .box(0.3, 0.36, 0.14, pack, [0, 0.3, -0.17]) // the pack
      .box(0.26, 0.08, 0.14, 0x5a4024, [0, 0.5, -0.17]) // its flap
      .build(),
    head: new Blocks()
      .box(0.08, 0.08, 0.08, skin, [0, 0.04, 0]) // neck
      .box(0.22, 0.24, 0.22, skin, [0, 0.19, 0.01]) // head
      .box(0.24, 0.08, 0.24, hair, [0, 0.31, -0.005]) // hair
      .box(0.24, 0.14, 0.05, hair, [0, 0.22, -0.1])
      .box(0.035, 0.03, 0.01, 0x1a1410, [0.05, 0.2, 0.125]) // eyes
      .box(0.035, 0.03, 0.01, 0x1a1410, [-0.05, 0.2, 0.125])
      .build(),
    arm: new Blocks()
      .box(0.1, 0.32, 0.11, shirt, [0, -0.16, 0]) // sleeve
      .box(0.085, 0.26, 0.09, skin, [0, -0.45, 0]) // forearm
      .box(0.09, 0.08, 0.09, skin, [0, -0.62, 0.01]) // hand
      .build(),
    leg: new Blocks()
      .box(0.14, 0.46, 0.15, trousers, [0, -0.23, 0])
      .box(0.12, 0.38, 0.13, trousers, [0, -0.62, 0])
      .box(0.13, 0.1, 0.22, boots, [0, -0.86, 0.04]) // boot
      .build(),    // (The same limbs in two, to bend: the upper arm from the shoulder,
    // the forearm and hand from the elbow, 0.32 down; the thigh from the
    // hip, the shin and boot from the knee, 0.44 down.)
    upperArm: new Blocks().box(0.1, 0.34, 0.11, shirt, [0, -0.16, 0]).build(),
    forearm: new Blocks()
      .box(0.085, 0.28, 0.09, skin, [0, -0.13, 0])
      .box(0.09, 0.08, 0.09, skin, [0, -0.3, 0.01])
      .build(),
    thigh: new Blocks().box(0.14, 0.48, 0.15, trousers, [0, -0.22, 0]).build(),
    shin: new Blocks()
      .box(0.12, 0.4, 0.13, trousers, [0, -0.18, 0])
      .box(0.13, 0.1, 0.22, boots, [0, -0.42, 0.04]) // boot
      .build(),
  };
}

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
      .ear(0.1, 0.1, 0.05, coat, [0.13, 0.22, 0.1], [0, 0, 0.2], [0.6, 0.6]) // small round ears
      .ear(0.1, 0.1, 0.05, coat, [-0.13, 0.22, 0.1], [0, 0, -0.2], [0.6, 0.6])
      .ear(0.05, 0.05, 0.01, white, [0.13, 0.22, 0.075]) // white marks behind them
      .ear(0.05, 0.05, 0.01, white, [-0.13, 0.22, 0.075])
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
      .ear(0.08, 0.08, 0.04, coat, [0.1, 0.18, 0.1], [0, 0, 0.25], [0.6, 0.6]) // small round ears
      .ear(0.08, 0.08, 0.04, coat, [-0.1, 0.18, 0.1], [0, 0, -0.25], [0.6, 0.6])
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
      .ear(0.15, 0.14, 0.08, black, [0.2, 0.28, 0.08]) // round black ears
      .ear(0.15, 0.14, 0.08, black, [-0.2, 0.28, 0.08])
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
      .ear(0.08, 0.04, 0.03, white, [0.1, 0.14, 0.06], [0, 0, -0.4]) // ears
      .ear(0.08, 0.04, 0.03, white, [-0.1, 0.14, 0.06], [0, 0, 0.4])
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
 * A goat (gone wild in the hills; tamed, kept for its milk): short-haired,
 * brown with a dark stripe down its back and dark legs, a pale belly and
 * muzzle, ridged horns sweeping up and back, a short tail held up, a
 * beard, ears out sideways.
 */
export function goat() {
  const coat = 0x8a6038, dark = 0x3a2a1e, pale = 0xd8c8a8, horn = 0x9a8a70, black = 0x18161a;
  return {
    body: new Blocks()
      .box(0.3, 0.34, 0.36, coat, [0, 0.8, 0.24], [0, 0, 0], [0.82, 0.9]) // chest
      .box(0.28, 0.3, 0.56, coat, [0, 0.8, -0.16], [0, 0, 0], [0.9, 0.95]) // barrel
      .box(0.28, 0.28, 0.24, coat, [0, 0.82, -0.46], [0, 0, 0], [0.85, 0.9]) // hindquarters
      .box(0.06, 0.03, 0.9, dark, [0, 0.97, -0.08]) // the dark stripe down its back
      .box(0.22, 0.06, 0.6, pale, [0, 0.64, -0.06]) // pale belly
      .box(0.05, 0.12, 0.05, dark, [0, 0.98, -0.6], [-0.7, 0, 0]) // short tail, up
      .build(),
    headPivot: [0, 0.98, 0.42],
    head: new Blocks()
      .box(0.14, 0.22, 0.16, coat, [0, -0.04, 0.02], [0.4, 0, 0], [0.85, 0.9]) // neck
      .box(0.15, 0.16, 0.28, coat, [0, 0.04, 0.2], [0.35, 0, 0], [0.8, 0.85]) // face
      .box(0.1, 0.1, 0.1, pale, [0, -0.02, 0.33], [0.35, 0, 0]) // pale muzzle
      .box(0.05, 0.12, 0.05, dark, [0, -0.12, 0.24], [0.2, 0, 0]) // beard
      .box(0.05, 0.03, 0.03, black, [0, 0.0, 0.39]) // nose
      .eyes(0.03, 0.03, 0.02, 0xc8a040, [0.065, 0.1, 0.22], 'bar') // eyes (a goat's: barred)
      .box(0.035, 0.24, 0.04, horn, [0.045, 0.24, 0.06], [-0.75, 0, 0.1], [0.45, 0.4]) // ridged horns, up and back
      .box(0.035, 0.24, 0.04, horn, [-0.045, 0.24, 0.06], [-0.75, 0, -0.1], [0.45, 0.4])
      .ear(0.11, 0.035, 0.05, coat, [0.11, 0.12, 0.06], [0, 0, -0.15]) // ears, out to the sides
      .ear(0.11, 0.035, 0.05, coat, [-0.11, 0.12, 0.06], [0, 0, 0.15])
      .build(),
    antlers: null,
    fore: limb(0.26, 0.26, { top: [0.1, 0.12], knee: [0.065, 0.065], ankle: [0.055, 0.055], color: coat, low: dark, foot: [0.07, 0.05, 0.08, black, 0.01] }),
    hind: limb(0.27, 0.25, { top: [0.12, 0.15], knee: [0.065, 0.07], ankle: [0.055, 0.055], color: coat, low: dark, foot: [0.07, 0.05, 0.08, black, 0.01] }),
    legs: [[0.1, 0.53, 0.28], [-0.1, 0.53, 0.28], [0.1, 0.53, -0.46], [-0.1, 0.53, -0.46]],
    torso: [[0, 0.8, -0.08, 0.15, 0.18, 0.56]],
    skull: [0, 0.04, 0.2, 0.09, 0.11, 0.17],
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
    tailAt: -0.32, // (its long tail, from just behind the hind legs)
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
      .ear(0.09, 0.09, 0.05, coat, [0.13, 0.2, 0.1], [0, 0, 0.25], [0.6, 0.6]) // small round ears
      .ear(0.09, 0.09, 0.05, coat, [-0.13, 0.2, 0.1], [0, 0, -0.25], [0.6, 0.6])
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

// --- The savanna, the desert, the jungle's water, the caves, the high hills --

/**
 * A lion: tawny and plain, lean, the tail ending in a dark tuft; a
 * lioness as she is; a male (`antlers`, drawn on the head) with his great
 * dark mane, which marks him out a long way off.
 */
export function lion() {
  const coat = 0xc49a62, back = 0xb08654, pale = 0xe6d6b8, dark = 0x3a2a1c, mane = 0x6a4424;
  return {
    body: new Blocks()
      .box(0.42, 0.46, 0.46, coat, [0, 0.82, 0.4], [0, 0, 0], [0.85, 0.9]) // deep chest
      .box(0.36, 0.38, 0.76, coat, [0, 0.8, -0.12], [0, 0, 0], [0.9, 1]) // lean flank
      .box(0.38, 0.42, 0.38, coat, [0, 0.82, -0.6], [0, 0, 0], [0.85, 0.9]) // hips
      .box(0.22, 0.05, 1.4, back, [0, 1.04, -0.1]) // darker along the back
      .box(0.26, 0.07, 1.0, pale, [0, 0.6, -0.05]) // pale belly
      .box(0.08, 0.08, 0.44, coat, [0, 0.72, -0.96], [-1.0, 0, 0], [0.95, 0.95]) // the tail
      .box(0.075, 0.075, 0.36, coat, [0, 0.42, -1.14], [-0.25, 0, 0])
      .box(0.11, 0.11, 0.14, dark, [0, 0.36, -1.34], [0.5, 0, 0]) // its dark tuft
      .build(),
    headPivot: [0, 1.0, 0.68],
    head: new Blocks()
      .box(0.3, 0.3, 0.26, coat, [0, -0.08, 0.0], [0.5, 0, 0], [0.85, 0.9]) // neck
      .box(0.32, 0.28, 0.3, coat, [0, 0.04, 0.18], [0, 0, 0], [0.9, 0.9]) // long head
      .box(0.2, 0.15, 0.2, pale, [0, -0.04, 0.36]) // muzzle
      .box(0.08, 0.05, 0.04, 0x3a2420, [0, 0.01, 0.46]) // dark nose
      .eyes(0.045, 0.03, 0.02, 0xc89a40, [0.08, 0.09, 0.33], 'round') // amber eyes
      .ear(0.08, 0.08, 0.05, coat, [0.12, 0.2, 0.1], [0, 0, 0.2], [0.6, 0.6]) // round ears
      .ear(0.08, 0.08, 0.05, coat, [-0.12, 0.2, 0.1], [0, 0, -0.2], [0.6, 0.6])
      .build(),
    // A male's mane: a great dark ruff round the head and down the neck and chest.
    antlers: new Blocks()
      .box(0.62, 0.6, 0.34, mane, [0, 0.02, 0.06], [0, 0, 0], [0.8, 0.85])
      .box(0.5, 0.5, 0.3, 0x5a3a1e, [0, -0.2, -0.12], [0.4, 0, 0])
      .box(0.42, 0.14, 0.2, mane, [0, 0.3, 0.1])
      .build(),
    fore: limb(0.31, 0.33, { top: [0.17, 0.2], knee: [0.12, 0.13], ankle: [0.1, 0.1], color: coat, foot: [0.16, 0.06, 0.18, pale, 0.03] }),
    hind: limb(0.33, 0.32, { top: [0.19, 0.26], knee: [0.11, 0.12], ankle: [0.09, 0.09], color: coat, foot: [0.16, 0.06, 0.18, pale, 0.03] }),
    legs: [[0.14, 0.64, 0.46], [-0.14, 0.64, 0.46], [0.14, 0.65, -0.62], [-0.14, 0.65, -0.62]],
    torso: [[0, 0.82, -0.1, 0.21, 0.25, 0.78]],
    neck: [0, -0.08, 0.0, 0.15, 0.15, 0.13],
    skull: [0, 0.03, 0.2, 0.17, 0.15, 0.2],
  };
}

/**
 * A spotted hyena: high, heavy shoulders and a sloping back down to low
 * hindquarters, a thick neck, a broad blunt head with round ears, a
 * dingy coat blotched with dark spots, a short bushy dark tail.
 */
export function hyena() {
  const coat = 0xa89070, dark = 0x3a2e24, pale = 0xc8b898;
  const body = new Blocks()
    .box(0.3, 0.4, 0.38, coat, [0, 0.72, 0.28], [0, 0, 0], [0.85, 0.9]) // big shoulders
    .box(0.26, 0.32, 0.5, coat, [0, 0.64, -0.08], [-0.15, 0, 0], [0.9, 1]) // sloping back
    .box(0.24, 0.28, 0.28, coat, [0, 0.54, -0.42], [0, 0, 0], [0.85, 0.9]) // low hips
    .box(0.12, 0.08, 0.5, dark, [0, 0.92, 0.2]) // a short dark mane on the shoulders
    .box(0.1, 0.1, 0.26, dark, [0, 0.5, -0.62], [-0.9, 0, 0]); // the bushy tail
  for (let k = 0; k < 12; k++) {
    const z = 0.4 - k * 0.08, y = 0.6 + ((k * 37) % 7) * 0.025, sx = k % 2 ? 1 : -1;
    body.box(0.02, 0.06, 0.06, dark, [sx * (0.14 - k * 0.003), y, z]); // spots
  }
  return {
    body: body.build(),
    headPivot: [0, 0.84, 0.48],
    head: new Blocks()
      .box(0.22, 0.24, 0.22, coat, [0, -0.06, 0.0], [0.5, 0, 0], [0.85, 0.9]) // thick neck
      .box(0.22, 0.2, 0.22, coat, [0, 0.02, 0.16]) // broad head
      .box(0.14, 0.12, 0.16, dark, [0, -0.04, 0.32]) // dark blunt muzzle
      .eyes(0.035, 0.028, 0.02, 0x8a6a2a, [0.07, 0.07, 0.27], 'round')
      .ear(0.09, 0.1, 0.04, coat, [0.09, 0.16, 0.08], [0, 0, 0.3], [0.6, 0.6]) // round ears
      .ear(0.09, 0.1, 0.04, coat, [-0.09, 0.16, 0.08], [0, 0, -0.3], [0.6, 0.6])
      .build(),
    antlers: null,
    fore: limb(0.3, 0.3, { top: [0.12, 0.15], knee: [0.08, 0.09], ankle: [0.07, 0.07], color: coat, foot: [0.1, 0.05, 0.12, dark, 0.03] }),
    hind: limb(0.22, 0.24, { top: [0.13, 0.18], knee: [0.08, 0.09], ankle: [0.07, 0.07], color: coat, low: pale, foot: [0.1, 0.05, 0.12, dark, 0.03] }),
    legs: [[0.11, 0.6, 0.32], [-0.11, 0.6, 0.32], [0.1, 0.46, -0.44], [-0.1, 0.46, -0.44]],
    torso: [[0, 0.66, -0.06, 0.15, 0.2, 0.52]],
    neck: [0, -0.06, 0.0, 0.11, 0.12, 0.11],
    skull: [0, 0.0, 0.18, 0.12, 0.11, 0.18],
  };
}

/**
 * An elephant: a great grey bulk on four pillars of legs, the big flapping
 * ears, a long trunk hanging (and raised to trumpet: see `rear`), pale
 * tusks, a thin tail; wrinkled grey, a little reddened with dust.
 */
export function elephant() {
  const hide = 0x8a8682, dark = 0x6e6a66, dusty = 0x9a8a7a, tusk = 0xf0e6d0;
  const body = new Blocks()
    .box(1.5, 1.7, 1.2, hide, [0, 2.3, 0.6], [0, 0, 0], [0.85, 0.9]) // shoulders
    .box(1.45, 1.6, 1.4, hide, [0, 2.25, -0.4], [0, 0, 0], [0.88, 0.95]) // great belly
    .box(1.3, 1.5, 0.6, dusty, [0, 2.2, -1.2], [0, 0, 0], [0.8, 0.9]) // rump
    .box(0.06, 0.6, 0.06, dark, [0, 2.0, -1.55], [-0.3, 0, 0]) // thin tail
    .box(0.12, 0.14, 0.1, 0x2a2624, [0, 1.7, -1.62]) // its tuft
    .box(1.1, 0.08, 2.4, dark, [0, 3.13, -0.2]); // the ridge of the back
  return {
    body: body.build(),
    headPivot: [0, 2.8, 1.25],
    headMax: 0.35, // (it browses with its trunk: the great head hardly drops)
    head: new Blocks()
      .box(1.0, 1.1, 0.8, hide, [0, 0.0, 0.4], [0, 0, 0], [0.85, 0.85]) // great domed head
      .box(0.7, 0.3, 0.4, hide, [0, 0.5, 0.32], [0, 0, 0], [0.8, 0.8]) // the dome above the brow
      .ear(0.12, 1.2, 1.0, dark, [0.62, -0.15, 0.1], [0, 0.35, 0.08]) // ears, wide and flat
      .ear(0.12, 1.2, 1.0, dark, [-0.62, -0.15, 0.1], [0, -0.35, -0.08])
      .box(0.38, 0.6, 0.36, hide, [0, -0.62, 0.78]) // the trunk, hanging...
      .box(0.28, 0.6, 0.28, hide, [0, -1.18, 0.84])
      .box(0.21, 0.6, 0.21, hide, [0, -1.72, 0.88])
      .box(0.17, 0.12, 0.21, dark, [0, -2.04, 0.92]) // ...its tip
      .box(0.1, 0.1, 0.7, tusk, [0.26, -0.62, 0.92], [0.6, 0, 0]) // tusks, curving out
      .box(0.1, 0.1, 0.7, tusk, [-0.26, -0.62, 0.92], [0.6, 0, 0])
      .box(0.2, 0.05, 0.08, dark, [0.38, 0.22, 0.74]) // heavy brows
      .box(0.2, 0.05, 0.08, dark, [-0.38, 0.22, 0.74])
      .box(0.16, 0.13, 0.04, dark, [0.38, 0.12, 0.75]) // the wrinkled lids round the eyes
      .box(0.16, 0.13, 0.04, dark, [-0.38, 0.12, 0.75])
      .eyes(0.1, 0.08, 0.04, 0x3a2414, [0.38, 0.12, 0.76], 'round')
      .build(),
    antlers: null,
    fore: limb(0.75, 0.7, { top: [0.48, 0.5], knee: [0.42, 0.42], ankle: [0.4, 0.4], color: hide, foot: [0.46, 0.1, 0.46, dark, 0.02] }),
    hind: limb(0.75, 0.7, { top: [0.5, 0.56], knee: [0.42, 0.42], ankle: [0.4, 0.4], color: hide, foot: [0.46, 0.1, 0.46, dark, 0.02] }),
    legs: [[0.46, 1.45, 0.75], [-0.46, 1.45, 0.75], [0.44, 1.45, -1.0], [-0.44, 1.45, -1.0]],
    torso: [[0, 2.25, -0.2, 0.72, 0.85, 1.45]],
    neck: [0, -0.2, 0.1, 0.5, 0.5, 0.3],
    skull: [0, 0.0, 0.4, 0.48, 0.52, 0.4],
  };
}

/**
 * A hippo: a vast barrel of a body, grey-brown and pinkish underneath, on
 * stubby legs, the enormous head with its wide square muzzle, small ears
 * and eyes up on top (to see over the water).
 */
export function hippo() {
  const hide = 0x6e5a56, pink = 0xb08478, dark = 0x4a3c3a;
  return {
    body: new Blocks()
      .box(1.3, 1.1, 2.4, hide, [0, 1.0, -0.1], [0, 0, 0], [0.85, 0.9]) // the barrel
      .box(1.0, 0.1, 2.0, pink, [0, 0.46, -0.1]) // pinkish belly
      .box(0.1, 0.1, 0.3, dark, [0, 0.95, -1.38], [-0.6, 0, 0]) // stubby tail
      .build(),
    headPivot: [0, 1.15, 1.0],
    head: new Blocks()
      .box(0.8, 0.7, 0.5, hide, [0, 0.0, 0.1], [0, 0, 0], [0.9, 0.9]) // thick neck
      .box(0.78, 0.62, 0.7, hide, [0, -0.02, 0.55]) // the huge head
      .box(0.9, 0.42, 0.5, pink, [0, -0.14, 0.96], [0, 0, 0], [0.95, 0.9]) // the wide square muzzle
      .box(0.08, 0.08, 0.08, dark, [0.2, 0.1, 1.2]) // nostrils on top
      .box(0.08, 0.08, 0.08, dark, [-0.2, 0.1, 1.2])
      .box(0.1, 0.1, 0.1, hide, [0.26, 0.32, 0.5]) // eyes up on top
      .box(0.1, 0.1, 0.1, hide, [-0.26, 0.32, 0.5])
      .eyes(0.05, 0.04, 0.02, 0x2a1a14, [0.26, 0.34, 0.56], 'round')
      .ear(0.1, 0.1, 0.06, hide, [0.28, 0.4, 0.3]) // small ears
      .ear(0.1, 0.1, 0.06, hide, [-0.28, 0.4, 0.3])
      .box(0.06, 0.18, 0.06, 0xf0e6d0, [0.3, -0.3, 1.14]) // tusks at the corners of the mouth
      .box(0.06, 0.18, 0.06, 0xf0e6d0, [-0.3, -0.3, 1.14])
      .build(),
    antlers: null,
    fore: limb(0.26, 0.26, { top: [0.34, 0.36], knee: [0.3, 0.3], ankle: [0.28, 0.28], color: hide, foot: [0.32, 0.06, 0.32, dark, 0.02] }),
    hind: limb(0.26, 0.26, { top: [0.36, 0.4], knee: [0.3, 0.3], ankle: [0.28, 0.28], color: hide, foot: [0.32, 0.06, 0.32, dark, 0.02] }),
    legs: [[0.42, 0.52, 0.75], [-0.42, 0.52, 0.75], [0.42, 0.52, -0.9], [-0.42, 0.52, -0.9]],
    torso: [[0, 1.0, -0.1, 0.62, 0.52, 1.18]],
    neck: [0, 0.0, 0.1, 0.38, 0.33, 0.24],
    skull: [0, -0.04, 0.7, 0.42, 0.33, 0.48],
  };
}

/**
 * A dromedary camel: long legs, a sandy coat, the one high hump, a long
 * neck curving up to a small head with heavy-lidded eyes and split lip.
 */
export function camel() {
  const coat = 0xc8a878, dark = 0x9a7a52, pale = 0xe0ccaa;
  return {
    body: new Blocks()
      .box(0.62, 0.66, 1.5, coat, [0, 1.55, -0.1], [0, 0, 0], [0.85, 0.9]) // body
      .box(0.5, 0.5, 0.7, coat, [0, 2.0, -0.1], [0, 0, 0], [0.4, 0.4]) // the hump
      .box(0.06, 0.4, 0.06, coat, [0, 1.5, -0.88], [-0.3, 0, 0]) // thin tail
      .box(0.08, 0.12, 0.06, dark, [0, 1.3, -0.95]) // tufted
      .box(0.4, 0.08, 1.1, pale, [0, 1.22, -0.1]) // paler belly
      .build(),
    headPivot: [0, 1.7, 0.6],
    head: new Blocks()
      .box(0.2, 0.62, 0.22, coat, [0, -0.02, 0.24], [0.9, 0, 0]) // the neck, down and forward...
      .box(0.18, 0.56, 0.2, coat, [0, 0.3, 0.6], [-0.35, 0, 0]) // ...and up
      .box(0.2, 0.2, 0.36, coat, [0, 0.62, 0.78], [0, 0, 0], [0.8, 0.9]) // the small head
      .box(0.15, 0.13, 0.12, pale, [0, 0.56, 0.98]) // soft muzzle
      .box(0.04, 0.03, 0.02, 0x3a2a1a, [0, 0.5, 1.04]) // split lip
      .eyes(0.04, 0.03, 0.02, 0x3a2a1a, [0.09, 0.7, 0.8], 'round')
      .ear(0.05, 0.08, 0.04, coat, [0.08, 0.76, 0.66]) // little ears
      .ear(0.05, 0.08, 0.04, coat, [-0.08, 0.76, 0.66])
      .build(),
    antlers: null,
    fore: limb(0.62, 0.6, { top: [0.16, 0.2], knee: [0.11, 0.11], ankle: [0.08, 0.08], color: coat, foot: [0.18, 0.06, 0.2, dark, 0.03] }),
    hind: limb(0.62, 0.6, { top: [0.18, 0.26], knee: [0.11, 0.11], ankle: [0.08, 0.08], color: coat, foot: [0.18, 0.06, 0.2, dark, 0.03] }),
    legs: [[0.2, 1.22, 0.5], [-0.2, 1.22, 0.5], [0.2, 1.22, -0.68], [-0.2, 1.22, -0.68]],
    torso: [[0, 1.6, -0.1, 0.3, 0.38, 0.78]],
    neck: [0, 0.2, 0.4, 0.11, 0.3, 0.14],
    skull: [0, 0.62, 0.84, 0.11, 0.11, 0.2],
  };
}

/**
 * A scorpion: small, flat and dark amber, the two pincers out in front, the
 * segmented tail curled up over its back to the sting. When it rears (see
 * `rear`), the pincers lift and the sting arches over: a warning.
 */
export function scorpion() {
  const shell = 0x8a5a2a, dark = 0x4a2e16, sting = 0x2a1a0e;
  const body = new Blocks()
    .box(0.1, 0.04, 0.16, shell, [0, 0.05, 0], [0, 0, 0], [0.8, 0.85]);
  // The tail: five segments rising up over the back, then the sting.
  const segs = [[0, 0.07, -0.1, 0.2], [0, 0.11, -0.13, 0.8], [0, 0.17, -0.12, 1.4], [0, 0.21, -0.08, 2.1], [0, 0.22, -0.03, 2.6]];
  for (const [x, y, z, r] of segs) body.box(0.035, 0.035, 0.05, shell, [x, y, z], [r, 0, 0]);
  body.box(0.025, 0.025, 0.04, sting, [0, 0.2, 0.01], [3.1, 0, 0]);
  return {
    body: body.build(),
    headPivot: [0, 0.05, 0.08],
    head: new Blocks()
      .box(0.08, 0.035, 0.05, shell, [0, 0, 0.02])
      .box(0.025, 0.02, 0.08, dark, [0.05, 0, 0.07], [0, -0.4, 0]) // the arms...
      .box(0.025, 0.02, 0.08, dark, [-0.05, 0, 0.07], [0, 0.4, 0])
      .box(0.04, 0.025, 0.05, shell, [0.08, 0, 0.12]) // ...and the pincers
      .box(0.04, 0.025, 0.05, shell, [-0.08, 0, 0.12])
      .box(0.012, 0.012, 0.012, 0x0a0806, [0.015, 0.02, 0.04])
      .box(0.012, 0.012, 0.012, 0x0a0806, [-0.015, 0.02, 0.04])
      .build(),
    antlers: null,
    fore: limb(0.022, 0.025, { top: [0.014, 0.014], knee: [0.012, 0.012], ankle: [0.01, 0.01], color: dark, foot: [0.014, 0.008, 0.02, dark, 0.005] }),
    hind: limb(0.022, 0.025, { top: [0.014, 0.014], knee: [0.012, 0.012], ankle: [0.01, 0.01], color: dark, foot: [0.014, 0.008, 0.02, dark, 0.005] }),
    legs: [[0.05, 0.045, 0.04], [-0.05, 0.045, 0.04], [0.05, 0.045, -0.04], [-0.05, 0.045, -0.04]],
    torso: [[0, 0.06, -0.02, 0.06, 0.05, 0.12]],
    skull: [0, 0.0, 0.06, 0.08, 0.03, 0.08],
  };
}

/**
 * A python: long and thick, olive-brown with dark blotches, a narrow head;
 * no rattle (see snake: drawn the same way, far bigger).
 */
export function python() {
  const olive = 0x6a6a3a, dark = 0x3a3220, pale = 0xb8a878;
  return {
    segment: new Blocks()
      .box(0.08, 0.06, 0.1, olive, [0, 0.03, 0])
      .box(0.05, 0.014, 0.06, dark, [0.012, 0.062, 0], [0, 0.4, 0]) // a blotch on its back
      .box(0.07, 0.01, 0.08, pale, [0, 0.003, 0]) // paler underneath
      .build(),
    head: new Blocks()
      .box(0.07, 0.04, 0.11, olive, [0, 0.022, 0.05], [0, 0, 0], [0.8, 0.8])
      .box(0.045, 0.03, 0.05, olive, [0, 0.02, 0.12])
      .box(0.03, 0.006, 0.08, dark, [0, 0.045, 0.06])
      .box(0.012, 0.012, 0.012, 0xb8a040, [0.03, 0.035, 0.08])
      .box(0.012, 0.012, 0.012, 0xb8a040, [-0.03, 0.035, 0.08])
      .build(),
    rattle: null,
    segments: 18,
    spacing: 0.08,
  };
}

/** A bat: small, dark, all wing. */
export const bat = () => bird({ body: 0x2a2220, belly: 0x3a302a, head: 0x2a2220, beak: 0x1a1412, wing: 0x342a26, tip: 0x241c1a, tail: 0x2a2220, legs: 0x1a1412 });

/** A vulture: sooty brown-black, broad-winged, its bare head a dull red, its beak pale. */
export const vulture = () => bird({ body: 0x2a221c, belly: 0x261e18, head: 0xa86a5a, beak: 0xe2d8c4, wing: 0x2e241c, tip: 0x161210, tail: 0x241c16, legs: 0x9a8a7a });

/** A bald eagle: dark brown, the white head and tail, the yellow hooked beak. */
export const eagle = () => bird({ body: 0x3a2a1e, belly: 0x342618, head: 0xf2f0ea, beak: 0xe8c040, wing: 0x3e2c1e, tip: 0x241a12, tail: 0xf0eee8, legs: 0xe8c040 });

/**
 * A horse: a deep chest and long back on long slender legs, a long arched
 * neck with a dark mane, a long head, a flowing dark tail; bay (brown, the
 * legs, mane and tail black). A saddled one (`antlers`, drawn with the
 * body... see horseSaddle) carries a leather saddle and blanket.
 */
export function horse() {
  return equine();
}

/**
 * A horse, a donkey or a mule (they're built alike): `coat`, `dark` (mane,
 * tail, lower legs), `pale` (belly), `muzzle` (and round the eyes), how long
 * the ears (`ear`), whether the mane stands up short (`brush`) and the tail
 * is a cord with a tuft (`tuft`), as a donkey's.
 */
export function equine({ coat = 0x7a4a2a, dark = 0x1e1612, pale = 0x8a5a36, hoof = 0x2a2420, muzzle = pale, ear = 0.15, brush = false, tuft = false } = {}) {
  return {
    body: new Blocks()
      .box(0.56, 0.66, 0.64, coat, [0, 1.36, 0.5], [0, 0, 0], [0.85, 0.9]) // deep chest
      .box(0.44, 0.34, 0.3, coat, [0, 1.62, 0.66], [0.5, 0, 0], [0.7, 0.8]) // the withers, up into the neck
      .box(0.36, 0.3, 0.2, coat, [0, 1.12, 0.82], [0, 0, 0], [1, 0.8]) // the breast
      .box(0.52, 0.58, 0.82, coat, [0, 1.38, -0.08], [0, 0, 0], [0.92, 1]) // the long back
      .box(0.56, 0.62, 0.52, coat, [0, 1.4, -0.62], [0, 0, 0], [0.85, 0.9]) // round quarters
      .box(0.4, 0.08, 1.2, pale, [0, 1.06, 0.0]) // belly
      .box(0.14, 0.14, 0.3, tuft ? coat : dark, [0, 1.5, -0.96], [-0.7, 0, 0]) // the tail: from the dock...
      .box(tuft ? 0.06 : 0.17, 0.5, tuft ? 0.06 : 0.15, tuft ? coat : dark, [0, 1.12, -1.06], [-0.15, 0, 0], [0.7, 0.8]) // ...flowing down (or a cord, a donkey's)
      .box(tuft ? 0.1 : 0.13, tuft ? 0.18 : 0.3, tuft ? 0.1 : 0.11, dark, [0, tuft ? 0.82 : 0.76, -1.1], [-0.05, 0, 0]) // (and its tuft)
      .build(),
    headPivot: [0, 1.64, 0.74],
    head: new Blocks()
      // The neck: thick at the shoulders, rising forward and narrowing up to the poll.
      .box(0.3, 0.36, 0.44, coat, [0, 0.0, 0.02], [0.53, 0, 0], [0.9, 0.85]) // its root, in the shoulders
      .box(0.26, 0.78, 0.36, coat, [0, 0.3, 0.2], [0.53, 0, 0], [0.75, 0.62]) // the neck
      .box(0.16, 0.5, 0.14, coat, [0, 0.12, 0.38], [0.75, 0, 0], [0.8, 0.8]) // the throat
      .box(brush ? 0.05 : 0.07, 0.82, brush ? 0.09 : 0.13, dark, [0, brush ? 0.42 : 0.38, brush ? 0.03 : 0.07], [0.53, 0, 0], [0.8, 0.6]) // the mane, along its crest (short and upright, a donkey's)
      .box(0.12, brush ? 0.06 : 0.12, 0.1, dark, [0, 0.72, 0.38]) // forelock
      // The head, long, angled down from the poll to the muzzle.
      .box(0.24, 0.24, 0.24, coat, [0, 0.55, 0.47]) // the jowl
      .box(0.21, 0.22, 0.54, coat, [0, 0.47, 0.62], [0.7, 0, 0], [0.9, 0.85]) // the long face
      .box(0.17, 0.18, 0.18, muzzle, [0, 0.29, 0.82], [0.7, 0, 0]) // muzzle
      .box(0.05, 0.03, 0.02, 0x1a1210, [0.05, 0.27, 0.9]) // nostrils
      .box(0.05, 0.03, 0.02, 0x1a1210, [-0.05, 0.27, 0.9])
      .box(0.25, 0.04, 0.06, coat, [0, 0.62, 0.55]) // brow
      .eyes(0.04, 0.035, 0.03, 0x2a1a10, [0.115, 0.58, 0.55], 'round')
      .ear(ear > 0.2 ? 0.07 : 0.05, ear, 0.04, coat, [0.07, 0.69 + ear / 2, 0.44], [0.1, 0, ear > 0.2 ? 0.3 : 0.15], [0.5, 0.5]) // upright ears (long, a donkey's)
      .ear(ear > 0.2 ? 0.07 : 0.05, ear, 0.04, coat, [-0.07, 0.69 + ear / 2, 0.44], [0.1, 0, ear > 0.2 ? -0.3 : -0.15], [0.5, 0.5])
      .build(),
    antlers: null,
    saddle: horseSaddle(), // (drawn on a saddled horse: see Wildlife)
    fore: limb(0.5, 0.52, { top: [0.2, 0.26], knee: [0.12, 0.13], ankle: [0.09, 0.09], color: coat, low: dark, foot: [0.13, 0.08, 0.15, hoof, 0.02] }),
    hind: limb(0.5, 0.52, { top: [0.22, 0.35], knee: [0.12, 0.14], ankle: [0.09, 0.09], color: coat, low: dark, foot: [0.13, 0.08, 0.15, hoof, 0.02] }),
    legs: [[0.16, 1.02, 0.56], [-0.16, 1.02, 0.56], [0.16, 1.02, -0.64], [-0.16, 1.02, -0.64]],
    torso: [[0, 1.37, -0.08, 0.28, 0.33, 0.88]],
    neck: [0, 0.3, 0.2, 0.13, 0.36, 0.18],
    skull: [0, 0.46, 0.64, 0.11, 0.14, 0.28],
  };
}

/** A donkey: grey-brown, a pale muzzle and belly, long ears, a short upright mane, its tail a cord with a dark tuft. */
export const donkey = () => equine({ coat: 0x7e7466, dark: 0x3a3430, pale: 0xcfc6b6, muzzle: 0xdcd4c4, hoof: 0x2a2420, ear: 0.34, brush: true, tuft: true });

/** A mule: a horse's build and coat, a donkey's long ears and its tail's tuft. */
export const mule = () => equine({ coat: 0x5e3e26, dark: 0x241a14, pale: 0x8a6a4a, muzzle: 0xa48a6a, ear: 0.27, brush: true, tuft: false });

/** A saddle and blanket, in a horse's body frame (see horse). */
export function horseSaddle() {
  return new Blocks()
    .box(0.57, 0.04, 0.62, 0x6a3a2a, [0, 1.68, -0.02]) // the blanket
    .box(0.36, 0.12, 0.48, 0x5a3a20, [0, 1.75, -0.02], [0, 0, 0], [0.9, 0.85]) // the saddle
    .box(0.3, 0.12, 0.08, 0x4a2e18, [0, 1.82, 0.2]) // its pommel
    .box(0.32, 0.1, 0.08, 0x4a2e18, [0, 1.82, -0.24]) // its cantle
    .box(0.03, 0.4, 0.05, 0x3a2414, [0.27, 1.48, 0.0]) // stirrup leathers
    .box(0.03, 0.4, 0.05, 0x3a2414, [-0.27, 1.48, 0.0])
    .box(0.08, 0.04, 0.1, 0x8a949e, [0.28, 1.27, 0.0]) // stirrups
    .box(0.08, 0.04, 0.1, 0x8a949e, [-0.28, 1.27, 0.0])
    .build();
}

/**
 * A great beast's shag (see Wildlife's BOSSES): thick, pointed tufts of
 * fur built over its kind's model: raised hackles down the spine, a heavy
 * ruff over the shoulders and round the neck, ragged fur hanging off the
 * flanks and belly, and cheek fur on the head; each tuft coloured from the
 * coat under it, a little darker or paler. A crocodile gets rows of knobbed
 * scutes instead. { body, head }, in the body's and the head's frames.
 */
export function bossFur(model, kind) {
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const jit = (a) => (rand() - 0.5) * 2 * a;
  const up = new Vector3(), X = new Vector3(1, 0, 0), Y = new Vector3(0, 1, 0), Z = new Vector3(0, 0, 1);
  const near = (geo, x, y, z, out) => {
    const p = geo.attributes.position, c = geo.attributes.color;
    let best = Infinity, k0 = 0;
    for (let k = 0; k < p.count; k += 3) {
      const d = (p.getX(k) - x) ** 2 + (p.getY(k) - y) ** 2 + (p.getZ(k) - z) ** 2;
      if (d < best) (best = d), (k0 = k);
    }
    return out.setRGB(c.getX(k0), c.getY(k0), c.getZ(k0));
  };
  // A tuft: its base at [x, y, z] on the hide, pointing along the turn [rx, ry, rz] from straight up.
  const tuft = (b, geo, size, [x, y, z], [rx, ry, rz], len = 1, shade = 0.85) => {
    const w = size * (0.6 + rand() * 0.3), h = size * (0.6 + rand() * 0.35) * len, d = size * 0.22;
    up.copy(Y).applyAxisAngle(X, rx).applyAxisAngle(Y, ry).applyAxisAngle(Z, rz);
    const c = near(geo, x, y, z, new Color()).multiplyScalar(shade + jit(0.1));
    b.box(w, h, d, c, [x + up.x * h * 0.3, y + up.y * h * 0.3, z + up.z * h * 0.3], [rx, ry, rz], [0.35, 0.25]);
  };
  const body = new Blocks(), head = new Blocks();
  const croc = kind === 'crocodile';
  for (const [x, y, z, hx, hy, hz] of model.torso ?? []) {
    const u = croc ? hy * 0.9 : Math.min(hx, hy) * 0.55;
    const front = (t) => Math.max(0, (t - 0.25) / 0.75); // (0 at the back, 1 at the shoulders)
    for (let t = -0.95; t <= 0.95; t += croc ? 0.12 : 0.16) {
      const zz = z + (t + (croc ? 0 : jit(0.05))) * hz, f = front((t + 1) / 2);
      if (croc) {
        // Two rows of scutes, knobbed and dark, down the back.
        for (const sx of [-0.35, 0.35]) body.box(u * 0.35, u * 0.35, u * 0.4, near(model.body, x + sx * hx, y + hy, zz, new Color()).multiplyScalar(0.7), [x + sx * hx, y + hy * 0.95 + u * 0.12, zz], [0, 0, 0], [0.4, 0.5]);
        continue;
      }
      // Hackles: three rows down the spine, longer over the shoulders.
      for (const sx of [-0.45, 0, 0.45]) tuft(body, model.body, u * (1 + 0.6 * f), [x + sx * hx + jit(hx * 0.08), y + hy * (0.92 - Math.abs(sx) * 0.15), zz + jit(0.03)], [-1.15 + jit(0.25), 0, -sx * 1.3 + jit(0.25)], 1 + 0.5 * f);
      // The flanks: fur hanging off them, ragged, heavier in front.
      for (const side of [1, -1]) {
        for (const v of [0.5, -0.1, -0.65]) tuft(body, model.body, u * (0.9 + 0.4 * f), [x + side * hx * 0.95, y + (v + jit(0.12)) * hy, zz + jit(0.06)], [Math.PI - 0.3 + jit(0.2), 0, side * (-0.25 + jit(0.15))], 0.9 + 0.3 * f, 0.82);
      }
      // The belly fringe, hanging down.
      tuft(body, model.body, u * 0.9, [x + jit(hx * 0.5), y - hy * 0.95, zz], [Math.PI - 0.3 + jit(0.2), 0, jit(0.4)], 1.1, 0.75);
    }
  }
  if (!croc && model.neck) {
    // A ruff round the neck, over the top and both sides, swept back.
    const [x, y, z, hx, hy, hz] = model.neck, u = Math.min(hx, hy) * 0.75;
    for (let t = -0.8; t <= 0.8; t += 0.4) {
      for (let a = -1.6; a <= 1.6; a += 0.4) tuft(head, model.head, u * 1.2, [x + Math.sin(a) * hx * 1.05, y + Math.cos(a) * hy * 0.9 + t * hy * 0.3, z + t * hz], [-1.1 + jit(0.2), 0, -a * 0.9 + jit(0.15)], 1.3);
    }
  }
  if (!croc && model.skull) {
    // Cheek fur, swept back off the sides of the face; a brow.
    const [x, y, z, hx, hy, hz] = model.skull, u = Math.min(hx, hy) * 0.5;
    for (const side of [1, -1]) for (const v of [-0.4, 0.2]) for (const t of [-0.6, -0.2]) tuft(head, model.head, u, [x + side * hx * 0.95, y + v * hy, z + t * hz], [-1.4 + jit(0.2), 0, -side * 1.1 + jit(0.2)], 1.1);
  }
  return { body: body.parts.length ? body.build() : null, head: head.parts.length ? head.build() : null };
}
