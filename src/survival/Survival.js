function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * Staying alive: health, hunger, thirst and warmth, each 0..100.
 *
 * Hunger and thirst run down as time goes by, faster when you run, jump
 * and swim; thirst much faster in the heat (the savanna, and more in the
 * desert and the dune seas). With either at nothing you weaken and die.
 *
 * The cold: in winter, anywhere the winters are cold (worse at night, in
 * the wet and the snow, up high); in spring and autumn only up on the
 * mountain tops; in summer only on the snowy peaks. In the cold your warmth
 * drains away (far slower in a deerskin coat) and at nothing you freeze. A
 * campfire warms you back up.
 *
 * Energy: you tire through the day (faster running), and only sleep
 * brings it back; worn out, you can't run, and at nothing you start to
 * suffer. Fever (from raw meat, dirty water): you burn through food and
 * water, can't mend, and now and then are sick; it passes, faster with
 * rest, at once with a stew. Bleeding (a bite, a swipe): it drains you
 * until it's bandaged (or clots, after a while).
 *
 * Health comes back slowly while you're fed, watered and warm. Falls from
 * too high hurt, and so do wolves and bears.
 */
export class Survival {
  constructor() {
    this.reset();
  }

  reset() {
    this.health = 100;
    this.hunger = 100;
    this.thirst = 100;
    this.warmth = 100;
    this.wet = 0; // how soaked you are (swimming, rain), 0..1
    this.cold = 0; // how cold it is where you are, 0..1+
    this.energy = 100;
    this.sick = 0; // seconds of fever left
    this.bleeding = 0; // seconds of bleeding left (if not bandaged)
    this.venom = 0; // seconds of a snake's venom left in you
    this.hot = 0; // how long you've been out in the desert sun (for heatstroke)
    this.alive = true;
    this.cause = '';
    this.hurtFlash = 0; // (for the red flash when you're hurt)
    this.lastHurt = '';
  }

  /** Takes `amount` of health (cause: for the death screen). Returns whether that was the end. */
  hurt(amount, cause) {
    if (!this.alive || amount <= 0) return false;
    this.health -= amount;
    this.hurtFlash = Math.min(1, this.hurtFlash + 0.25 + amount / 40);
    this.lastHurt = cause;
    if (this.health <= 0) {
      this.health = 0;
      this.alive = false;
      this.cause = cause;
      return true;
    }
    return false;
  }

  /**
   * Eats (or drinks): `food` { hunger, thirst, health, sick (the chance of
   * a fever), cure (it cures one) }. Returns whether it made you sick.
   */
  consume(food) {
    this.hunger = Math.min(100, this.hunger + (food.hunger ?? 0));
    this.thirst = Math.min(100, this.thirst + (food.thirst ?? 0));
    if (food.health > 0) this.health = Math.min(100, this.health + food.health);
    else if (food.health < 0) this.hurt(-food.health, 'food poisoning');
    if (food.cure) this.sick = 0;
    if (food.sick && Math.random() < food.sick) {
      this.sick = Math.max(this.sick, 150 + Math.random() * 120);
      return true;
    }
    return false;
  }

  /** A wound that bleeds (until bandaged, or it clots). */
  bleed(seconds = 90) {
    this.bleeding = Math.max(this.bleeding, seconds);
  }

  /** A snakebite: the venom works on you a while (and a fever with it). */
  poison(seconds = 45) {
    this.venom = Math.max(this.venom, seconds);
    this.sick = Math.max(this.sick, 60);
  }

  /** A bandage: the bleeding stops, and it mends a little. */
  bandage() {
    const was = this.bleeding > 0;
    this.bleeding = 0;
    this.health = Math.min(100, this.health + 8);
    return was;
  }

  /** A night's sleep. */
  sleep() {
    this.energy = 100;
    this.hunger = Math.max(5, this.hunger - 20);
    this.thirst = Math.max(5, this.thirst - 25);
    this.sick = Math.max(0, this.sick - 180);
    this.health = Math.min(100, this.health + 25);
  }

  /**
   * How cold it is where you are, 0 (not at all) .. 1 (bitter).
   * @param e { winter, spring, autumn, summer (0..1), seasonality (how
   *            cold the winters are here, 0..1), altitude (m), night (0..1),
   *            rain, snowing }
   */
  coldness(e) {
    // (Underground the seasons don't reach: the ice caves are bitter, the rest mild.)
    if (e.cave !== null && e.cave !== undefined) return e.cave === 3 ? 0.75 : 0;
    // Mountain tops: cold in spring and autumn above about 150 m, and in
    // summer only on the snowy peaks.
    const high = smoothstep(140, 200, e.altitude) * (e.spring + e.autumn + e.winter) + smoothstep(200, 250, e.altitude) * e.summer;
    const winter = e.winter * smoothstep(0.25, 0.6, e.seasonality) * (0.7 + 0.3 * smoothstep(60, 180, e.altitude));
    let cold = Math.max(high, winter);
    if (cold > 0.02) cold += 0.25 * e.night * cold + 0.2 * e.rain * cold + 0.3 * this.wet * cold + 0.2 * (e.snowing ? 1 : 0) * cold + 0.6 * (e.storm ?? 0) * cold;
    // (Out of the wind and the weather, in a shelter.)
    cold *= 1 - 0.6 * (e.shelter ?? 0);
    return Math.min(1.8, cold);
  }

  /**
   * @param e { active (walking about on foot: the stats only run then),
   *            moving, sprinting, swimming, jumped (jumps this frame),
   *            heat (thirst: 0 green country .. 1 savanna .. 2.5 desert,
   *            3 dune sea), coat (wearing one), fire (0..1: by a fire),
   *            inFire, ...coldness(e) }
   */
  update(dt, e) {
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 1.5);
    if (!this.alive || !e.active) return;
    // Hunger: a slow drain (about 40 minutes from full to empty sat
    // still), more walking, much more running, jumping and swimming.
    const work = e.sprinting ? 4 : e.swimming ? 2.2 : e.moving ? 1.3 : 1;
    const fever = this.sick > 0 ? 1.5 : 1;
    this.hunger = Math.max(0, this.hunger - dt * 0.042 * work * fever - (e.jumped ?? 0) * 0.5);
    // Energy: a day's worth (about 45 minutes awake), faster running, carrying a load.
    this.energy = Math.max(0, this.energy - dt * 0.037 * (e.sprinting ? 2 : 1) * (1 + (e.load ?? 0)));
    // Thirst: faster (half an hour or so), and far faster in the heat.
    const heat = 1 + (e.heat ?? 0) * (0.6 + 0.4 * (e.day ?? 1));
    this.thirst = Math.max(0, this.thirst - dt * 0.055 * heat * fever * (e.sprinting ? 2.2 : e.moving ? 1.15 : 1) - (e.jumped ?? 0) * 0.25);
    // Fever passes; bleeding clots in the end.
    if (this.sick > 0) {
      this.sick = Math.max(0, this.sick - dt);
      if (Math.random() < dt / 40) {
        this.hunger = Math.max(0, this.hunger - 8);
        this.thirst = Math.max(0, this.thirst - 8);
        this.retched = true; // (for the sound and the message)
      }
    }
    if (this.bleeding > 0) {
      this.bleeding = Math.max(0, this.bleeding - dt);
      if (this.hurt(dt * 0.5, 'bleeding')) return;
    }
    if (this.venom > 0) {
      this.venom = Math.max(0, this.venom - dt);
      if (this.hurt(dt * 0.32, 'a snakebite')) return;
    }
    // Out in a sandstorm: the dust in your throat, stinging, choking.
    if ((e.dust ?? 0) > 0.4) {
      this.thirst = Math.max(0, this.thirst - dt * 0.06 * e.dust);
      if (this.hurt(dt * 0.08 * e.dust, 'the sandstorm')) return;
    }
    // Heatstroke: out in the desert sun too long, dried out, it takes you.
    this.hot = Math.max(0, Math.min(200, this.hot + dt * (e.exposed ? e.exposed * (this.thirst < 40 ? 1.5 : 1) : -3)));
    if (this.hot > 90 && this.thirst < 40) {
      this.thirst = Math.max(0, this.thirst - dt * 0.15);
      if (this.hurt(dt * 0.35, 'heatstroke')) return;
    }
    // Wet from swimming and the rain; drying off slowly (fast by a fire).
    this.wet = Math.min(1, Math.max(0, this.wet + (e.swimming ? dt * 0.5 : e.rain > 0.2 ? dt * 0.01 * e.rain : -dt * (0.004 + 0.05 * (e.fire ?? 0)))));
    // Warmth.
    this.cold = this.coldness(e);
    if (e.fire > 0) this.warmth = Math.min(100, this.warmth + dt * 9 * e.fire);
    else if (this.cold > 0.03) this.warmth = Math.max(0, this.warmth - dt * this.cold * 0.55 * (e.coat || 1));
    else this.warmth = Math.min(100, this.warmth + dt * 1.2);
    // What hurts: starving, parched, freezing, standing in the fire.
    if (this.hunger <= 0 && this.hurt(dt * 0.6, 'starvation')) return;
    if (this.thirst <= 0 && this.hurt(dt * 0.9, 'thirst')) return;
    if (this.warmth <= 0 && this.hurt(dt * 1.1, 'the cold')) return;
    if (this.energy <= 0 && this.hurt(dt * 0.25, 'exhaustion')) return;
    if (this.sick > 0 && this.hurt(dt * 0.05, 'fever')) return;
    if (e.inFire && this.hurt(dt * 12, 'burns')) return;
    if (e.inLava && this.hurt(dt * 45, 'lava')) return;
    // Mending, while you're looked after.
    if (this.hunger > 40 && this.thirst > 40 && this.warmth > 30 && this.sick <= 0 && this.bleeding <= 0 && this.venom <= 0) this.health = Math.min(100, this.health + dt * (this.hunger > 75 && this.thirst > 75 ? 0.5 : 0.2));
  }

  toJSON() {
    const r = (v) => Math.round(v * 10) / 10;
    return { health: r(this.health), hunger: r(this.hunger), thirst: r(this.thirst), warmth: r(this.warmth), energy: r(this.energy), sick: Math.round(this.sick), bleeding: Math.round(this.bleeding), venom: Math.round(this.venom) };
  }

  load(data) {
    if (!data) return;
    for (const k of ['health', 'hunger', 'thirst', 'warmth', 'energy', 'sick', 'bleeding', 'venom']) if (Number.isFinite(data[k])) this[k] = data[k];
    if (this.health <= 0) this.reset();
  }
}
