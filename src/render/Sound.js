/**
 * Sounds, made on the fly with the Web Audio API (no sound files):
 *  - weather: the hiss and patter of rain, and thunder, a sharp crack for
 *    a close strike and a long low rumble for a distant one;
 *  - the country round you (see ambience): wind, stronger up high and on
 *    ridges (where it whistles), hushed in valleys and under the trees
 *    (whose leaves rustle as the gusts come through); surf on the coast,
 *    and the roar of waterfalls, the babble of streams and the rush of
 *    rivers, each from where it is (louder as you come near, off to the
 *    side it's on); birdsong in the woods by day (a dawn chorus at
 *    sunrise); insects buzzing in the jungle and the savanna heat;
 *    crickets in the grass at night; frogs in the wetlands of an evening;
 *    the low roar of molten lava; and the hush of snow.
 *
 * Browsers only allow sound after the page has been clicked or a key
 * pressed, so it starts on the first one. Underground, everything is muffled.
 */
export class Sound {
  constructor() {
    this.enabled = true;
    this.ctx = null;
    const start = () => {
      this.#init();
      window.removeEventListener('pointerdown', start);
      window.removeEventListener('keydown', start);
    };
    window.addEventListener('pointerdown', start);
    window.addEventListener('keydown', start);
  }

  #init() {
    if (this.ctx) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = (this.ctx = new AudioContext());
    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? 1 : 0;
    // Everything passes a low-pass filter, closed down underground.
    this.muffle = ctx.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.frequency.value = 20000;
    this.muffle.connect(this.master);
    this.master.connect(ctx.destination);

    // A few seconds of noise, looped for rain and reused for thunder.
    const length = ctx.sampleRate * 4;
    this.noise = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    let brown = 0;
    this.brownNoise = ctx.createBuffer(1, length, ctx.sampleRate);
    const deep = this.brownNoise.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
      brown = (brown + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      deep[i] = brown * 3.5;
    }

    // Rain: a hiss (high noise) over a soft roar (low noise).
    this.rainGain = ctx.createGain();
    this.rainGain.gain.value = 0;
    this.rainGain.connect(this.muffle);
    const hiss = ctx.createBufferSource();
    hiss.buffer = this.noise;
    hiss.loop = true;
    const hissFilter = ctx.createBiquadFilter();
    hissFilter.type = 'bandpass';
    hissFilter.frequency.value = 2600;
    hissFilter.Q.value = 0.5;
    hiss.connect(hissFilter).connect(this.rainGain);
    hiss.start();
    const roar = ctx.createBufferSource();
    roar.buffer = this.brownNoise;
    roar.loop = true;
    const roarGain = ctx.createGain();
    roarGain.gain.value = 0.6;
    roar.connect(roarGain).connect(this.rainGain);
    roar.start();

    this.#initAmbience();
  }

  // Continuous beds of sound, each a looped noise through a filter into its
  // own gain (and a panner, for those that come from somewhere).
  #bed(buffer, type, frequency, q = 1, panned = false) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.playbackRate.value = 0.9 + Math.random() * 0.2;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const pan = panned && ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    src.connect(filter).connect(gain);
    if (pan) gain.connect(pan).connect(this.muffle);
    else gain.connect(this.muffle);
    src.start(0, Math.random() * 3);
    return { gain, filter, pan };
  }

  #initAmbience() {
    const ctx = this.ctx;
    this.beds = {
      wind: this.#bed(this.brownNoise, 'bandpass', 420, 0.6),
      gust: this.#bed(this.noise, 'bandpass', 900, 0.8),
      surf: this.#bed(this.brownNoise, 'lowpass', 520, 0.7, true),
      whistle: this.#bed(this.noise, 'bandpass', 900, 12),
      rustle: this.#bed(this.noise, 'bandpass', 3400, 0.7),
      fall: this.#bed(this.brownNoise, 'lowpass', 1100, 0.5, true),
      fallHiss: this.#bed(this.noise, 'bandpass', 1600, 0.6, true),
      brook: this.#bed(this.noise, 'bandpass', 2400, 1.4, true),
      river: this.#bed(this.brownNoise, 'lowpass', 480, 0.7, true),
      lava: this.#bed(this.brownNoise, 'lowpass', 110, 0.9),
      insects: this.#bed(this.noise, 'bandpass', 5200, 6),
    };
    // A bees' nest: a low, beating hum (a few saw tones a little out of tune).
    const hum = ctx.createBiquadFilter();
    hum.type = 'lowpass';
    hum.frequency.value = 900;
    for (const [f, v] of [[196, 0.5], [203.5, 0.5], [392, 0.25]]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = v;
      o.connect(g).connect(hum);
      o.start();
    }
    const humGain = ctx.createGain();
    humGain.gain.value = 0;
    const humPan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    hum.connect(humGain);
    if (humPan) humGain.connect(humPan).connect(this.muffle);
    else humGain.connect(this.muffle);
    this.beds.buzz = { gain: humGain, filter: hum, pan: humPan };
    // Insects buzz: their hiss throbbing twenty-odd times a second.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 23;
    const depth = ctx.createGain();
    depth.gain.value = 0;
    lfo.connect(depth).connect(this.beds.insects.gain.gain);
    lfo.start();
    this.insectDepth = depth;
    this.env = null;
    this.nextBird = 0;
    this.nextCricket = 0;
    this.nextFrog = 0;
  }

  /**
   * What's around you (each 0..1): { woods, jungle, grass, wetland, ocean,
   * lava, high, snowy, day, dawn, dusk, wind, rain }; and the lie of the
   * land and the air: exposure (on a ridge or peak), hollow (down in a
   * valley), canopy (under the trees), bare (their leaves fallen), gust
   * (one passing now); and the water: fall, brook and river (how loud) and
   * fallPan, brookPan, riverPan and surfPan (-1 left .. 1 right). Call every
   * frame; the mix eases towards it.
   */
  ambience(env) {
    if (!this.ctx || !this.beds) return;
    this.env = env;
    const t = this.ctx.currentTime;
    const e = env, quiet = 1 - 0.6 * e.snowy; // snow deadens everything
    const set = (bed, v, lag = 1.5) => bed.gain.gain.setTargetAtTime(v, t, lag);
    // The wind: up on a ridge it blows harder, and whistles; down in a
    // valley or in among the trees it's hushed, and there the leaves rustle
    // as each gust comes through.
    const lie = (1 + 0.9 * (e.exposure ?? 0)) * (1 - 0.5 * (e.hollow ?? 0)) * (1 - 0.45 * (e.canopy ?? 0));
    const gust = e.gust ?? 0;
    set(this.beds.wind, (0.025 + 0.09 * e.high + 0.05 * e.wind * (0.7 + 0.6 * gust)) * (0.7 + 0.3 * quiet) * lie, 0.8);
    set(this.beds.gust, (0.006 + 0.03 * e.high * e.wind + 0.015 * e.wind) * (0.4 + 1.3 * gust) * quiet * lie, 0.6);
    this.beds.wind.filter.frequency.setTargetAtTime(300 + 260 * e.wind + 160 * gust + 120 * Math.sin(t * 0.13), t, 1);
    set(this.beds.whistle, 0.022 * (e.exposure ?? 0) * e.wind * (0.45 + 0.9 * gust) * quiet, 0.8);
    this.beds.whistle.filter.frequency.setTargetAtTime(700 + 450 * gust + 180 * Math.sin(t * 0.61) + 90 * Math.sin(t * 1.7), t, 0.4);
    set(this.beds.rustle, 0.05 * (e.canopy ?? 0) * (1 - 0.75 * (e.bare ?? 0)) * (0.15 + e.wind) * (0.25 + 1.1 * gust) * quiet, 0.5);
    // Running water, from where it is: the roar of a waterfall, the babble
    // of a stream (its note jumping about), the steady rush of a river.
    const pan = (bed, v) => bed.pan && bed.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, v ?? 0)), t, 0.3);
    set(this.beds.fall, 0.2 * (e.fall ?? 0), 0.4);
    set(this.beds.fallHiss, 0.09 * (e.fall ?? 0), 0.4);
    pan(this.beds.fall, e.fallPan);
    pan(this.beds.fallHiss, e.fallPan);
    set(this.beds.brook, 0.07 * (e.brook ?? 0) * (0.75 + 0.25 * Math.random()), 0.08);
    this.beds.brook.filter.frequency.setTargetAtTime(1700 + Math.random() * 1700, t, 0.06);
    pan(this.beds.brook, e.brookPan);
    set(this.beds.river, 0.1 * (e.river ?? 0), 0.5);
    pan(this.beds.river, e.riverPan);
    pan(this.beds.surf, e.surfPan);
    set(this.beds.buzz, 0.035 * (e.buzz ?? 0), 0.3);
    pan(this.beds.buzz, e.buzzPan);
    // The surf: waves rolling in every seven seconds or so.
    const swell = 0.55 + 0.45 * Math.sin(t * 0.9 + Math.sin(t * 0.23) * 1.5);
    set(this.beds.surf, 0.12 * e.ocean * swell * quiet, 0.8);
    set(this.beds.lava, 0.2 * e.lava);
    const buzz = (0.018 * e.jungle + 0.012 * e.grass * (1 - e.woods)) * e.day * (1 - e.rain) * quiet;
    set(this.beds.insects, buzz);
    this.insectDepth.gain.setTargetAtTime(buzz * 0.8, t, 1.5);

    // Birds sing in the woods by day, most at dawn; crickets chirp in the
    // grass at night; frogs croak in the wetlands, from dusk on.
    const birds = (e.woods * 0.7 + e.jungle + 0.25 * e.grass) * Math.max(e.day * 0.6, e.dawn * 1.6) * (1 - e.rain) * quiet;
    if (birds > 0.05 && t > this.nextBird) {
      this.#chirp(birds, e.jungle);
      this.nextBird = t + (0.4 + Math.random() * 3.5) / Math.min(2, birds);
    }
    const crickets = (e.grass + 0.6 * e.woods + 0.5 * e.jungle) * (1 - e.day) * (1 - e.rain) * quiet;
    if (crickets > 0.08 && t > this.nextCricket) {
      this.#cricket(crickets);
      this.nextCricket = t + 0.25 + Math.random() * 1.2 / crickets;
    }
    const frogs = e.wetland * Math.max(1 - e.day, e.dusk) * quiet;
    if (frogs > 0.08 && t > this.nextFrog) {
      this.#croak(frogs);
      this.nextFrog = t + 0.3 + Math.random() * 2.2 / frogs;
    }
  }

  // A few notes of birdsong: quick whistled sweeps, from somewhere nearby.
  #chirp(amount, tropical) {
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.02;
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (pan) pan.pan.value = Math.random() * 1.6 - 0.8;
    const out = ctx.createGain();
    out.gain.value = (0.02 + 0.03 * Math.random()) * Math.min(1, amount);
    (pan ? out.connect(pan).connect(this.muffle) : out.connect(this.muffle));
    const base = tropical > 0.5 && Math.random() < 0.5 ? 900 + Math.random() * 700 : 2200 + Math.random() * 2400;
    const notes = 2 + Math.floor(Math.random() * 5);
    for (let k = 0; k < notes; k++) {
      const start = t + k * (0.09 + Math.random() * 0.08);
      const len = 0.05 + Math.random() * 0.1;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      const f = base * (0.8 + Math.random() * 0.5);
      osc.frequency.setValueAtTime(f, start);
      osc.frequency.exponentialRampToValueAtTime(f * (Math.random() < 0.5 ? 1.5 : 0.7), start + len);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(1, start + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, start + len);
      osc.connect(g).connect(out);
      osc.start(start);
      osc.stop(start + len + 0.02);
    }
  }

  // A cricket's chirp: three quick pulses of a high tone.
  #cricket(amount) {
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.02;
    const f = 4200 + Math.random() * 900;
    const g = ctx.createGain();
    g.gain.value = 0;
    const osc = ctx.createOscillator();
    osc.frequency.value = f;
    osc.connect(g).connect(this.muffle);
    const v = (0.006 + 0.008 * Math.random()) * Math.min(1, amount);
    for (let k = 0; k < 3; k++) {
      const s = t + k * 0.05;
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(v, s + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.035);
    }
    osc.start(t);
    osc.stop(t + 0.2);
  }

  // A frog's croak: a low, buzzing, rising-and-falling note.
  #croak(amount) {
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.02;
    const len = 0.18 + Math.random() * 0.25;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    const f = 110 + Math.random() * 160;
    osc.frequency.setValueAtTime(f, t);
    osc.frequency.linearRampToValueAtTime(f * 1.25, t + len * 0.4);
    osc.frequency.linearRampToValueAtTime(f * 0.9, t + len);
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 700;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime((0.015 + 0.02 * Math.random()) * Math.min(1, amount), t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    osc.connect(low).connect(g).connect(this.muffle);
    osc.start(t);
    osc.stop(t + len + 0.05);
    // Often a second croak straight after.
    if (Math.random() < 0.4) setTimeout(() => this.ctx && this.#croak(amount * 0.8), (len + 0.08) * 1000);
  }

  /**
   * A creature's call, from off to one side (`pan`, -1 left .. 1 right), as
   * loud as `volume` (0..1): 'caw' (a crow), 'gull', 'hawk' (a long
   * screech), 'snort' (a startled deer), 'grunt' (a bison), 'flutter' (birds
   * taking off).
   */
  call(kind, pan = 0, volume = 1) {
    if (!this.ctx || !this.enabled || volume < 0.02) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.02;
    const out = ctx.createGain();
    out.gain.value = volume;
    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (panner) {
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      out.connect(panner).connect(this.muffle);
    } else out.connect(this.muffle);
    // A tone sweeping from f0 to f1 over `len`, through a band-pass at `band`.
    const tone = (start, len, type, f0, f1, band, q, peak, wobble = 0) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f0, start);
      o.frequency.exponentialRampToValueAtTime(f1, start + len);
      if (wobble) {
        const lfo = ctx.createOscillator(), depth = ctx.createGain();
        lfo.frequency.value = wobble;
        depth.gain.value = f0 * 0.04;
        lfo.connect(depth).connect(o.frequency);
        lfo.start(start);
        lfo.stop(start + len + 0.05);
      }
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = band;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(peak, start + Math.min(0.03, len * 0.2));
      g.gain.exponentialRampToValueAtTime(0.0001, start + len);
      o.connect(f).connect(g).connect(out);
      o.start(start);
      o.stop(start + len + 0.05);
    };
    const noise = (start, len, band, q, peak, flutter = 0) => {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = band;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(peak, start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, start + len);
      if (flutter) {
        const lfo = ctx.createOscillator(), depth = ctx.createGain();
        lfo.frequency.value = flutter;
        depth.gain.value = peak * 0.8;
        lfo.connect(depth).connect(g.gain);
        lfo.start(start);
        lfo.stop(start + len);
      }
      src.connect(f).connect(g).connect(out);
      src.start(start, Math.random() * 2);
      src.stop(start + len + 0.05);
    };
    if (kind === 'caw') {
      const n = 2 + Math.floor(Math.random() * 3);
      for (let k = 0; k < n; k++) tone(t + k * 0.32, 0.22, 'sawtooth', 560 + Math.random() * 80, 430, 1100, 1.5, 0.09);
    } else if (kind === 'gull') {
      const n = 2 + Math.floor(Math.random() * 3);
      for (let k = 0; k < n; k++) tone(t + k * 0.42, 0.34, 'sawtooth', 1500 + Math.random() * 200, 950, 1700, 1.2, 0.05, 28);
    } else if (kind === 'hawk') {
      tone(t, 1.1, 'sawtooth', 2700, 1800, 2400, 2.5, 0.06, 18);
      noise(t, 1.0, 2600, 3, 0.02);
    } else if (kind === 'snort') {
      noise(t, 0.28, 900, 1.2, 0.12);
    } else if (kind === 'grunt') {
      tone(t, 0.7, 'sawtooth', 85, 65, 220, 1, 0.2);
    } else if (kind === 'flutter') {
      noise(t, 0.9, 1400, 0.8, 0.07, 22);
    }
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.1);
  }

  /** Call every frame: rain loudness 0..1, and whether you're underground. */
  update(rain, sheltered) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.rainGain.gain.setTargetAtTime(rain * 0.16, t, 0.5);
    this.muffle.frequency.setTargetAtTime(sheltered ? 500 : 20000, t, 0.3);
  }

  /**
   * A roll of thunder from `distance` metres away, off to the side `pan`
   * (-1 left .. 1 right): a strike right by you cracks like a gunshot; far
   * off, only a low grumble reaches you, and quieter.
   */
  thunder(distance, pan = 0) {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const near = Math.max(0, Math.min(1, 1 - (distance - 250) / 1300)); // 1 close .. 0 far
    const faint = Math.min(1, 2400 / Math.max(2400, distance)); // (and quieter still, well beyond)
    const out = ctx.createGain();
    out.gain.value = faint;
    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (panner) {
      // (The nearer, the more it comes from its own side; far off it rolls all round.)
      panner.pan.value = Math.max(-1, Math.min(1, pan * (0.35 + 0.5 * near)));
      out.connect(panner).connect(this.muffle);
    } else out.connect(this.muffle);

    // The rumble: deep noise, swelling and dying away over several seconds.
    const rumble = ctx.createBufferSource();
    rumble.buffer = this.brownNoise;
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 180 + 500 * near;
    const gain = ctx.createGain();
    const peak = 0.35 + 0.55 * near;
    const length = 3.5 + 3 * (1 - near);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + 0.05 + 0.4 * (1 - near));
    // A couple of re-swells as the sound comes back off the land.
    gain.gain.exponentialRampToValueAtTime(peak * 0.4, t + length * 0.3);
    gain.gain.exponentialRampToValueAtTime(peak * 0.7, t + length * 0.42);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
    rumble.connect(low).connect(gain).connect(out);
    rumble.start(t, Math.random() * 2);
    rumble.stop(t + length + 0.1);

    // A close strike cracks first (right by you, a deafening one).
    const close = 1 - Math.min(1, Math.max(0, (distance - 80) / 220));
    if (near > 0.5) {
      const crack = ctx.createBufferSource();
      crack.buffer = this.noise;
      const high = ctx.createBiquadFilter();
      high.type = 'highpass';
      high.frequency.value = 900;
      const cg = ctx.createGain();
      cg.gain.setValueAtTime(0.0001, t);
      cg.gain.exponentialRampToValueAtTime(0.5 * near + 0.5 * close, t + 0.01);
      cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.45 + 0.3 * close);
      crack.connect(high).connect(cg).connect(out);
      crack.start(t);
      crack.stop(t + 0.5);
    }
  }
}
