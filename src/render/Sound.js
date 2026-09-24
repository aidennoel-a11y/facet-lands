/**
 * Weather sounds, made on the fly with the Web Audio API (no sound files):
 * the hiss and patter of rain, and thunder, a sharp crack for a close strike
 * and a long low rumble for a distant one.
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

  /** A roll of thunder from `distance` metres away. */
  thunder(distance) {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const near = Math.max(0, 1 - (distance - 250) / 1300); // 1 close .. 0 far

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
    rumble.connect(low).connect(gain).connect(this.muffle);
    rumble.start(t, Math.random() * 2);
    rumble.stop(t + length + 0.1);

    // A close strike cracks first.
    if (near > 0.5) {
      const crack = ctx.createBufferSource();
      crack.buffer = this.noise;
      const high = ctx.createBiquadFilter();
      high.type = 'highpass';
      high.frequency.value = 900;
      const cg = ctx.createGain();
      cg.gain.setValueAtTime(0.0001, t);
      cg.gain.exponentialRampToValueAtTime(0.5 * near, t + 0.01);
      cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
      crack.connect(high).connect(cg).connect(this.muffle);
      crack.start(t);
      crack.stop(t + 0.5);
    }
  }
}
