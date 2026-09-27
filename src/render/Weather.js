function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

const STEP = 0.5; // seconds between the history's entries
const HISTORY = 800; // (so it goes back nearly seven minutes)
const EASE = 25; // seconds for the cloud to build or break (see update)

/**
 * Kinds of weather, from fine to foul, and what each one means:
 *   cover  how much of the sky the clouds fill (0..1)
 *   rain   how hard it rains (0..1)
 *   storm  thunderstorm: lightning, dark clouds, strong wind (0..1)
 */
export const WEATHER = {
  clear: { label: 'Clear', cover: 0.12, rain: 0, storm: 0 },
  fair: { label: 'Fair', cover: 0.42, rain: 0, storm: 0 },
  cloudy: { label: 'Cloudy', cover: 0.64, rain: 0, storm: 0 },
  overcast: { label: 'Overcast', cover: 0.88, rain: 0, storm: 0 },
  rain: { label: 'Rain', cover: 0.93, rain: 0.75, storm: 0 },
  storm: { label: 'Storm', cover: 1, rain: 1, storm: 1 },
};

// Which weather can follow which, and how likely (fine weather is commonest;
// storms build up through cloud and rain, and clear through cloud again).
const NEXT = {
  clear: { clear: 1.5, fair: 3 },
  fair: { clear: 1.5, fair: 2, cloudy: 2.5 },
  cloudy: { fair: 2, cloudy: 1.2, overcast: 1.5, rain: 0.4 },
  overcast: { cloudy: 1.5, overcast: 0.5, rain: 1.5 },
  rain: { overcast: 1.5, rain: 1, storm: 0.8, cloudy: 0.5 },
  storm: { rain: 2, overcast: 1 },
};

/**
 * The weather, changing by itself: every couple of minutes it moves on to a
 * neighbouring kind (clear, fair, cloudy, overcast, rain, storm), and the
 * sky eases into it: cloud builds up or breaks over tens of seconds, rain
 * starts once the clouds are thick and stops before they clear.
 *
 * Also rolls a new sunset each evening: how much the sky and clouds catch
 * fire. The best sunsets come with broken cloud that the low sun can light
 * from below; a clear sky glows mainly along the horizon; under overcast
 * there's little to see. (See sunsetGlow.)
 *
 * `set(kind)` pins the weather (for testing); `set('auto')` lets it change
 * by itself again. `setSunset('vivid' | 'dull' | 'auto')` likewise.
 */
export class Weather {
  constructor(start = 'fair') {
    this.kind = start;
    this.auto = true;
    this.cover = WEATHER[start].cover;
    this.rain = WEATHER[start].rain;
    this.storm = WEATHER[start].storm;
    this.nextChange = 90 + Math.random() * 120;
    this.sunsetQuality = 0.4 + Math.random() * 0.6;
    this.sunsetMode = 'auto';
    this._lastHour = null;
    this.hurry = 0; // seconds left of a quick change
    this.spring = 0; // how much it's spring (0..1): showery weather comes more often
    this.upcoming = null; // the kind of weather that comes next, once it's decided
    // What the weather has been over the last few minutes (cover, rain,
    // storm every half second, newest at `head`): the clouds that have
    // drifted past still carry it (see at).
    this.history = new Float32Array(HISTORY * 3);
    this.head = 0;
    this.filled = 0;
    this.tick = 0;
  }

  set(kind) {
    if (kind === 'auto') {
      this.auto = true;
      this.nextChange = 60 + Math.random() * 120;
      return;
    }
    this.auto = false;
    this.kind = kind;
    this.hurry = 6; // picked by hand: change over a couple of seconds, not a minute
  }

  setSunset(mode) {
    this.sunsetMode = mode;
  }

  /**
   * The weather on its way, if it changes within the minute: { kind, in }
   * (seconds until it starts to set in), else null.
   */
  get coming() {
    return this.upcoming && this.upcoming !== this.kind && this.nextChange < 60 ? { kind: this.upcoming, in: Math.max(0, this.nextChange) } : null;
  }

  /**
   * The weather `tau` seconds from now (or ago, if negative), as it is
   * here: { cover, rain, storm } into `out`. The weather travels with the
   * clouds, so this is also the weather out upwind (what's coming) or
   * downwind (what's gone by) at the distance the clouds drift in that
   * time. Behind: what it was; ahead: what it will be, as far as that's
   * decided (the next change is known in advance).
   */
  at(tau, out) {
    if (tau <= 0) {
      if (this.filled === 0) return Object.assign(out, { cover: this.cover, rain: this.rain, storm: this.storm });
      const back = Math.min(this.filled - 1, -tau / STEP);
      const i0 = Math.floor(back), f = back - i0, i1 = Math.min(this.filled - 1, i0 + 1);
      const h = this.history, a = ((this.head - i0 + HISTORY) % HISTORY) * 3, b = ((this.head - i1 + HISTORY) % HISTORY) * 3;
      out.cover = h[a] + (h[b] - h[a]) * f;
      out.rain = h[a + 1] + (h[b + 1] - h[a + 1]) * f;
      out.storm = h[a + 2] + (h[b + 2] - h[a + 2]) * f;
      return out;
    }
    // Ahead: the cover eases towards this weather's, then (once it
    // changes) the next one's; rain and storm follow the cover as in update.
    const now = WEATHER[this.kind];
    const change = this.auto && this.upcoming ? Math.max(0, this.nextChange) : Infinity;
    const then = tau > change ? WEATHER[this.upcoming] : now;
    let cover;
    if (tau <= change) cover = now.cover + (this.cover - now.cover) * Math.exp(-tau / EASE);
    else {
      const c1 = now.cover + (this.cover - now.cover) * Math.exp(-change / EASE);
      cover = then.cover + (c1 - then.cover) * Math.exp(-(tau - change) / EASE);
    }
    const settle = 1 - Math.exp(-tau / 10); // (from how it is now)
    const rain = then.rain * smoothstep(0.75, 0.9, cover);
    out.cover = cover;
    out.rain = this.rain + (rain - this.rain) * settle;
    out.storm = this.storm + (then.storm * smoothstep(0.5, 0.9, rain) - this.storm) * settle;
    return out;
  }

  /** How wet the weather on its way is (0..1), growing as it nears: rain showers, a storm's lightning. */
  get approaching() {
    const c = this.coming;
    if (!c) return { rain: 0, storm: 0 };
    const near = 1 - c.in / 60;
    return { rain: WEATHER[c.kind].rain * near, storm: WEATHER[c.kind].storm * near };
  }

  get label() {
    return WEATHER[this.kind].label;
  }

  /**
   * @param dt    seconds
   * @param hour  time of day (a new sunset is rolled each afternoon)
   */
  update(dt, hour) {
    if (this.auto) {
      this.nextChange -= dt;
      // What's coming is decided a minute ahead, so it can be seen coming
      // (see `coming`): showers and far-off lightning out on the horizon.
      // (Decided a change ahead, so the clouds bringing it can be seen
      // coming from far upwind: see at.)
      if (!this.upcoming) this.upcoming = Weather.#pick(NEXT[this.kind], this.spring);
      if (this.nextChange <= 0) {
        this.kind = this.upcoming;
        this.upcoming = Weather.#pick(NEXT[this.kind], this.spring);
        this.nextChange = 100 + Math.random() * 140;
      }
    } else {
      this.upcoming = null;
    }
    // Roll the evening's sunset as the afternoon begins.
    if (this._lastHour !== null && this._lastHour < 14 && hour >= 14) this.sunsetQuality = Math.random();
    this._lastHour = hour;

    const target = WEATHER[this.kind];
    // Clouds build up (or break) over tens of seconds; rain only falls from
    // thick cloud, starting after it and stopping before it clears. When
    // the weather is picked by hand it all happens within a couple of seconds.
    const pace = this.hurry > 0 ? 20 : 1;
    this.hurry = Math.max(0, this.hurry - dt);
    this.cover += (target.cover - this.cover) * Math.min(1, (dt * pace) / 25);
    const rainTarget = target.rain * smoothstep(0.75, 0.9, this.cover);
    this.rain += (rainTarget - this.rain) * Math.min(1, (dt * pace) / (rainTarget > this.rain ? 12 : 8));
    this.storm += (target.storm * smoothstep(0.5, 0.9, this.rain) - this.storm) * Math.min(1, (dt * pace) / 10);
    if (this.rain < 1e-3) this.rain = 0;
    if (this.storm < 1e-3) this.storm = 0;

    // Into the history; picked by hand, it's that weather everywhere at once.
    this.tick += dt;
    const h = this.history;
    if (this.hurry > 0) {
      for (let k = 0; k < HISTORY; k++) h.set([this.cover, this.rain, this.storm], k * 3);
      this.filled = HISTORY;
    } else if (this.tick >= STEP) {
      this.tick %= STEP;
      this.head = (this.head + 1) % HISTORY;
      this.filled = Math.min(HISTORY, this.filled + 1);
    }
    h[this.head * 3] = this.cover;
    h[this.head * 3 + 1] = this.rain;
    h[this.head * 3 + 2] = this.storm;
  }

  /**
   * How brightly the sky and clouds light up at sunset tonight (0..1):
   * the evening's roll, best with broken cloud to catch the light, muted
   * with no cloud, poor under overcast and gone in rain.
   */
  get sunsetGlow() {
    const q = this.sunsetMode === 'vivid' ? 1 : this.sunsetMode === 'dull' ? 0.08 : this.sunsetQuality;
    const c = this.cover;
    const clouds = 0.45 + 0.55 * smoothstep(0.08, 0.3, c); // something to light up
    const overcast = 1 - 0.85 * smoothstep(0.7, 0.95, c); // but not a lid of cloud
    return q * clouds * overcast * (1 - this.rain);
  }

  /** A weighted pick of what comes next; in spring, cloud and rain are twice as likely (clear skies less so). */
  static #pick(weights, spring = 0) {
    const WETTER = { cloudy: 1.6, overcast: 1.8, rain: 2.2, storm: 1.3, clear: 0.6, fair: 0.8 };
    const w = (k) => weights[k] * (1 + ((WETTER[k] ?? 1) - 1) * spring);
    let total = 0;
    for (const k in weights) total += w(k);
    let r = Math.random() * total;
    for (const k in weights) {
      r -= w(k);
      if (r <= 0) return k;
    }
    return Object.keys(weights)[0];
  }
}
