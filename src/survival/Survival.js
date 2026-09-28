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

  /** Eats (or drinks): `food` { hunger, thirst, health }. */
  consume(food) {
    this.hunger = Math.min(100, this.hunger + (food.hunger ?? 0));
    this.thirst = Math.min(100, this.thirst + (food.thirst ?? 0));
    if (food.health > 0) this.health = Math.min(100, this.health + food.health);
    else if (food.health < 0) this.hurt(-food.health, 'food poisoning');
  }

  /**
   * How cold it is where you are, 0 (not at all) .. 1 (bitter).
   * @param e { winter, spring, autumn, summer (0..1), seasonality (how
   *            cold the winters are here, 0..1), altitude (m), night (0..1),
   *            rain, snowing }
   */
  coldness(e) {
    // Mountain tops: cold in spring and autumn above about 150 m, and in
    // summer only on the snowy peaks.
    const high = smoothstep(140, 200, e.altitude) * (e.spring + e.autumn + e.winter) + smoothstep(200, 250, e.altitude) * e.summer;
    const winter = e.winter * smoothstep(0.25, 0.6, e.seasonality) * (0.7 + 0.3 * smoothstep(60, 180, e.altitude));
    let cold = Math.max(high, winter);
    if (cold > 0.02) cold += 0.25 * e.night * cold + 0.2 * e.rain * cold + 0.3 * this.wet * cold + 0.2 * (e.snowing ? 1 : 0) * cold;
    return Math.min(1.5, cold);
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
    this.hunger = Math.max(0, this.hunger - dt * 0.042 * work - (e.jumped ?? 0) * 0.5);
    // Thirst: faster (half an hour or so), and far faster in the heat.
    const heat = 1 + (e.heat ?? 0) * (0.6 + 0.4 * (e.day ?? 1));
    this.thirst = Math.max(0, this.thirst - dt * 0.055 * heat * (e.sprinting ? 2.2 : e.moving ? 1.15 : 1) - (e.jumped ?? 0) * 0.25);
    // Wet from swimming and the rain; drying off slowly (fast by a fire).
    this.wet = Math.min(1, Math.max(0, this.wet + (e.swimming ? dt * 0.5 : e.rain > 0.2 ? dt * 0.01 * e.rain : -dt * (0.004 + 0.05 * (e.fire ?? 0)))));
    // Warmth.
    this.cold = this.coldness(e);
    if (e.fire > 0) this.warmth = Math.min(100, this.warmth + dt * 9 * e.fire);
    else if (this.cold > 0.03) this.warmth = Math.max(0, this.warmth - dt * this.cold * 0.55 * (e.coat ? 0.3 : 1));
    else this.warmth = Math.min(100, this.warmth + dt * 1.2);
    // What hurts: starving, parched, freezing, standing in the fire.
    if (this.hunger <= 0 && this.hurt(dt * 0.6, 'starvation')) return;
    if (this.thirst <= 0 && this.hurt(dt * 0.9, 'thirst')) return;
    if (this.warmth <= 0 && this.hurt(dt * 1.1, 'the cold')) return;
    if (e.inFire && this.hurt(dt * 12, 'burns')) return;
    // Mending, while you're looked after.
    if (this.hunger > 40 && this.thirst > 40 && this.warmth > 30) this.health = Math.min(100, this.health + dt * (this.hunger > 75 && this.thirst > 75 ? 0.5 : 0.2));
  }

  toJSON() {
    return { health: this.health, hunger: this.hunger, thirst: this.thirst, warmth: this.warmth };
  }
}
