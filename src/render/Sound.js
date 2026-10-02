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
      // Sand blown over the desert: a fine high hiss of grains, and a softer
      // rolling rush under it.
      sand: this.#bed(this.noise, 'highpass', 4200, 0.5),
      sandLow: this.#bed(this.noise, 'bandpass', 1300, 0.6),
      // A winter storm: the wind howling (its note sweeping), and the deep roar of it.
      storm: this.#bed(this.noise, 'bandpass', 650, 3),
      stormLow: this.#bed(this.brownNoise, 'lowpass', 280, 0.7),
      // The jungle's hum: cicadas, their shrill drone swelling and fading.
      cicada: this.#bed(this.noise, 'bandpass', 4700, 9),
    };
    // (The cicadas' drone throbs, forty-odd times a second.)
    const throb = ctx.createOscillator();
    throb.frequency.value = 43;
    this.cicadaDepth = ctx.createGain();
    this.cicadaDepth.gain.value = 0;
    throb.connect(this.cicadaDepth).connect(this.beds.cicada.gain.gain);
    throb.start();
    this.next = { forest: 0, jungle: 0, night: 0, owl: 0, desert: 0, woodpecker: 0 };
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
    // (No wind, no wind sound: still air low down is silent. Only up on the
    // peaks and ridges is there always a breath of it.)
    const peak = e.high * (0.4 + 0.6 * (e.exposure ?? 0));
    set(this.beds.wind, (0.075 * peak * (0.35 + e.wind) + 0.06 * e.wind * e.wind * (0.7 + 0.6 * gust)) * (0.7 + 0.3 * quiet) * lie, 0.8);
    set(this.beds.gust, (0.03 * e.high * e.wind + 0.015 * e.wind * e.wind) * (0.4 + 1.3 * gust) * quiet * lie, 0.6);
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
    // Sand blowing over the desert as the wind rises (none in still air).
    const desert = e.desert ?? 0, blow = Math.pow(e.wind, 1.3) * (0.4 + 0.9 * gust);
    set(this.beds.sand, 0.055 * desert * blow, 0.5);
    set(this.beds.sandLow, 0.035 * desert * blow, 0.7);
    this.beds.sand.filter.frequency.setTargetAtTime(3800 + 1600 * gust, t, 0.4);
    // A winter storm: the wind howling, its note rising and falling with the gusts.
    const storm = e.storm ?? 0;
    set(this.beds.storm, 0.07 * storm * (0.5 + 0.8 * gust) * (1 - 0.5 * (e.hollow ?? 0)), 0.6);
    set(this.beds.stormLow, 0.12 * storm * (0.6 + 0.5 * gust), 0.8);
    this.beds.storm.filter.frequency.setTargetAtTime(420 + 650 * gust + 160 * Math.sin(t * 0.37), t, 0.5);
    // The jungle's hum by day: cicadas swelling in waves.
    const swellC = 0.45 + 0.55 * Math.max(0, Math.sin(t * 0.55 + Math.sin(t * 0.17) * 2));
    const cicada = 0.03 * e.jungle * e.day * (1 - e.rain) * swellC * quiet;
    set(this.beds.cicada, cicada, 1.2);
    this.cicadaDepth.gain.setTargetAtTime(cicada * 0.9, t, 1.2);
    const buzz = (0.022 * e.jungle + 0.012 * e.grass * (1 - e.woods) + 0.008 * (e.wetland ?? 0)) * e.day * (1 - e.rain) * quiet;
    set(this.beds.insects, buzz);
    this.insectDepth.gain.setTargetAtTime(buzz * 0.8, t, 1.5);

    // Birds sing in the woods by day, most at dawn; crickets chirp in the
    // grass at night; frogs croak in the wetlands, from dusk on.
    const birds = (e.woods * 0.7 + e.jungle + 0.25 * e.grass) * Math.max(e.day * 0.6, e.dawn * 1.6) * (1 - e.rain) * quiet;
    if (birds > 0.05 && t > this.nextBird) {
      // Each kind of country its own birds: robins, chickadees, cardinals,
      // warblers and doves in the woods; thrushes in the pines; meadowlarks
      // over the grass; whoops, toucans and parrots in the jungle.
      const r = Math.random() * (e.woods + e.jungle + 0.25 * e.grass + 1e-6);
      const pick = (list) => list[Math.floor(Math.random() * list.length)];
      if (r < e.jungle) {
        const k = Math.random();
        this.call(k < 0.4 ? 'song7' : k < 0.7 ? 'toucan' : 'parrot', Math.random() * 1.6 - 0.8, 0.3 + 0.5 * Math.random());
      } else if (r < e.jungle + e.woods) this.call(`song${pick((e.pine ?? 0) > 0.5 ? [5, 5, 1, 3] : [0, 0, 1, 2, 3, 4, 5])}`, Math.random() * 1.6 - 0.8, 0.3 + 0.6 * Math.random());
      else this.call(`song${pick([6, 6, 3, 4])}`, Math.random() * 1.6 - 0.8, 0.3 + 0.5 * Math.random());
      this.nextBird = t + (0.6 + Math.random() * 3.5) / Math.min(2, birds);
    }
    const N = this.next, calm = 1 - Math.min(1, e.wind * 2.5);
    // A forest on a still day: hardly a sound, but now and then a twig
    // snapping off among the trees, a woodpecker drumming, a rustle in the
    // leaves, a cuckoo far off.
    if (e.woods > 0.4 && calm > 0.4 && e.rain < 0.3 && t > N.forest) {
      const k = Math.random();
      const pan = Math.random() * 1.8 - 0.9;
      if (k < 0.35) this.call('twig', pan, 0.12 + 0.2 * Math.random());
      else if (k < 0.6 && e.day > 0.5) this.call('woodpecker', pan, 0.2 + 0.3 * Math.random());
      else if (k < 0.85) this.call('rustle', pan, 0.15 + 0.2 * Math.random());
      else if (e.day > 0.5) this.call('cuckoo', pan, 0.25);
      N.forest = t + 4 + Math.random() * 10;
    }
    // Owls in the woods at night.
    if (e.woods + e.jungle * 0.5 > 0.4 && e.day < 0.2 && e.rain < 0.3 && t > N.owl) {
      this.call('owl', Math.random() * 1.6 - 0.8, 0.25 + 0.3 * Math.random());
      N.owl = t + 12 + Math.random() * 30;
    }
    // The jungle, alive: howler monkeys roaring far off, by day and by
    // night; at night the katydids and tree frogs all round.
    if (e.jungle > 0.3 && t > N.jungle) {
      const k = Math.random(), pan = Math.random() * 1.8 - 0.9;
      if (k < 0.25) this.call('howler', pan, 0.15 + 0.2 * Math.random());
      else if (e.day < 0.3) this.call(k < 0.65 ? 'katydid' : 'treefrog', pan, 0.3 + 0.4 * Math.random());
      else this.call('chatter', pan, 0.1 + 0.15 * Math.random());
      N.jungle = t + (e.day < 0.3 ? 0.4 + Math.random() * 1.6 : 5 + Math.random() * 12) / Math.max(0.4, e.jungle);
    }
    // Bugs in the night: katydids in the woods and the grass, mosquitoes
    // and tree frogs in the wetlands.
    if (e.day < 0.25 && (e.woods + e.grass + (e.wetland ?? 0)) > 0.3 && e.rain < 0.3 && t > N.night) {
      this.call((e.wetland ?? 0) > 0.4 && Math.random() < 0.5 ? 'treefrog' : 'katydid', Math.random() * 1.8 - 0.9, (0.2 + 0.3 * Math.random()) * quiet);
      N.night = t + 0.6 + Math.random() * 2.5;
    }
    // Sand trickling down the dunes as the wind blows.
    if (desert > 0.4 && e.wind > 0.25 && t > N.desert) {
      this.call('sandslide', Math.random() * 1.6 - 0.8, 0.5 * desert * e.wind);
      N.desert = t + 3 + Math.random() * 8;
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
   * taking off), 'howl' (wolves), 'yip' (coyotes), 'croak' (a frog), 'peep'
   * (a spring peeper); and not creatures: 'splash', 'bigsplash', 'rumble' (a
   * volcano), 'crackle' (a fire).
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
    // Noise through a low- or high-pass filter (a wash of it), and a
    // droplet: a tiny bright tick.
    const wash = (start, len, type, freq, peak, attack = 0.01, sweep = null) => {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.setValueAtTime(freq, start);
      if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, start + len);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(peak, start + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, start + len);
      src.connect(f).connect(g).connect(out);
      src.start(start, Math.random() * 3);
      src.stop(start + len + 0.05);
    };
    // A bubble's "plop": a pure tone rising fast (as a bubble in water rings).
    const bloop = (start, f0, len, peak) => tone(start, len, 'sine', f0, f0 * (2 + Math.random()), f0 * 1.6, 0.7, peak);
    const drops = (start, n, spread, peak, wet = false) => {
      for (let k = 0; k < n; k++) {
        const at = start + Math.pow(Math.random(), 1.6) * spread;
        const fade = 1 - (at - start) / (spread * 1.2);
        // (`wet`: drops pattering back onto water: little clicks of noise, no plops.)
        if (!wet && Math.random() < 0.5) bloop(at, 900 + Math.random() * 1400, 0.035 + Math.random() * 0.03, peak * fade * 0.6);
        else noise(at, 0.025 + Math.random() * 0.02, 2500 + Math.random() * 4000, 2.5, peak * fade);
      }
    };
    // Churning water: a burst of noise through a band sweeping down from
    // `f0` to `f1`, its loudness tumbling irregularly as the water breaks
    // up (never a smooth hiss), dying away over `len`.
    const churn = (start, len, f0, f1, q, peak) => {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = q;
      f.frequency.setValueAtTime(f0, start);
      f.frequency.exponentialRampToValueAtTime(f1, start + len);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(peak, start + 0.008);
      for (let k = 1, at = start + 0.02; at < start + len; k++, at += 0.012 + Math.random() * 0.018) {
        const env = peak * Math.pow(1 - (at - start) / len, 1.8);
        g.gain.linearRampToValueAtTime(Math.max(0.0001, env * (0.35 + 0.65 * Math.random())), at);
      }
      g.gain.linearRampToValueAtTime(0.0001, start + len);
      src.connect(f).connect(g).connect(out);
      src.start(start, Math.random() * 3);
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
    } else if (kind === 'howl') {
      // A long rising, falling howl, and another voice joining in.
      tone(t, 2.6, 'sine', 380, 520, 600, 1.2, 0.12, 5);
      tone(t + 1.1, 2.2, 'sine', 460, 600, 700, 1.2, 0.08, 6);
    } else if (kind === 'yip') {
      const n = 4 + Math.floor(Math.random() * 5);
      for (let k = 0; k < n; k++) tone(t + k * 0.16 + Math.random() * 0.05, 0.12, 'sawtooth', 900 + Math.random() * 300, 1300, 1200, 1.5, 0.05);
    } else if (kind === 'croak') {
      // A frog: a low, rattling croak or two.
      const n = 1 + Math.floor(Math.random() * 2), f = 160 + Math.random() * 90;
      for (let k = 0; k < n; k++) tone(t + k * 0.26, 0.18, 'square', f * 1.1, f * 0.85, f * 2.4, 1.6, 0.07, 38);
    } else if (kind === 'peep') {
      // A spring peeper: a high rising whistle.
      tone(t, 0.12, 'sine', 2500 + Math.random() * 300, 3000 + Math.random() * 300, 2800, 1, 0.035);
    } else if (kind === 'splash') {
      // Into the water: the slap on the surface, the 'plunk' of the hollow
      // it punches in the water closing (a quick falling note), the rush of
      // water thrown up, then bubbles popping (tiny rising notes) and drops
      // pattering back down.
      const big = 0.85 + Math.random() * 0.3;
      wash(t, 0.04, 'highpass', 1500, 0.45, 0.001);
      tone(t + 0.01, 0.13 * big, 'sine', 700 + Math.random() * 250, 190, 420, 0.6, 0.32);
      churn(t + 0.01, 0.3 * big, 2600 + Math.random() * 600, 700, 0.8, 0.3);
      for (let k = 0; k < 9; k++) {
        const at = t + 0.06 + Math.pow(Math.random(), 1.4) * 0.5 * big, f = 1100 + Math.random() * 1900;
        tone(at, 0.025 + Math.random() * 0.03, 'sine', f, f * (1.6 + Math.random() * 0.6), f * 1.3, 0.8, 0.07 * (1 - (at - t) / 0.7));
      }
      drops(t + 0.18, 6 + Math.floor(Math.random() * 4), 0.45, 0.04, true);
    } else if (kind === 'bigsplash') {
      // Something heavy into deep water: a deep 'whump' and slap, the big
      // falling plunk as the water closes over the hole, a great rush of
      // water thrown up and crashing back, and a long fizz of bubbles and drops.
      tone(t, 0.3, 'sine', 120, 45, 100, 0.7, 0.35);
      wash(t, 0.07, 'highpass', 1000, 0.55, 0.001);
      tone(t + 0.06, 0.28, 'sine', 420, 110, 260, 0.6, 0.35);
      churn(t + 0.01, 0.75, 3600, 500, 0.6, 0.45);
      churn(t + 0.45, 0.7, 1800, 400, 0.6, 0.25); // (the water crashing back)
      for (let k = 0; k < 22; k++) {
        const at = t + 0.25 + Math.pow(Math.random(), 1.3) * 1.3, f = 800 + Math.random() * 2200;
        tone(at, 0.03 + Math.random() * 0.04, 'sine', f, f * (1.5 + Math.random() * 0.8), f * 1.3, 0.8, 0.06 * (1 - (at - t) / 1.8));
      }
      drops(t + 0.5, 22, 1.2, 0.05, true);
    } else if (kind === 'rumble') {
      noise(t, 3.5, 70, 0.7, 0.35, 3);
      tone(t, 3, 'sine', 42, 30, 60, 0.7, 0.25);
    } else if (kind === 'baa') {
      // A sheep: a wavering bleat.
      tone(t, 0.7, 'sawtooth', 330 + Math.random() * 60, 300, 900, 1.5, 0.08, 11);
    } else if (kind === 'chop') {
      // An axe biting wood: a knock and a crack.
      tone(t, 0.12, 'triangle', 190, 120, 400, 1.2, 0.3);
      noise(t, 0.08, 1800, 1.5, 0.18);
    } else if (kind === 'creak') {
      // A tree about to go: a long groaning creak.
      tone(t, 1.3, 'sawtooth', 70, 110, 260, 4, 0.12, 9);
      noise(t + 0.9, 0.5, 900, 1, 0.1, 30);
    } else if (kind === 'treefall') {
      // It hits the ground: a thud and the crash of branches.
      tone(t, 0.6, 'sine', 70, 35, 120, 0.8, 0.5);
      noise(t, 1.1, 1300, 0.6, 0.35, 14);
      noise(t, 0.3, 300, 0.8, 0.4);
    } else if (kind === 'growl') {
      noise(t, 1.2, 160, 2, 0.3, 24);
      tone(t, 1.2, 'sawtooth', 70, 60, 180, 1.5, 0.18, 22);
    } else if (kind === 'snarl') {
      noise(t, 0.7, 700, 2, 0.2, 38);
      tone(t, 0.7, 'sawtooth', 190, 150, 500, 2, 0.1, 30);
    } else if (kind === 'hurt') {
      tone(t, 0.25, 'sawtooth', 240, 150, 600, 1.2, 0.15);
      noise(t, 0.15, 500, 1, 0.2);
    } else if (kind === 'eat') {
      for (let k = 0; k < 3; k++) noise(t + k * 0.16, 0.08, 1400 + Math.random() * 600, 2, 0.12);
    } else if (kind === 'drink') {
      for (let k = 0; k < 3; k++) tone(t + k * 0.22, 0.12, 'sine', 500 + Math.random() * 100, 260, 400, 1, 0.12);
    } else if (kind === 'pickup') {
      noise(t, 0.08, 2600, 1.5, 0.1);
      tone(t, 0.08, 'triangle', 600, 900, 800, 1, 0.08);
    } else if (kind === 'craft' || kind === 'place') {
      tone(t, 0.1, 'triangle', 220, 160, 420, 1.2, 0.25);
      tone(t + 0.14, 0.1, 'triangle', 260, 180, 420, 1.2, 0.2);
    } else if (kind === 'strike') {
      // Flint on steel: a bright scrape and a click.
      noise(t, 0.12, 5200, 3, 0.18);
      tone(t, 0.05, 'square', 2400, 1800, 3000, 2, 0.05);
    } else if (kind === 'whoosh') {
      noise(t, 0.4, 700, 0.7, 0.15);
    } else if (kind === 'thunk') {
      tone(t, 0.15, 'sine', 150, 80, 220, 1, 0.35);
      noise(t, 0.06, 900, 1, 0.15);
    } else if (kind === 'stab') {
      // A blade or a point going into flesh: a dull wet thud.
      tone(t, 0.16, 'sine', 130, 55, 160, 0.8, 0.45);
      wash(t, 0.12, 'bandpass', 650, 0.2, 0.003);
      noise(t + 0.02, 0.1, 1200, 3, 0.06);
    } else if (kind === 'bleat') {
      // A deer's (an elk's) bleat: a high nasal wavering cry.
      tone(t, 0.45, 'sawtooth', 620 + Math.random() * 120, 520, 1300, 2, 0.07, 14);
    } else if (kind === 'squeal') {
      // A boar hurt or charging: a harsh rising shriek.
      tone(t, 0.7, 'sawtooth', 700, 1500, 1400, 1.2, 0.12, 25);
      tone(t + 0.05, 0.6, 'square', 1050, 2100, 2000, 2, 0.04, 31);
    } else if (kind === 'oink') {
      // Boar rooting about: short deep nasal grunts.
      const n = 2 + Math.floor(Math.random() * 3);
      for (let k = 0; k < n; k++) tone(t + k * 0.22 + Math.random() * 0.05, 0.14, 'sawtooth', 120 + Math.random() * 30, 90, 520, 2.5, 0.12, 40);
    } else if (kind === 'bellow') {
      // A moose: a long low moaning call, cracking at the end.
      tone(t, 1.8, 'sawtooth', 190, 110, 400, 2.5, 0.14, 6);
      noise(t + 1.3, 0.5, 300, 2, 0.08, 18);
    } else if (kind === 'bugle') {
      // An elk's bugle: a deep rising note breaking into a high whistling
      // scream, then falling away in grunts.
      tone(t, 0.6, 'sawtooth', 220, 700, 900, 1.5, 0.06);
      tone(t + 0.45, 1.6, 'sine', 1400, 1900, 1700, 3, 0.1, 7);
      tone(t + 1.9, 0.5, 'sine', 1800, 700, 1000, 2, 0.05);
      for (let k = 0; k < 3; k++) tone(t + 2.5 + k * 0.28, 0.16, 'sawtooth', 110, 90, 300, 1.5, 0.1);
    } else if (kind === 'scream') {
      // A cougar's scream in the night: harsh, human, horrible.
      tone(t, 1.5, 'sawtooth', 900, 600, 1500, 1.2, 0.12, 9);
      tone(t, 1.5, 'square', 1350, 900, 2400, 2, 0.04, 13);
      noise(t, 1.4, 2200, 1.2, 0.08);
    } else if (kind === 'hiss') {
      // A snake, a cornered cat: a long breathy hiss.
      wash(t, 0.9, 'highpass', 3500, 0.12, 0.03);
    } else if (kind === 'rattle') {
      // A rattlesnake's rattle: a dry buzzing whirr.
      noise(t, 0.65, 5500, 2, 0.14, 55);
      noise(t, 0.65, 3200, 3, 0.06, 55);
    } else if (kind === 'gobble') {
      // A turkey's gobble: a rapid tumbling warble.
      const n = 9 + Math.floor(Math.random() * 5);
      for (let k = 0; k < n; k++) tone(t + k * 0.055, 0.06, 'sawtooth', 700 + Math.random() * 250, 520, 1100, 2, 0.06);
    } else if (kind === 'quack') {
      const n = 1 + Math.floor(Math.random() * 3);
      for (let k = 0; k < n; k++) {
        tone(t + k * 0.24, 0.16, 'sawtooth', 480, 380, 1300, 3, 0.1);
        tone(t + k * 0.24, 0.16, 'square', 240, 190, 700, 2, 0.04);
      }
    } else if (kind === 'squeak') {
      tone(t, 0.18, 'sine', 2100, 2700, 2400, 2, 0.06);
    } else if (kind === 'crash') {
      // Something broken into: splintering wood and a heavy thump.
      tone(t, 0.3, 'sine', 90, 45, 130, 0.8, 0.35);
      for (let k = 0; k < 5; k++) noise(t + k * 0.07 + Math.random() * 0.05, 0.12, 900 + Math.random() * 1500, 1.5, 0.14);
    } else if (kind === 'twang') {
      // A crossbow loosed: the snap of the string, the bolt away.
      tone(t, 0.25, 'triangle', 190, 150, 300, 1.5, 0.3);
      noise(t, 0.05, 3000, 2, 0.18);
      wash(t + 0.03, 0.25, 'bandpass', 900, 0.08, 0.01, 400);
    } else if (kind === 'winch') {
      // Winding a crossbow: the ratchet clicking.
      for (let k = 0; k < 8; k++) noise(t + k * 0.24, 0.03, 4200, 5, 0.1);
      tone(t, 1.9, 'sawtooth', 70, 90, 300, 4, 0.03);
    } else if (kind === 'click') {
      noise(t, 0.03, 3500, 4, 0.18);
      tone(t, 0.04, 'square', 1200, 900, 1500, 2, 0.05);
    } else if (kind === 'ignite') {
      // A torch or a fire catching: a soft whoomph and the first crackles.
      wash(t, 0.5, 'lowpass', 300, 0.25, 0.05, 1600);
      for (let k = 0; k < 4; k++) noise(t + 0.2 + Math.random() * 0.4, 0.04, 3000 + Math.random() * 2000, 2, 0.06);
    } else if (kind === 'grind') {
      // Steel on the turning stone: a rasping, sparking whine.
      noise(t, 1.1, 3200, 2, 0.12, 12);
      tone(t, 1.1, 'sawtooth', 900, 1100, 2400, 5, 0.03, 8);
    } else if (kind === 'dig') {
      // A blade into the earth: a crunch and the soil turned over.
      wash(t, 0.18, 'lowpass', 900, 0.25, 0.005);
      noise(t + 0.12, 0.2, 500, 1, 0.12);
    } else if (kind === 'pour') {
      noise(t, 1.0, 1100, 1.2, 0.1, 17);
      for (let k = 0; k < 5; k++) bloop(t + Math.random() * 0.9, 500 + Math.random() * 400, 0.05, 0.03);
    } else if (kind === 'shear') {
      for (let k = 0; k < 3; k++) noise(t + k * 0.18, 0.05, 4200, 3, 0.14);
    } else if (kind === 'roar') {
      // A tiger's roar: a huge, rough, rising-then-falling bellow.
      tone(t, 1.6, 'sawtooth', 110, 70, 260, 1.2, 0.35, 18);
      noise(t, 1.5, 380, 1.4, 0.3, 26);
      tone(t + 0.05, 1.4, 'sawtooth', 220, 140, 520, 2, 0.12, 21);
    } else if (kind === 'chuff') {
      // A big cat's friendly chuff: a short puffing snort or two.
      for (let k = 0; k < 2; k++) noise(t + k * 0.22, 0.14, 650, 1.2, 0.18);
    } else if (kind === 'jaguar') {
      // A jaguar's 'sawing': a run of deep, coarse grunts, like a saw through wood.
      const n = 5 + Math.floor(Math.random() * 5);
      for (let k = 0; k < n; k++) {
        tone(t + k * 0.42, 0.24, 'sawtooth', 130, 95, 300, 1.5, 0.22, 30);
        noise(t + k * 0.42, 0.22, 420, 1.5, 0.14, 35);
      }
    } else if (kind === 'howler') {
      // Howler monkeys: a deep, roaring, rising and falling chorus, carrying far.
      for (let k = 0; k < 3; k++) {
        const s = t + k * 0.6 + Math.random() * 0.3;
        tone(s, 1.5, 'sawtooth', 160 + Math.random() * 40, 120, 420, 1.2, 0.12, 9);
        noise(s, 1.4, 520, 1.6, 0.09, 12);
      }
    } else if (kind === 'chatter') {
      // Monkeys chattering: a fast run of shrill squeaks.
      const n = 6 + Math.floor(Math.random() * 8);
      for (let k = 0; k < n; k++) tone(t + k * 0.07 + Math.random() * 0.03, 0.06, 'square', 1500 + Math.random() * 900, 1100 + Math.random() * 500, 1800, 2, 0.05);
    } else if (kind === 'rustle') {
      // Leaves and branches shaken: a short scratchy rustle.
      noise(t, 0.35, 3800, 0.8, 0.12, 40);
    } else if (kind === 'moose') {
      // A moose: a deep, hollow, nasal grunt, a cow's long moaning call.
      tone(t, 0.9, 'sawtooth', 120, 85, 300, 2.5, 0.2, 7);
    } else if (kind === 'mew') {
      // A cow elk's mew: a high, squealing chirp.
      tone(t, 0.35, 'sawtooth', 900, 700, 1500, 2, 0.06, 16);
    } else if (kind === 'huff') {
      // A bear's huff and jaw-pop: a blast of breath, a hollow clack.
      noise(t, 0.3, 300, 0.9, 0.3);
      tone(t + 0.32, 0.05, 'square', 420, 300, 600, 3, 0.15);
    } else if (kind === 'bark') {
      // A fox's bark: a sharp, hoarse, high 'wow' or two, carrying in the night.
      for (let k = 0; k < 2 + Math.floor(Math.random() * 2); k++) {
        tone(t + k * 0.5, 0.18, 'sawtooth', 1100, 700, 1400, 2, 0.1);
        noise(t + k * 0.5, 0.15, 1600, 2, 0.06);
      }
    } else if (kind === 'goat') {
      // A mountain goat's bleat: short, nasal, a little hoarse.
      tone(t, 0.4, 'sawtooth', 420 + Math.random() * 80, 360, 1100, 1.8, 0.09, 13);
    } else if (kind === 'panda') {
      // A giant panda's bleat: a soft goat-like bleat.
      tone(t, 0.5, 'sawtooth', 520, 440, 1000, 2, 0.06, 10);
    } else if (kind === 'crocBellow') {
      // A crocodile's bellow: a low, rumbling growl that trembles.
      tone(t, 1.6, 'sawtooth', 58, 50, 140, 1.2, 0.35, 11);
      noise(t, 1.5, 160, 1.5, 0.22, 11);
    } else if (kind === 'thump') {
      // A rabbit's warning thump on the ground.
      tone(t, 0.08, 'sine', 110, 70, 140, 0.8, 0.25);
    } else if (kind === 'owl') {
      // An owl: a soft, deep 'hoo, hoo-hoo, hooo'.
      const f = 330 + Math.random() * 60;
      for (const [d, len] of [[0, 0.35], [0.7, 0.18], [0.92, 0.18], [1.25, 0.6]]) tone(t + d, len, 'sine', f, f * 0.94, f, 1, 0.1);
    } else if (kind === 'woodpecker') {
      // A woodpecker drumming on a dead branch: a fast run of knocks, slowing.
      const n = 14 + Math.floor(Math.random() * 10);
      for (let k = 0, at = t; k < n; k++, at += 0.045 + k * 0.0018) tone(at, 0.03, 'triangle', 900, 700, 900, 2, 0.12 * (1 - (k / n) * 0.5));
    } else if (kind === 'cuckoo') {
      tone(t, 0.3, 'sine', 700, 690, 700, 1, 0.08);
      tone(t + 0.4, 0.4, 'sine', 560, 550, 560, 1, 0.08);
    } else if (kind === 'toucan') {
      // A toucan's (or a parrot's) harsh croaking calls.
      const n = 2 + Math.floor(Math.random() * 4);
      for (let k = 0; k < n; k++) tone(t + k * 0.3, 0.18, 'sawtooth', 700 + Math.random() * 300, 500, 1100, 1.5, 0.08, 25);
    } else if (kind === 'parrot') {
      const n = 1 + Math.floor(Math.random() * 3);
      for (let k = 0; k < n; k++) tone(t + k * 0.35, 0.25, 'square', 1800 + Math.random() * 800, 1200, 2200, 1.5, 0.06, 32);
    } else if (kind === 'whoop') {
      // A tropical bird's rising, liquid whoop.
      tone(t, 0.45, 'sine', 500, 1300, 1000, 1, 0.08);
    } else if (kind === 'katydid') {
      // Katydids in the night: a rasping 'ka-ty-did'.
      for (let k = 0; k < 3; k++) noise(t + k * 0.12, 0.06, 6500 + Math.random() * 800, 4, 0.06, 90);
    } else if (kind === 'treefrog') {
      // A tree frog: a quick, high, ringing 'peep' or a rattle.
      const n = 1 + Math.floor(Math.random() * 3);
      for (let k = 0; k < n; k++) tone(t + k * 0.15, 0.07, 'square', 2600 + Math.random() * 600, 2200, 2800, 3, 0.03);
    } else if (kind === 'twig') {
      // A twig snapping, off in the woods.
      noise(t, 0.03, 3000, 1, 0.3);
      tone(t, 0.025, 'square', 1400, 600, 1800, 2, 0.1);
    } else if (kind === 'crack') {
      // A branch cracking underfoot: a split second of sharp splintering clicks.
      for (let k = 0; k < 3; k++) noise(t + k * 0.012 + Math.random() * 0.008, 0.025, 2200 + Math.random() * 2500, 1.2, 0.35);
      tone(t, 0.04, 'square', 1700, 500, 1500, 1.5, 0.12);
      noise(t + 0.03, 0.12, 900, 1, 0.12); // (and the dull snap of the wood)
    } else if (kind === 'sandslide') {
      // A trickle of sand sliding off a dune's crest: a long soft hiss.
      wash(t, 2.2, 'bandpass', 3800, 0.06, 0.6, 2500);
    } else if (kind === 'wave') {
      // A wave bursting on the rocks: the thump of it, the roar of the
      // water thrown up, and the long seething hiss as it pours back off.
      tone(t, 0.4, 'sine', 70, 40, 90, 0.7, 0.35);
      churn(t, 1.3, 1800, 300, 0.5, 0.5);
      wash(t + 0.2, 2.6, 'bandpass', 3200, 0.16, 0.25, 1600);
      drops(t + 0.5, 16, 1.6, 0.05, true);
    } else if (kind.startsWith('song')) {
      this.#song(Number(kind.slice(4)) || 0, out, t);
    } else if (kind === 'crackle') {
      for (let k = 0; k < 6; k++) noise(t + Math.random() * 0.8, 0.04, 2500 + Math.random() * 2500, 2, 0.05 + Math.random() * 0.06);
    }
  }

  /**
   * A bird's song, by species (`v`): 0 a robin's warbled phrases, 1 a
   * chickadee's 'fee-bee', 2 a cardinal's run of slurred whistles, 3 a
   * warbler's fast trill, 4 a dove's soft cooing, 5 a thrush's fluting
   * spiral, 6 a meadowlark's falling flute, 7 a tropical bird's whoops.
   */
  #song(v, out, t) {
    const ctx = this.ctx;
    const note = (start, len, f0, f1, peak, vib = 0) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(f0, start);
      o.frequency.exponentialRampToValueAtTime(f1, start + len);
      if (vib) {
        const lfo = ctx.createOscillator(), depth = ctx.createGain();
        lfo.frequency.value = vib;
        depth.gain.value = f0 * 0.03;
        lfo.connect(depth).connect(o.frequency);
        lfo.start(start);
        lfo.stop(start + len + 0.05);
      }
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(peak, start + Math.min(0.02, len * 0.3));
      g.gain.exponentialRampToValueAtTime(0.0001, start + len);
      o.connect(g).connect(out);
      o.start(start);
      o.stop(start + len + 0.05);
    };
    const r = Math.random;
    if (v === 0) {
      let at = t;
      for (let k = 0, n = 3 + Math.floor(r() * 4); k < n; k++) {
        const f = 2300 + r() * 900;
        note(at, 0.16, f, f * (r() < 0.5 ? 1.25 : 0.8), 0.06);
        note(at + 0.17, 0.12, f * 1.1, f * 0.9, 0.05);
        at += 0.42 + r() * 0.15;
      }
    } else if (v === 1) {
      note(t, 0.32, 4000, 3950, 0.05);
      note(t + 0.38, 0.32, 3450, 3400, 0.045);
    } else if (v === 2) {
      for (let k = 0, n = 4 + Math.floor(r() * 5); k < n; k++) note(t + k * 0.21, 0.18, 3600, 1900, 0.06);
    } else if (v === 3) {
      for (let k = 0, n = 12 + Math.floor(r() * 8); k < n; k++) note(t + k * 0.04, 0.03, 5600 + (k % 2) * 400, 5200, 0.02 + 0.03 * (k / n));
    } else if (v === 4) {
      const f = 470 + r() * 60;
      for (const [d, len, k] of [[0, 0.35, 1], [0.45, 0.55, 1.15], [1.1, 0.3, 1], [1.5, 0.3, 1]]) note(t + d, len, f * k, f * k * 0.95, 0.05);
    } else if (v === 5) {
      [1800, 2300, 2900, 3600].forEach((f, k) => note(t + k * 0.18, 0.2, f, f * 1.04, 0.05, 30));
      for (let k = 0; k < 6; k++) note(t + 0.8 + k * 0.05, 0.04, 4200, 3800, 0.03);
    } else if (v === 6) {
      [3100, 2700, 2400, 2000, 1800].forEach((f, k) => note(t + k * 0.16 + (k > 2 ? 0.08 : 0), 0.18, f, f * 0.92, 0.055));
    } else {
      for (let k = 0, n = 2 + Math.floor(r() * 3); k < n; k++) note(t + k * 0.5, 0.4, 500 + r() * 200, 1300 + r() * 400, 0.06);
    }
  }

  /**
   * A footstep on `surface` ('grass', 'leaves' (the forest floor), 'dirt',
   * 'rock', 'sand', 'snow', 'mud', 'water', 'wood'), as loud as `volume`
   * (running: louder, sharper).
   */
  step(surface, volume = 1) {
    if (!this.ctx || !this.enabled || volume < 0.02) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.005;
    const out = ctx.createGain();
    out.gain.value = volume * (0.9 + Math.random() * 0.2);
    out.connect(this.muffle);
    const burst = (start, len, type, f, q, peak, attack = 0.004) => {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const fl = ctx.createBiquadFilter();
      fl.type = type;
      fl.frequency.value = f;
      fl.Q.value = q;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(peak, start + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, start + len);
      src.connect(fl).connect(g).connect(out);
      src.start(start, Math.random() * 3);
      src.stop(start + len + 0.02);
    };
    const thud = (start, f, len, peak) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(f, start);
      o.frequency.exponentialRampToValueAtTime(f * 0.55, start + len);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(peak, start + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, start + len);
      o.connect(g).connect(out);
      o.start(start);
      o.stop(start + len + 0.02);
    };
    const grains = (start, n, spread, f, peak) => {
      for (let k = 0; k < n; k++) burst(start + Math.random() * spread, 0.012 + Math.random() * 0.012, 'bandpass', f * (0.7 + Math.random() * 0.7), 2, peak * (0.5 + Math.random() * 0.5), 0.002);
    };
    if (surface === 'grass') {
      thud(t, 120, 0.06, 0.05);
      burst(t, 0.13, 'bandpass', 2600, 0.7, 0.06, 0.015); // (the swish of the blades)
    } else if (surface === 'leaves') {
      thud(t, 110, 0.06, 0.05);
      grains(t, 7, 0.09, 3800, 0.08); // (dry leaves and litter crunching)
    } else if (surface === 'dirt') {
      thud(t, 105, 0.07, 0.07);
      burst(t, 0.06, 'highpass', 2200, 0.7, 0.02);
    } else if (surface === 'rock') {
      burst(t, 0.025, 'highpass', 2800, 0.8, 0.09, 0.001); // (the scuff and click of a sole on stone)
      thud(t, 260, 0.04, 0.04);
      grains(t + 0.01, 2, 0.04, 4500, 0.03);
    } else if (surface === 'sand') {
      burst(t, 0.17, 'lowpass', 2600, 0.6, 0.07, 0.03); // (sand giving and shifting: a soft 'shhk')
      thud(t, 90, 0.05, 0.03);
    } else if (surface === 'snow') {
      grains(t, 12, 0.13, 1600, 0.09); // (snow packing down: crunch)
      thud(t, 95, 0.05, 0.03);
    } else if (surface === 'mud') {
      burst(t, 0.2, 'lowpass', 700, 0.8, 0.09, 0.02); // (the squelch...)
      thud(t + 0.02, 160, 0.15, 0.06);
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(300, t + 0.12);
      o.frequency.exponentialRampToValueAtTime(700, t + 0.17); // (...and the suck of the foot coming out)
      g.gain.setValueAtTime(0.0001, t + 0.12);
      g.gain.exponentialRampToValueAtTime(0.03, t + 0.13);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      o.connect(g).connect(out);
      o.start(t + 0.12);
      o.stop(t + 0.2);
    } else if (surface === 'water') {
      burst(t, 0.03, 'highpass', 1500, 0.7, 0.1, 0.001);
      burst(t + 0.01, 0.22, 'bandpass', 1900, 0.8, 0.1, 0.01); // (wading: the slosh)
      grains(t + 0.06, 4, 0.2, 3500, 0.03);
    } else if (surface === 'wood') {
      thud(t, 190, 0.08, 0.12); // (hollow boards)
      burst(t, 0.03, 'bandpass', 1400, 1.5, 0.05, 0.002);
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
