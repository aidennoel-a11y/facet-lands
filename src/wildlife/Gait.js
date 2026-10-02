/**
 * How four-legged animals (and birds on foot) walk: each foot is put down
 * on the ground and stays there, planted, while the body goes on over it;
 * then it's picked up and swung forward to come down again ahead. The body
 * doesn't glide: it surges on with each push, rises and falls, sways and
 * rocks with the footfalls, and the head nods in time.
 *
 * The gaits, as fractions of a stride (one full cycle of the legs), for the
 * legs in order fore near, fore off, hind near, hind off (a bird: its two),
 * with how much of the stride each foot is on the ground (`duty`):
 *
 *   walk: four beats, one foot at a time: a hind, the fore on the same
 *         side, the other hind, its fore. Two or three feet always down.
 *   trot: diagonal pairs together (fore near with hind off), two beats; the
 *         body bouncing, lowest in mid-stance.
 *   the gallop, rotary (dogs, cats, deer: the second fore foot on the far
 *         side from the first) or transverse (bison, moose, elk, boar: the
 *         same side); hind, hind, fore, fore, then all four in the air, the
 *         back rocking, the body stretched out and gathered in.
 *   bound: rabbits and hares: the big hind feet together, landing past the
 *         fore feet.
 *   step / run: a bird's two feet in turn.
 *
 * `lift`: how high a foot's raised (of the hip's height); `bob`: how much
 * the body rises and falls (of it too); `beats`: how many times a stride;
 * `surge`: how much the body speeds and slows with the pushes; `sway`: its
 * roll from side to side; `rock`: its pitch, nose up and down; `nod`: the
 * head's.
 */
export const GAITS = {
  walk: { offsets: [0.25, 0.75, 0, 0.5], duty: 0.68, lift: 0.11, bob: 0.018, beats: 2, surge: 0.3, sway: 0.035, rock: 0.015, nod: 0.07 },
  trot: { offsets: [0, 0.5, 0.5, 0], duty: 0.42, lift: 0.17, bob: 0.035, beats: 2, surge: 0.1, sway: 0.012, rock: 0.01, nod: 0.03 },
  // A deer's gallop: long bounding leaps, all four feet off the ground
  // between them, the back arching and stretching.
  deerGallop: { offsets: [0.5, 0.58, 0, 0.08], duty: 0.22, lift: 0.36, bob: 0.15, beats: 1, surge: 0.22, sway: 0, rock: 0.2, nod: 0.12 },
  rotary: { offsets: [0.6, 0.48, 0, 0.1], duty: 0.3, lift: 0.26, bob: 0.07, beats: 1, surge: 0.16, sway: 0, rock: 0.13, nod: 0.1 },
  transverse: { offsets: [0.46, 0.58, 0, 0.1], duty: 0.34, lift: 0.22, bob: 0.06, beats: 1, surge: 0.14, sway: 0, rock: 0.1, nod: 0.09 },
  bound: { offsets: [0.5, 0.56, 0, 0.03], duty: 0.28, lift: 0.3, bob: 0.3, beats: 1, surge: 0.35, sway: 0, rock: 0.28, nod: 0.05 },
  step: { offsets: [0, 0.5], duty: 0.62, lift: 0.2, bob: 0.03, beats: 2, surge: 0.4, sway: 0.06, rock: 0, nod: 0 },
  run: { offsets: [0, 0.5], duty: 0.38, lift: 0.26, bob: 0.05, beats: 2, surge: 0.15, sway: 0.03, rock: 0.05, nod: 0 },
};
const GALLOPS = new Set(['rotary', 'transverse', 'bound']);

const TAU = Math.PI * 2;
const frac = (x) => x - Math.floor(x);
const ease = (t) => t * t * (3 - 2 * t);

/**
 * Which gait, at speed `v`: `sp.gaits` [walk, trot (or null), gallop] and
 * where it changes up (`sp.trotBand`: how much of the way from a brisk walk
 * to a full run it trots). With a little give, so it doesn't flicker
 * between two.
 */
export function chooseGait(a, sp, v) {
  const [walk, trot, gallop] = sp.gaits;
  const toTrot = sp.walk * 1.6, toGallop = toTrot + (sp.run - toTrot) * (sp.trotBand ?? 0.35);
  const was = a.gait, give = was ? 1.1 : 1;
  if (!trot) return v < (was === gallop ? toTrot / give : toTrot * give) ? walk : gallop;
  if (v < (was === walk ? toTrot * give : toTrot / give)) return walk;
  if (v < (was === gallop ? toGallop / give : toGallop * give)) return trot;
  return gallop;
}

/** How long a stride is (m), at speed `v` in gait `g`: longer as it goes faster. */
export function strideLength(sp, scale, g, v) {
  const S = sp.stride * (scale / (sp.size ?? 1));
  if (g === 'walk' || g === 'step') return S * (0.55 + 0.45 * Math.min(1.6, v / sp.walk));
  if (g === 'trot' || g === 'run') return S * 1.2 * (0.75 + 0.25 * Math.min(2, v / (sp.walk * 2.2)));
  if (g === 'bound') return S * (0.5 + 1.8 * Math.min(1, v / sp.run));
  return S * (1.6 + 1.6 * Math.min(1.2, v / sp.run));
}

/**
 * The body's motion with the legs, at stride phase `c` of gait `g`: how
 * much it rises (of the hip's height), pitches and rolls (radians), how it
 * surges on (a factor on its speed) and how its head nods.
 */
export function rhythm(g, c, amount = 1) {
  const G = GAITS[g];
  if (!G) return { bob: 0, pitch: 0, roll: 0, surge: 1, nod: 0 };
  const beat = TAU * G.beats;
  if (GALLOPS.has(g)) {
    // Highest in the air after the fore feet leave; nose up as the hind
    // legs drive, nose down as the fore feet take its weight.
    return {
      bob: G.bob * amount * (0.5 + 0.5 * Math.cos(TAU * (c - 0.95))),
      pitch: G.rock * amount * Math.sin(TAU * (c - 0.35)),
      roll: 0,
      surge: 1 + G.surge * amount * Math.cos(TAU * (c - 0.2)),
      nod: G.nod * amount * Math.sin(TAU * (c - 0.45)),
    };
  }
  // Walking and trotting: lowest as the feet take its weight, two beats a
  // stride; swaying over the feet on the ground.
  return {
    bob: -G.bob * amount * Math.cos(beat * (c - G.duty * 0.5)),
    pitch: G.rock * amount * Math.sin(beat * (c - 0.1)),
    roll: G.sway * amount * Math.sin(TAU * c),
    surge: 1 + G.surge * amount * Math.cos(beat * (c - G.duty * 0.85)),
    nod: G.nod * amount * Math.cos(beat * (c - 0.3)),
  };
}

// Where a leg's foot stands when it's at rest: under its hip.
function neutral(a, p, out) {
  const ch = Math.cos(a.heading), sh = Math.sin(a.heading), s = a.scale;
  out.x = a.x + (p[0] * ch + p[2] * sh) * s;
  out.z = a.z + (-p[0] * sh + p[2] * ch) * s;
  return out;
}
const home = { x: 0, z: 0 };

/**
 * Moves the feet (in the world) for a creature that's gone on `moved`
 * metres this frame: those on the ground stay put; those in the air swing
 * on, in an arc, to where they'll be put down; and at a standstill any
 * foot left out of place (it stopped mid-stride, or turned on the spot)
 * takes a step back under it, one at a time. Also how far the body must
 * drop for its feet to reach the ground (a.drop).
 *
 * @param model the creature's model ({ legs, fore, hind, biped })
 * @param ground (x, z) -> the ground's height
 */
export function stepFeet(a, sp, model, dt, moved, ground) {
  const legs = model.legs, s = a.scale;
  const G = GAITS[a.gait] ?? GAITS.walk;
  const L = a.strideLen ?? sp.stride;
  const H = legs[0][1] * s;
  if (!a.feet) {
    a.feet = legs.map((p) => {
      neutral(a, p, home);
      return { x: home.x, y: ground(home.x, home.z), z: home.z, up: false, sx: 0, sy: 0, sz: 0, u0: 0 };
    });
    a.idleStep = null;
  }
  const sh = Math.sin(a.heading), ch = Math.cos(a.heading);
  const going = moved > 1e-4;
  let need = 0;
  legs.forEach((p, k) => {
    const f = a.feet[k];
    neutral(a, p, home);
    // (Put down somewhere else: moved on or taken away.)
    if (Math.hypot(f.x - home.x, f.z - home.z) > L * 2.5 + 1.5) (f.x = home.x), (f.z = home.z), (f.y = ground(f.x, f.z)), (f.up = false);
    if (going) {
      const phi = frac(a.cycle - G.offsets[k % G.offsets.length]);
      if (phi < G.duty) {
        // On the ground: it stays where it is (come down, if it was in the air).
        if (f.up) {
          f.up = false;
          const y = ground(f.x, f.z);
          if (y === y) f.y = y;
        }
      } else {
        // In the air: on, in an arc, to where it'll come down: ahead of the
        // hip by half of what the body goes on while it's down, and what
        // the body goes on meanwhile.
        const u = (phi - G.duty) / (1 - G.duty);
        if (!f.up) (f.up = true), (f.sx = f.x), (f.sy = f.y), (f.sz = f.z), (f.u0 = Math.min(0.9, u));
        const ahead = ((1 - u) * (1 - G.duty) + G.duty / 2) * L;
        const tx = home.x + sh * ahead, tz = home.z + ch * ahead;
        let ty = ground(tx, tz);
        if (!(ty === ty)) ty = f.sy;
        const w = ease(Math.min(1, (u - f.u0) / (1 - f.u0)));
        f.x = f.sx + (tx - f.sx) * w;
        f.z = f.sz + (tz - f.sz) * w;
        f.y = f.sy + (ty - f.sy) * w + Math.sin(Math.PI * w) * G.lift * H;
      }
    }
    if (!f.up) need = Math.max(need, a.y + p[1] * s - (f.y + (model.biped || k >= 2 ? model.hind : model.fore).l1 * s * 0.96 + (model.biped || k >= 2 ? model.hind : model.fore).l2 * s * 0.96));
  });
  if (!going) {
    // At a standstill: a step to put right a foot left out of place.
    const I = a.idleStep;
    if (I) {
      I.t += dt;
      const f = a.feet[I.k];
      neutral(a, legs[I.k], home);
      const w = ease(Math.min(1, I.t / I.dur));
      const ty = ground(home.x, home.z);
      f.x = I.sx + (home.x - I.sx) * w;
      f.z = I.sz + (home.z - I.sz) * w;
      f.y = I.sy + ((ty === ty ? ty : I.sy) - I.sy) * w + Math.sin(Math.PI * w) * 0.1 * H;
      f.up = w < 1;
      if (w >= 1) a.idleStep = null;
    } else {
      let worst = -1, err = 0.2 * sp.stride * (s / (sp.size ?? 1));
      a.feet.forEach((f, k) => {
        neutral(a, legs[k], home);
        const e = f.up ? 99 : Math.hypot(f.x - home.x, f.z - home.z);
        if (e > err) (err = e), (worst = k);
      });
      if (worst >= 0) {
        const f = a.feet[worst];
        a.idleStep = { k: worst, t: 0, dur: 0.22 + 0.12 * Math.min(2, H), sx: f.x, sy: f.y, sz: f.z };
      }
    }
  } else a.idleStep = null;
  // (The body lowers, a little, for its feet to reach the ground.)
  a.drop = (a.drop ?? 0) + (Math.max(0, Math.min(H * 0.35, need)) - (a.drop ?? 0)) * Math.min(1, dt * 10);
}

/**
 * Where a foot is at stride phase `c` of gait `g`, in the creature's own
 * frame (for those too far off to plant their feet: on level ground, the
 * stride `L` in model units). Into `out` { x, y, z }.
 */
export function footAt(out, p, k, g, c, L, H, moving) {
  const G = GAITS[g] ?? GAITS.walk;
  const phi = frac(c - G.offsets[k % G.offsets.length]);
  let z = 0, y = 0;
  if (phi < G.duty) z = L * (G.duty / 2 - phi);
  else {
    const u = (phi - G.duty) / (1 - G.duty);
    z = L * (-G.duty / 2 + G.duty * ease(u));
    y = Math.sin(Math.PI * u) * G.lift * H;
  }
  out.x = p[0];
  out.y = y * moving;
  out.z = p[2] + z * moving;
  return out;
}

/**
 * A two-part leg from its hip (hx, hy, hz) to its foot (fx, fy, fz), both
 * in the body's frame: how far it swings out sideways (rz), the upper
 * part's angle (a1, about x: 0 straight down, negative forward) and the
 * lower's (a2), and where the joint between comes (kx, ky, kz). A foreleg's
 * joint bends forward (the knee), a hind leg's back (the hock), as does a
 * bird's.
 */
export function solveLeg(out, hx, hy, hz, fx, fy, fz, l1, l2, kneeForward) {
  const dx = fx - hx, dy = fy - hy, dz = fz - hz;
  const rz = dy < -0.01 ? Math.max(-0.45, Math.min(0.45, Math.atan2(dx, -dy))) : 0;
  const cz = Math.cos(rz), szz = Math.sin(rz);
  const vy = -dx * szz + dy * cz; // (in the plane the leg swings in)
  const len = Math.hypot(vy, dz) || 1e-6;
  const d = Math.max(Math.abs(l1 - l2) + 0.002, Math.min((l1 + l2) * 0.999, len));
  const ty = (vy * d) / len, tz = (dz * d) / len;
  const beta = Math.atan2(-tz, -ty);
  const gamma = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))));
  const a1 = kneeForward ? beta - gamma : beta + gamma;
  const ky = -l1 * Math.cos(a1), kz = -l1 * Math.sin(a1);
  out.rz = rz;
  out.a1 = a1;
  out.a2 = Math.atan2(-(tz - kz), -(ty - ky));
  out.kx = hx - ky * szz;
  out.ky = hy + ky * cz;
  out.kz = hz + kz;
  return out;
}
