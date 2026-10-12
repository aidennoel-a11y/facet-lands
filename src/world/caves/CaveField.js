import { SimplexNoise } from '../../noise/SimplexNoise.js';
import { hash2, mulberry32 } from '../../noise/random.js';

/**
 * The procedural cave field: for any point it says how far (roughly, in
 * metres) you are from cave air. Positive = solid rock, negative = air.
 *
 * Built like the terrain, from noise, so caves are endless and the same
 * seed always makes the same caves:
 *
 *  - Tunnels: where two 3D noise fields are both near zero at once. That
 *    happens along long, winding, branching lines, so tunnels form
 *    connected networks that run for kilometres.
 *  - Rooms: where a third, lower-frequency noise field peaks, big squat
 *    caverns open up. Tunnels run in and out of them, linking rooms into
 *    cave systems.
 *  - A regional mask switches caves off in some areas, and a band keeps
 *    them between `bottom` and `top`, always with `cover` metres of rock
 *    under the ground surface, so they never break through by accident.
 *  - Below and among those (`#deep`), the stranger country: vast
 *    chambers far down, hundreds of metres across, with pillars of rock
 *    holding up the roof and still lakes (or lava) in their low places;
 *    long thin spaghetti tunnels winding for kilometres; and underground
 *    rivers, level channels with water in their beds and a dry ledge
 *    along each side, that run on through the rock and join cave to cave.
 *    These only ever add air to what's there, never come within `cover`
 *    (more, for the big ones) of the ground, and keep clear of the
 *    entrances: nothing above ground changes.
 *  - Each part of the underground has its kind (see biomeScores): plain
 *    rock; lush, green with moss under the wet country; volcanic, black
 *    and glowing, under the volcanic highlands and very deep anywhere;
 *    ice, under the high cold mountains; dry sandstone under the deserts.
 *  - Entrances: built pieces rather than noise, so they're clean and easy
 *    to spot. A pit opens in the ground, a ramp runs down it under a rock
 *    ledge into a short arched tunnel, and a winding tunnel carries on from
 *    there down into the network (see #makeEntrance and EntranceLayer).
 */
export class CaveField {
  constructor(generator, { seaLevel, chunkSize }) {
    this.generator = generator;
    this.seaLevel = seaLevel;
    const seed = generator.seed ^ 0x2c1b3c6d;
    this.seed = seed;
    this.tunnelA = new SimplexNoise(seed + 1);
    this.tunnelB = new SimplexNoise(seed + 2);
    this.rooms = new SimplexNoise(seed + 3);
    this.region = new SimplexNoise(seed + 4);
    this.warp = new SimplexNoise(seed + 5);
    this.spagA = new SimplexNoise(seed + 6);
    this.spagB = new SimplexNoise(seed + 7);
    this.spagRegion = new SimplexNoise(seed + 8);
    this.riverLine = new SimplexNoise(seed + 9);
    this.riverRegion = new SimplexNoise(seed + 10);
    this.riverLevel = new SimplexNoise(seed + 11);
    this.chamberWall = new SimplexNoise(seed + 12);
    this.kind = new SimplexNoise(seed + 13);
    this.chambers = new Map();

    this.bottom = -30; // deepest cave floor (m)
    this.top = 55; // highest cave roof, away from entrances (m)
    this.cover = 7; // rock kept between caves and the ground above
    this.deep = -125; // the deepest floor of the deep caves (chambers, spaghetti, rivers)
    this.chamberCell = 520; // one possible great chamber per square this size

    this.entranceRegion = 256; // one possible entrance per region this size
    this.mouthRadius = 3.6; // radius of the winding tunnel below each entrance
    this.entrances = new Map();
    this.chunkSize = chunkSize;
  }

  /** Are there caves anywhere in this column? Cheap 2D check, used to skip work. */
  regionRock(x, z) {
    return (0.12 - this.region.noise2D(x * 0.0021, z * 0.0021)) * 60;
  }

  /**
   * Cave field without entrances or the ground surface. `H` is the terrain
   * height of this column and `regionRock` its regionRock() value (pass them
   * in when evaluating many points in one column).
   */
  caves(x, y, z, H, regionRock, column = null, entrances = null) {
    const d = this.legacy(x, y, z, H, regionRock);
    if (d < -2) return d;
    const col = column ?? this.column(x, z, H);
    if (this.deepRock(col) > 10) return d;
    // (Clear of the entrances: their ways down stay as they were laid out.)
    for (const e of entrances ?? this.entrancesNear(x, z, x, z)) {
      const b = e.bounds;
      if (x < b.minX - 8 || x > b.maxX + 8 || z < b.minZ - 8 || z > b.maxZ + 8) continue;
      if (CaveField.ramp(e, x, y, z) < 8 || CaveField.hull(e, x, y, z) < 8) return d;
    }
    return Math.min(d, this.#deep(x, y, z, H, col));
  }

  /**
   * The first caves (tunnels and rooms): the entrances are laid out by
   * these alone, so the deep caves added since never move one.
   */
  legacy(x, y, z, H, regionRock) {
    const ceiling = Math.min(this.top, H - this.cover);
    const rock = Math.max(regionRock, y - ceiling, this.bottom - y);
    if (rock > 10) return rock; // far from any cave: skip the 3D noise

    // Tunnels: both noises near zero. Squashed vertically so they tend to
    // run level rather than plunge, and sampled through a domain warp (a
    // slow 2D noise that shoves the coordinates around) so they snake and
    // twist instead of running in long smooth arcs.
    const wx = x + this.warp.noise2D(x / 95, z / 95) * 26;
    const wz = z + this.warp.noise2D(x / 95 + 40, z / 95 - 40) * 26;
    const wy = y + this.warp.noise2D(x / 70 - 80, z / 70 + 80) * 7;
    const f = 1 / 64;
    const a = this.tunnelA.noise3D(wx * f, wy * f * 1.7, wz * f);
    const b = this.tunnelB.noise3D(wx * f, wy * f * 1.7, wz * f);
    const tunnel = (Math.sqrt(a * a + b * b) - 0.16) * 34;

    // Rooms: broad, flattened blobs.
    const r = this.rooms.noise3D(x / 52, (y / 52) * 2.1, z / 52);
    const room = (0.42 - r) * 30;

    return Math.max(rock, Math.min(tunnel, room));
  }

  // --- The deep caves -----------------------------------------------------------

  /** A great chamber in one cell of the land (or null), cached. */
  chamber(ix, iz) {
    const key = ix * 65536 + iz;
    let c = this.chambers.get(key);
    if (c !== undefined) return c;
    const rand = mulberry32(hash2(ix, iz, this.seed + 77) * 4294967296);
    c = null;
    if (rand() < 0.42) {
      const C = this.chamberCell;
      const rx = 60 + rand() * 110, rz = 60 + rand() * 110, ry = 26 + rand() * 34;
      const yaw = rand() * Math.PI;
      c = {
        x: (ix + 0.32 + rand() * 0.36) * C, z: (iz + 0.32 + rand() * 0.36) * C,
        y: -72 + rand() * 22, rx, rz, ry, cos: Math.cos(yaw), sin: Math.sin(yaw),
        pillars: 0.25 + rand() * 0.3, // (how many great pillars hold the roof up)
      };
      c.floor = c.y - c.ry * 0.5;
      c.lake = c.floor + 0.6 + rand() * 1.4; // (still water in the low places of the floor, under this)
    }
    this.chambers.set(key, c);
    return c;
  }

  /** The chamber whose footprint reaches (x, z), and how far in (0 middle .. 1 the wall), or null. */
  chamberAt(x, z) {
    const C = this.chamberCell, ix = Math.floor(x / C), iz = Math.floor(z / C);
    let best = null, bestE = 1.25;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const c = this.chamber(ix + dx, iz + dz);
      if (!c) continue;
      const px = x - c.x, pz = z - c.z;
      const u = (px * c.cos + pz * c.sin) / c.rx, v = (pz * c.cos - px * c.sin) / c.rz;
      const e = Math.hypot(u, v);
      if (e < bestE) (bestE = e), (best = c);
    }
    return best ? { c: best, e: bestE } : null;
  }

  /** The chamber's floor (with its rises and hollows) under (x, z). */
  chamberFloor(c, x, z) {
    return c.floor + this.chamberWall.noise2D(x / 46, z / 46) * 5 + this.chamberWall.noise2D(x / 13 + 50, z / 13) * 1.6;
  }

  /** The underground river through (x, z): { across (m from its middle), half (water's half-width), level }, or null. */
  riverAt(x, z, H) {
    const region = this.riverRegion.noise2D(x * 0.0011, z * 0.0011);
    if (region < -0.05) return null;
    const wx = x + this.warp.noise2D(x / 140 + 7, z / 140) * 40, wz = z + this.warp.noise2D(x / 140, z / 140 - 7) * 40;
    const n = this.riverLine.noise2D(wx / 420, wz / 420);
    const across = Math.abs(n) * 260;
    const half = 3 + 1.6 * (this.riverLevel.noise2D(x / 90, z / 90) + 1) * 0.5;
    if (across > half + 9) return null;
    const level = -44 + 16 * this.riverLevel.noise2D(x / 1100, z / 1100);
    if (level + 7 > H - 12) return null; // (never up near the ground)
    return { across, half, level, fade: Math.min(1, (region + 0.05) * 12) };
  }

  /**
   * What a column has of the deep caves, worked out once for the column:
   * its chamber, its river, whether spaghetti runs here. `H` its ground.
   */
  column(x, z, H) {
    const spag = this.spagRegion.noise2D(x * 0.0016, z * 0.0016) + 0.15;
    return {
      H,
      lush: this.lushAt(x, z),
      volc: this.volcAt(x, z),
      chamber: this.chamberAt(x, z),
      river: this.riverAt(x, z, H),
      spag,
      // (Where the spaghetti's noise is read from: shoved about, so it snakes.)
      sx: spag > -0.05 ? (x + this.warp.noise2D(x / 80 + 20, z / 80) * 18) / 64 : 0,
      sz: spag > -0.05 ? (z + this.warp.noise2D(x / 80, z / 80 + 20) * 18) / 64 : 0,
    };
  }

  /** How lush the cave country is round (x, z), 0..1+ (coarse, cached: see biomeScores). */
  lushAt(x, z) {
    const S = 48, i = Math.round(x / S), k = Math.round(z / S), key = i * 100003 + k;
    this.lushCache ??= new Map();
    let v = this.lushCache.get(key);
    if (v === undefined) {
      if (this.lushCache.size > 20000) this.lushCache.clear();
      v = this.biomeScores(i * S, k * S).lush;
      this.lushCache.set(key, v);
    }
    return v;
  }

  /** How volcanic the cave country is round (x, z) (coarse, cached: see biomeScores). */
  volcAt(x, z) {
    const S = 48, i = Math.round(x / S), k = Math.round(z / S), key = i * 100003 + k;
    this.volcCache ??= new Map();
    let v = this.volcCache.get(key);
    if (v === undefined) {
      if (this.volcCache.size > 20000) this.volcCache.clear();
      v = this.biomeScores(i * S, k * S).volcanic;
      this.volcCache.set(key, v);
    }
    return v;
  }

  /** A volcanic cavern's floor under (x, z) (its rough lie), and the level its lava lies at. */
  volcanicFloor(x, z) {
    const base = -104 + 7 * this.riverLevel.noise2D(x / 400 + 70, z / 400 - 70);
    return {
      floor: base + 4.5 * this.chamberWall.noise2D(x / 40 + 90, z / 40 - 90) + 1.5 * this.chamberWall.noise2D(x / 11 - 40, z / 11),
      lava: base + 0.8,
    };
  }

  /** Could this column hold any deep cave? (Cheap: to skip work.) */
  deepRock(col) {
    return col.chamber || col.river || col.spag > -0.05 || col.lush > 0.45 || col.volc > 0.45 ? 0 : 50;
  }

  #deep(x, y, z, H, col) {
    const ceiling = Math.min(H - this.cover - 2, this.top - 2);
    if (y < this.deep - 6 || y > ceiling + 4) return 50;
    let d = 50;
    // A great chamber: a vast squashed dome on a rough floor, pillars of
    // rock holding up its roof; its roof never nearer the ground than 22 m.
    const ch = col.chamber;
    if (ch) {
      const c = ch.c;
      const px = x - c.x, pz = z - c.z;
      const u = (px * c.cos + pz * c.sin) / c.rx, v = (pz * c.cos - px * c.sin) / c.rz, w = (y - c.y) / c.ry;
      let cd = (Math.sqrt(u * u + v * v + w * w) - 1) * Math.min(c.rx, c.rz, c.ry * 1.6);
      if (cd < 14) {
        cd += this.chamberWall.noise3D(x / 38, y / 26, z / 38) * 9;
        cd = Math.max(cd, this.chamberFloor(c, x, z) - y, y - (H - 22));
        if (cd < 2) {
          // The pillars: one in some of the 40 m squares across it, swelling and narrowing as they rise.
          const P = 40, gx = Math.floor(x / P), gz = Math.floor(z / P);
          for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
            const h = hash2(gx + dx, gz + dz, this.seed + 91);
            if (h > c.pillars) continue;
            const qx = (gx + dx + 0.2 + hash2(gx + dx, gz + dz, this.seed + 92) * 0.6) * P, qz = (gz + dz + 0.2 + hash2(gx + dx, gz + dz, this.seed + 93) * 0.6) * P;
            const r = (3 + h * 9) * (1 + 0.35 * Math.sin(y / 9 + h * 20)) * (1 + 0.5 * Math.max(0, (c.floor + 6 - y) / 6));
            cd = Math.max(cd, r - Math.hypot(x - qx, z - qz));
          }
        }
      }
      d = Math.min(d, cd);
    }
    // An underground river: a level channel, the water in its bed, a dry ledge each side, an arched roof.
    const rv = col.river;
    if (rv) {
      const wide = rv.half + 2.6;
      const t = Math.max(0, 1 - rv.across / rv.half);
      const bed = rv.level + 0.35 - 2.1 * t * t * (3 - 2 * t);
      const roof = rv.level + 1.6 + 4.6 * Math.sqrt(Math.max(0, 1 - (rv.across / wide) ** 2)) + this.warp.noise2D(x / 9, z / 9) * 0.8;
      let rd = Math.max(rv.across - wide, bed - y, y - roof);
      rd += (1 - rv.fade) * 8;
      d = Math.min(d, rd);
    }
    // Under the wet country, the lush caverns: great green halls, wide and
    // high, opening one into another (only there, so they're the lush caves).
    if (col.lush > 0.45 && y > -70) {
      const r = this.chamberWall.noise3D(x / 75 + 300, y / 32, z / 75 - 300);
      let ld = (0.18 - r) * 42;
      ld = Math.max(ld, (0.45 - col.lush) * 60, -70 - y);
      d = Math.min(d, ld);
    }
    // Under the volcanic highlands, deep down, the volcanic caverns: great
    // halls with a rough floor of old lava, still molten in its low places
    // (see volcanicFloor: the lava lakes).
    if (col.volc > 0.45 && y > this.deep && y < -55) {
      const r = this.chamberWall.noise3D(x / 95 - 200, y / 40, z / 95 + 200);
      let vd = (0.24 - r) * 46;
      const vf = col.vfloor ??= this.volcanicFloor(x, z);
      vd = Math.max(vd, vf.floor - y, (0.45 - col.volc) * 70, y - (-58 - 12 * Math.max(0, r)));
      d = Math.min(d, vd);
    }
    // Spaghetti: long thin tunnels winding on and on.
    if (col.spag > -0.05 && y > this.deep) {
      // (Some 12 m across: narrow for a cave, but always room to walk;
      // tending to run level rather than plunge.)
      const fy = y / 90;
      const a = this.spagA.noise3D(col.sx, fy, col.sz), b = this.spagB.noise3D(col.sx, fy, col.sz);
      let sd = (Math.sqrt(a * a + b * b) - 0.16) * 40;
      sd = Math.max(sd, -col.spag * 40, this.deep - y);
      d = Math.min(d, sd);
    }
    return Math.max(d, y - ceiling);
  }

  /**
   * What kind of cave country a place is (slow: the mesher samples it on a
   * coarse grid): how lush, volcanic, icy and dry. See biomeAt.
   */
  biomeScores(x, z) {
    const g = this.generator, w = g.getBiomeWeights(x, z, {}), H = g.getHeight(x, z);
    const n = this.kind.noise2D(x / 900, z / 900), m = this.kind.noise2D(x / 300 + 31, z / 300 - 17);
    const sm = (a, b, v) => Math.min(1, Math.max(0, (v - a) / (b - a)));
    return {
      lush: w.jungle + w.mangrove + 0.8 * w.wetland + 0.7 * w.redwood + 0.6 * w.smoky + 0.35 * (w.temperate + w.parkland) + 0.4 * n,
      volcanic: 1.2 * w.volcanic + 0.25 * m,
      ice: sm(120, 190, H) * (1 - w.jungle - w.desert) + 0.35 * (w.pine + w.blackHills) * sm(0.2, 0.6, n * 0.5 + 0.5) + 0.2 * m,
      dry: w.desert + w.badlands + 0.5 * w.savanna + w.saltFlat,
      // (Two rarer kinds, each in its own patches whatever the country over
      // them: the crystal caverns, deep down; the mushroom forests.)
      crystal: 1.35 * sm(0.5, 0.68, this.kind.noise2D(x / 820 + 70, z / 820 + 40)),
      mushroom: 1.35 * sm(0.5, 0.68, this.kind.noise2D(x / 760 - 120, z / 760 + 90)) + 0.12 * (w.wetland + w.temperate),
    };
  }

  /**
   * 0 plain rock, 1 lush, 2 volcanic, 3 ice, 4 dry sandstone, 5 crystal
   * caverns, 6 mushroom forest: from the scores, and how deep (everything
   * very deep turns volcanic; the crystals only grow well down).
   */
  static biomeAt(s, y) {
    const volcanic = s.volcanic + Math.min(1, Math.max(0, (-88 - y) / 20)) * 0.9;
    const crystal = (s.crystal ?? 0) * Math.min(1, Math.max(0, (-28 - y) / 14));
    const mushroom = s.mushroom ?? 0;
    const best = Math.max(s.lush, volcanic, s.ice, s.dry, crystal, mushroom);
    if (best < 0.5) return 0;
    return best === volcanic ? 2 : best === crystal ? 5 : best === mushroom ? 6 : best === s.ice ? 3 : best === s.lush ? 1 : 4;
  }

  // --- Entrances ---------------------------------------------------------------
  //
  // Each entrance is generated along its own axes: u runs from the front of
  // the pit (u = 0) into the ground, v across it. Its shape is procedural:
  // width, centre line, floor and roof height all wander along u (sums of
  // random waves), and its overall size, slope and ledge vary per entrance.
  // These are sampled every `step` metres into arrays on `e.shape`, so the
  // mesh, the terrain hole and physics all read the same shape. Going in:
  //
  //   0 .. L-ledge  an open pit; its floor slopes down
  //   L-ledge .. L  the floor runs on under an overhanging rock outcrop
  //   L .. E        a short rock tunnel (bending a little)
  //   E ..          the winding tunnel (capsules), down to the cave network
  //
  // The terrain mesh leaves out exactly the pit (a strip of convex
  // trapezoids, clipped cleanly), EntranceLayer builds the rock around it,
  // and corridor() is its walkable space for physics.

  /** The entrance in one region (or null), cached. */
  entrance(rx, rz) {
    const key = rx * 65536 + rz;
    let e = this.entrances.get(key);
    if (e === undefined) {
      e = this.#makeEntrance(rx, rz);
      this.entrances.set(key, e);
    }
    return e;
  }

  /**
   * Picks a spot in the region (a hillside or open ground), generates an
   * entrance shape there facing into the hill, and lays it out: the pit
   * runs until the ground stands well over the tunnel roof, then the rock
   * tunnel, then a tunnel winding down in short segments, each turning a
   * little left or right and sloping about 25 degrees, until it reaches
   * cave air with a floor just below. The whole built part must sit inside
   * one terrain chunk and clear of natural caves; every winding segment
   * must keep a floor under it and rock over it. Regions with no spot that
   * works get no entrance.
   */
  #makeEntrance(rx, rz) {
    const g = this.generator;
    const R = this.entranceRegion;
    const size = this.chunkSize;
    const rand = mulberry32(hash2(rx, rz, this.seed) * 4294967296);
    if (rand() > 0.85) return null;
    const r = this.mouthRadius;
    const step = 0.5;
    const samples = 81; // 40 m of shape

    // A smooth random wiggle: a few sine waves with random lengths and phases.
    const wave = (amp, minLen, maxLen) => {
      const parts = [0, 1, 2].map(() => ({
        f: (2 * Math.PI) / (minLen + rand() * (maxLen - minLen)),
        p: rand() * Math.PI * 2,
        a: amp * (0.4 + rand() * 0.6),
      }));
      return (u) => parts.reduce((sum, q) => sum + q.a * Math.sin(q.f * u + q.p), 0) / 1.6;
    };

    for (let attempt = 0; attempt < 30; attempt++) {
      const x = (rx + 0.2 + rand() * 0.6) * R;
      const z = (rz + 0.2 + rand() * 0.6) * R;
      const top = g.getHeight(x, z);
      if (top < this.seaLevel + 10) continue;
      const gx = (g.getHeight(x + 3, z) - g.getHeight(x - 3, z)) / 6;
      const gz = (g.getHeight(x, z + 3) - g.getHeight(x, z - 3)) / 6;
      const grade = Math.hypot(gx, gz);
      if (grade > 0.6) continue;
      // Into the hill on a slope; any direction on open ground.
      const yaw = (grade > 0.1 ? Math.atan2(gz, gx) : rand() * Math.PI * 2) + (rand() - 0.5) * 0.5;
      const dx = Math.cos(yaw), dz = Math.sin(yaw);
      const wx = (u, v) => x + dx * u - dz * v;
      const wz = (u, v) => z + dz * u + dx * v;
      const ground = (u, v) => g.getHeight(wx(u, v), wz(u, v));

      // This entrance's shape.
      const w0 = 2.7 + rand() * 1.4; // typical half-width
      const slope = 0.33 + rand() * 0.15;
      const archH0 = 3.9 + rand() * 1.1;
      const lining = 6 + rand() * 3;
      const ledge = 2.5 + rand() * 2.5;
      const tipLen = 2 + rand() * 3;
      const bend = (rand() - 0.5) * 0.06;
      const sway = wave(0.55, 8, 18);
      const widthWave = wave(0.16, 4, 10);
      const floorWave = wave(0.22, 3, 8);
      const archWave = wave(0.1, 3, 7);
      const floor0 = top - 0.25;
      const hw = [], c = [], fl = [], ah = [];
      for (let k = 0; k < samples; k++) {
        const u = k * step;
        const taper = u < tipLen ? 0.35 + 0.65 * Math.sqrt(u / tipLen) : 1;
        hw.push(w0 * (1 + widthWave(u)) * taper);
        c.push(sway(u) - sway(0));
        fl.push(floor0 - slope * u + (floorWave(u) - floorWave(0)) * Math.min(1, u / 2));
        ah.push(archH0 * (1 + archWave(u)));
      }
      const at = (arr, u) => {
        const f = Math.min(samples - 1.0001, Math.max(0, u / step));
        const i = Math.floor(f);
        return arr[i] + (arr[i + 1] - arr[i]) * (f - i);
      };
      const floorAt = (u) => at(fl, u);
      const sides = (u, m) => [at(c, u) - at(hw, u) - m, at(c, u), at(c, u) + at(hw, u) + m];

      // The pit ends where the ground stands well over the tunnel roof, and
      // stays so along the rock tunnel and over the (taller) winding tunnel
      // it hands over to.
      const covered = (u, height) => sides(u, 1).every((v) => ground(u, v) - floorAt(u) >= height);
      let L = 0;
      for (let u = 9; u <= 24 && !L; u += step) {
        let ok = true;
        for (let k = 0; k <= lining + 3 && ok; k += 1.5) ok = covered(u + k, k < lining - 4 ? at(ah, u + k) + 1.6 : 2.3 + r + 2.5);
        if (ok) L = u;
      }
      if (!L) continue;
      const E = L + lining;
      // Past the pit, the tunnel bends a little.
      for (let k = 0; k < samples; k++) if (k * step > L) c[k] += bend * (k * step - L) ** 2;
      // The ground beside the pit mustn't dip below its floor (a gully across it).
      let sound = true;
      for (let u = 0; u <= L && sound; u += 2) {
        const [a, , b] = sides(u, 0.5);
        sound = ground(u, a) > floorAt(u) + 0.2 && ground(u, b) > floorAt(u) + 0.2;
      }
      if (!sound) continue;
      // All of it inside one chunk, so one chunk mesh holds the whole hole.
      const cx = Math.floor(x / size), cz = Math.floor(z / size);
      const outline = [];
      for (let u = -3; u <= E + 3; u += 2) {
        const [a, , b] = sides(u, 3.5);
        outline.push([u, a], [u, b]);
      }
      const inside = ([u, v]) => wx(u, v) > cx * size + 2 && wx(u, v) < (cx + 1) * size - 2 && wz(u, v) > cz * size + 2 && wz(u, v) < (cz + 1) * size - 2;
      if (!outline.every(inside)) continue;
      // Not in or beside a river.
      if (outline.some(([u, v]) => g.rivers.at(wx(u, v), wz(u, v), 6))) continue;
      // No natural cave breaking into the built part.
      let clear = true;
      for (let u = 0; u <= E - 3 && clear; u += 2) {
        for (const v of sides(u, 1)) {
          const px = wx(u, v), pz = wz(u, v);
          const H = g.getHeight(px, pz), rr = this.regionRock(px, pz);
          for (const dy of [-2, 1, 3.5, 6]) if (this.legacy(px, floorAt(u) + dy, pz, H, rr) < 1) clear = false;
        }
      }
      if (!clear) continue;

      // The winding tunnel, starting just inside the rock one and carrying on its bend.
      const uS = E - 2;
      const points = [{ x: wx(uS, at(c, uS)), y: floorAt(uS) + 2.3, z: wz(uS, at(c, uS)) }];
      let heading = yaw + Math.atan(at(c, E) - at(c, E - 1));
      let travelled = 0;
      let ok = false;
      for (let seg = 0; seg < 12; seg++) {
        const p = points[points.length - 1];
        if (seg > 0) heading += (rand() - 0.5) * 1.1; // turn up to ~30 degrees either way
        const length = 8;
        const pitch = 0.44; // about 25 degrees down
        const run = Math.cos(pitch) * length;
        const q = { x: p.x + Math.cos(heading) * run, y: p.y - Math.sin(pitch) * length, z: p.z + Math.sin(heading) * run };
        if (q.y < this.bottom + 4) break;
        // Check along the new segment: floor below, rock above.
        let valid = true;
        for (let t = 0.25; t <= 1.001 && valid; t += 0.25) {
          const sx = p.x + (q.x - p.x) * t, sy = p.y + (q.y - p.y) * t, sz = p.z + (q.z - p.z) * t;
          const H = g.getHeight(sx, sz);
          const rr = this.regionRock(sx, sz);
          if (this.legacy(sx, sy - r - 2, sz, H, rr) < 0) valid = false; // a void under the tunnel
          if (H - (sy + r) < 2) valid = false; // too close to the surface
        }
        if (!valid) break;
        points.push(q);
        travelled += length;
        const H = g.getHeight(q.x, q.z);
        const rr = this.regionRock(q.x, q.z);
        if (travelled >= 8 && this.legacy(q.x, q.y, q.z, H, rr) < -1.5 && this.legacy(q.x, q.y - 4.5, q.z, H, rr) > 0) {
          ok = true;
          break;
        }
      }
      if (!ok) continue;

      const segments = [];
      for (let i = 0; i < points.length - 1; i++) segments.push([points[i], points[i + 1]]);
      const ys = points.map((p) => p.y);
      const xs = [...points.map((p) => p.x), ...outline.map(([u, v]) => wx(u, v))];
      const zs = [...points.map((p) => p.z), ...outline.map(([u, v]) => wz(u, v))];
      // The pit as a strip of trapezoids (each convex, counter-clockwise).
      const holePieces = [];
      for (let k = 0; k * step < L - 1e-6; k++) {
        const u0 = k * step, u1 = (k + 1) * step;
        holePieces.push([[u0, c[k] - hw[k]], [u1, c[k + 1] - hw[k + 1]], [u1, c[k + 1] + hw[k + 1]], [u0, c[k] + hw[k]]]);
      }
      const holeX = holePieces.flat().map(([u, v]) => wx(u, v)), holeZ = holePieces.flat().map(([u, v]) => wz(u, v));
      const mouthU = L - ledge;
      const shape = {
        ox: x, oz: z, dx, dz, top, floor0, step,
        hw, c, fl, ah, // sampled half-width, centre line, floor and roof height
        tipLen, L, E, ledge,
        yLedge: floorAt(L) + at(ah, L) + 0.5, // underside of the outcrop over the mouth
        back: L + 2.5, // the outcrop's rock reaches this far along
        side: 3, // ...and this far beyond the pit's sides
      };
      return {
        id: `${rx},${rz}`,
        shape,
        holePieces,
        holeBounds: { minX: Math.min(...holeX), maxX: Math.max(...holeX), minZ: Math.min(...holeZ), maxZ: Math.max(...holeZ) },
        // Where daylight gives way to the cave (for lighting, the minimap and visibility).
        mouth: { x: wx(mouthU, at(c, mouthU)), y: floorAt(mouthU), z: wz(mouthU, at(c, mouthU)) },
        start: points[0],
        end: points[points.length - 1],
        segments,
        r,
        minY: Math.min(...ys) - r - 1,
        maxY: Math.max(...ys) + r + 1,
        bounds: {
          minX: Math.min(...xs) - r - 2,
          maxX: Math.max(...xs) + r + 2,
          minZ: Math.min(...zs) - r - 2,
          maxZ: Math.max(...zs) + r + 2,
        },
      };
    }
    return null;
  }

  /** Entrances whose built part or winding tunnel comes near a box. */
  entrancesNear(minX, minZ, maxX, maxZ) {
    const R = this.entranceRegion;
    const reach = 100;
    const out = [];
    for (let rz = Math.floor((minZ - reach) / R); rz <= Math.floor((maxZ + reach) / R); rz++) {
      for (let rx = Math.floor((minX - reach) / R); rx <= Math.floor((maxX + reach) / R); rx++) {
        const e = this.entrance(rx, rz);
        if (!e) continue;
        const b = e.bounds;
        if (b.maxX < minX || b.minX > maxX || b.maxZ < minZ || b.minZ > maxZ) continue;
        out.push(e);
      }
    }
    return out;
  }

  /**
   * Is (x, z) on or near an entrance's built part (within `margin` metres)?
   * Trees, boulders and grass keep off it.
   */
  nearEntrance(x, z, margin = 0) {
    const R = this.entranceRegion;
    const e = this.entrance(Math.floor(x / R), Math.floor(z / R));
    if (!e) return false;
    const [u, v] = CaveField.across(e, x, z);
    return u > -margin && u < e.shape.back + margin && Math.abs(v) < CaveField.halfWidth(e, u) + e.shape.side + margin;
  }

  /** World (x, z) to an entrance's own axes [u, v]. */
  static local(e, x, z) {
    const s = e.shape;
    const px = x - s.ox, pz = z - s.oz;
    return [px * s.dx + pz * s.dz, pz * s.dx - px * s.dz];
  }

  /** Like local(), but v measured from the entrance's (wandering) centre line. */
  static across(e, x, z) {
    const [u, v] = CaveField.local(e, x, z);
    return [u, v - CaveField.centreAt(e, u)];
  }

  /** An entrance's own axes (u, v) back to world [x, z]. */
  static world(e, u, v) {
    const s = e.shape;
    return [s.ox + s.dx * u - s.dz * v, s.oz + s.dz * u + s.dx * v];
  }

  /** One of an entrance's sampled shape arrays, at distance u along it. */
  static sampleAt(e, arr, u) {
    const f = Math.min(arr.length - 1.0001, Math.max(0, u / e.shape.step));
    const i = Math.floor(f);
    return arr[i] + (arr[i + 1] - arr[i]) * (f - i);
  }

  /** Height of an entrance's floor at distance u along it. */
  static floorAt(e, u) {
    return CaveField.sampleAt(e, e.shape.fl, u);
  }

  /** Half the width of the pit (and tunnel) at distance u along it. */
  static halfWidth(e, u) {
    return CaveField.sampleAt(e, e.shape.hw, u);
  }

  /** Where the centre line runs (v) at distance u along it. */
  static centreAt(e, u) {
    return CaveField.sampleAt(e, e.shape.c, u);
  }

  /** Floor-to-roof height of the rock tunnel's middle, at distance u along it. */
  static archAt(e, u) {
    return CaveField.sampleAt(e, e.shape.ah, u);
  }

  /** Height of the rock tunnel's roof above its floor, at v across it (from the centre line). */
  static archTop(e, u, v) {
    const h = CaveField.archAt(e, u);
    const wall = h * 0.5;
    const t = Math.min(1, Math.abs(v) / CaveField.halfWidth(e, u));
    return wall + (h - wall) * Math.sqrt(1 - t * t);
  }

  /** Is (x, z) inside an entrance's pit (where the terrain mesh has a hole)? */
  static inHole(e, x, z) {
    const [u, v] = CaveField.across(e, x, z);
    return u > 0 && u < e.shape.L && Math.abs(v) < CaveField.halfWidth(e, u);
  }

  /**
   * The walkable space of an entrance's built part (pit, under the outcrop,
   * rock tunnel) as a signed distance: negative inside. Used for physics,
   * alongside the cave field.
   */
  static corridor(e, x, y, z) {
    const s = e.shape;
    const [u, v] = CaveField.across(e, x, z);
    const floor = CaveField.floorAt(e, u);
    let d = Math.max(-u, u - s.E, Math.abs(v) - CaveField.halfWidth(e, u), floor - y);
    if (u >= s.L) d = Math.max(d, y - (floor + CaveField.archTop(e, u, v)));
    else if (u >= s.L - s.ledge) d = Math.max(d, y - s.yLedge);
    return d;
  }

  /**
   * The built part's space grown by a margin, reaching a little past the
   * rock tunnel's end: what the cave mesh is made from there. The cave mesh
   * is coarse and rounds corners off, so it's made to sit well outside the
   * (EntranceLayer-drawn) rock, never cutting into it, and opens into a
   * short chamber where the tunnel hands over to the cave.
   */
  static hull(e, x, y, z) {
    const s = e.shape;
    const [u, v] = CaveField.across(e, x, z);
    const floor = CaveField.floorAt(e, u);
    let d = Math.max(-u - 1, u - (s.E + 1.5), Math.abs(v) - CaveField.halfWidth(e, u) - 1.2, floor - 0.3 - y);
    if (u >= s.L - 0.5) d = Math.max(d, y - (floor + CaveField.archAt(e, u) + 1.7));
    else if (u >= s.L - s.ledge) d = Math.max(d, y - (s.yLedge + 1.2));
    return d;
  }

  /**
   * Is (x, y, z) in the space an entrance's built part occupies? The cave
   * mesh leaves this out (EntranceLayer draws it).
   */
  static inBuilt(e, x, y, z) {
    const s = e.shape;
    const [u, v] = CaveField.across(e, x, z);
    return u > -1.5 && u < s.E - 0.3 && Math.abs(v) < CaveField.halfWidth(e, u) + 2.5 && y > CaveField.floorAt(e, u) - 3;
  }

  /**
   * Daylight reaching a point underground: full at an entrance's mouth,
   * fading to almost none a few tens of metres in. Torches aren't affected
   * (see CaveLayer).
   */
  static skyLight(entrances, x, y, z) {
    let best = Infinity;
    for (const e of entrances) best = Math.min(best, Math.hypot(x - e.mouth.x, y - e.mouth.y, z - e.mouth.z));
    return Math.min(1, Math.max(0.03, 1.2 - best / 28));
  }

  /** Signed distance to an entrance's winding tunnel (a chain of capsules): negative inside. */
  static ramp(e, x, y, z) {
    let best = Infinity;
    const r = e.r;
    for (let s = 0; s < e.segments.length; s++) {
      const [a, b] = e.segments[s];
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy + (z - a.z) * dz) / (dx * dx + dy * dy + dz * dz)));
      const qx = a.x + dx * t - x, qy = a.y + dy * t - y, qz = a.z + dz * t - z;
      // Below the axis (qy > 0), flatten the bottom into a floor and widen
      // it a little, so the tunnel has a broad, walkable floor.
      const floorLift = Math.max(0, qy - r * 0.55) * 1.8;
      const k = Math.min(1, Math.max(0, qy / 1.5));
      const widen = 1 - 0.18 * k * k * (3 - 2 * k);
      best = Math.min(best, Math.sqrt((qx * qx + qz * qz) * widen * widen + qy * qy) + floorLift - r);
    }
    // Where it starts, inside the rock tunnel, keep it just under the floor
    // (so the cave mesh there stays hidden below the built floor).
    const [u, v] = CaveField.across(e, x, z);
    if (u < e.shape.E && Math.abs(v) < CaveField.halfWidth(e, u) + r) best = Math.max(best, CaveField.floorAt(e, u) - 0.3 - y);
    return best;
  }
}
