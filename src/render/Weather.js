function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * Kinds of weather, from fine to foul, and what each one means:
 *   cover  how much of the sky the clouds fill (0..1)
 *   rain   how hard it rains (0..1)
 *   storm  thunderstorm: lightning, dark clouds, strong wind (0..1)
 */
export const WEATHER = {
  clear: { label: 'Clear', cover: 0.06, rain: 0, storm: 0 },
  fair: { label: 'Fair', cover: 0.3, rain: 0, storm: 0 },
  cloudy: { label: 'Cloudy', cover: 0.58, rain: 0, storm: 0 },
  overcast: { label: 'Overcast', cover: 0.88, rain: 0, storm: 0 },
  rain: { label: 'Rain', cover: 0.93, rain: 0.75, storm: 0 },
  storm: { label: 'Storm', cover: 1, rain: 1, storm: 1 },
};

// Which weather can follow which, and how likely (fine weather is commonest;
// storms build up through cloud and rain, and clear through cloud again).
const NEXT = {
  clear: { clear: 2, fair: 3 },
  fair: { clear: 2, fair: 2, cloudy: 2 },
  cloudy: { fair: 2, cloudy: 1, overcast: 1.5, rain: 0.6 },
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
      if (this.nextChange <= 0) {
        this.kind = Weather.#pick(NEXT[this.kind], this.spring);
        this.nextChange = 100 + Math.random() * 140;
      }
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
