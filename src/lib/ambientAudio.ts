/**
 * Fully synthesized ambient soundscape (zero audio files to download):
 * - a soft winter wind bed (filtered noise with slow LFO)
 * - sparse music-box chimes on a pentatonic scale, through a generated reverb
 * - gentle firework thumps + crackle tails
 * Muted by default; only starts after an explicit user tap (browser autoplay rules).
 */

const PENTATONIC = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51];

class AmbientAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private reverb: ConvolverNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private chimeTimer: ReturnType<typeof setTimeout> | null = null;
  private lastBoomAt = 0;
  private enabled = false;

  get isEnabled(): boolean {
    return this.enabled;
  }

  private setup(): boolean {
    if (this.ctx) return true;
    if (typeof window === 'undefined') return false;
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return false;

    const ctx = new Ctor();
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    // Shared white noise buffer (2s)
    const len = ctx.sampleRate * 2;
    const noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const nd = noise.getChannelData(0);
    for (let i = 0; i < len; i++) nd[i] = Math.random() * 2 - 1;

    // Generated stereo impulse response for a soft snowy-night hall reverb
    const irLen = Math.floor(ctx.sampleRate * 3.2);
    const ir = ctx.createBuffer(2, irLen, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < irLen; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 2.6);
      }
    }
    const reverb = ctx.createConvolver();
    reverb.buffer = ir;
    const reverbGain = ctx.createGain();
    reverbGain.gain.value = 0.5;
    reverb.connect(reverbGain);
    reverbGain.connect(master);

    // Wind bed
    const wind = ctx.createBufferSource();
    wind.buffer = noise;
    wind.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 420;
    windFilter.Q.value = 0.7;
    const windGain = ctx.createGain();
    windGain.gain.value = 0.04;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 180;
    lfo.connect(lfoGain);
    lfoGain.connect(windFilter.frequency);
    wind.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(master);
    wind.start();
    lfo.start();

    this.ctx = ctx;
    this.master = master;
    this.reverb = reverb;
    this.noiseBuffer = noise;
    return true;
  }

  async enable(): Promise<boolean> {
    if (!this.setup() || !this.ctx || !this.master) return false;
    try {
      await this.ctx.resume();
    } catch {
      return false;
    }
    this.enabled = true;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(0.7, now + 1.8);
    this.scheduleChimes();
    return true;
  }

  disable(): void {
    this.enabled = false;
    if (this.chimeTimer) {
      clearTimeout(this.chimeTimer);
      this.chimeTimer = null;
    }
    if (!this.ctx || !this.master) return;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(0, now + 0.8);
    const ctx = this.ctx;
    setTimeout(() => {
      if (!this.enabled) void ctx.suspend();
    }, 1000);
  }

  private scheduleChimes(): void {
    if (this.chimeTimer) clearTimeout(this.chimeTimer);
    const loop = () => {
      if (!this.enabled) return;
      this.playChime();
      if (Math.random() < 0.35) {
        setTimeout(() => this.playChime(), 180 + Math.random() * 260);
      }
      this.chimeTimer = setTimeout(loop, 1500 + Math.random() * 2800);
    };
    this.chimeTimer = setTimeout(loop, 900);
  }

  playChime(freq?: number): void {
    if (!this.enabled || !this.ctx || !this.master || !this.reverb) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const f = freq ?? PENTATONIC[Math.floor(Math.random() * PENTATONIC.length)];

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, now);
    env.gain.exponentialRampToValueAtTime(0.08, now + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, now + 2.6);

    // Music-box timbre: fundamental + soft upper partials
    const partials: Array<[number, number]> = [
      [1, 1],
      [2.0, 0.22],
      [3.01, 0.07],
    ];
    for (const [mult, amp] of partials) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f * mult;
      const g = ctx.createGain();
      g.gain.value = amp;
      osc.connect(g);
      g.connect(env);
      osc.start(now);
      osc.stop(now + 2.7);
    }

    const dry = ctx.createGain();
    dry.gain.value = 0.5;
    env.connect(dry);
    dry.connect(this.master);
    env.connect(this.reverb);
  }

  /** A rising major arpeggio, played when a visitor releases a lantern. */
  playRelease(): void {
    [0, 2, 4, 5].forEach((idx, k) => {
      setTimeout(() => this.playChime(PENTATONIC[idx]), k * 140);
    });
  }

  playBoom(intensity = 1): void {
    if (!this.enabled || !this.ctx || !this.master || !this.noiseBuffer || !this.reverb) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    if (now - this.lastBoomAt < 0.07) return;
    this.lastBoomAt = now;
    const i = Math.max(0.15, Math.min(1, intensity));

    // Deep low thump
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900, now);
    lp.frequency.exponentialRampToValueAtTime(70, now + 0.9);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.4 * i, now + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 1.4);
    src.connect(lp);
    lp.connect(g);
    g.connect(this.master);
    g.connect(this.reverb);
    src.start(now, Math.random() * 0.5);
    src.stop(now + 1.5);

    // Sparkling crackle tail for full shells
    if (i > 0.5) {
      for (let k = 0; k < 6; k++) {
        const t = now + 0.35 + Math.random() * 0.9;
        const c = ctx.createBufferSource();
        c.buffer = this.noiseBuffer;
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 2600;
        const cg = ctx.createGain();
        cg.gain.setValueAtTime(0.0001, t);
        cg.gain.exponentialRampToValueAtTime(0.045 * i, t + 0.004);
        cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
        c.connect(hp);
        hp.connect(cg);
        cg.connect(this.master);
        c.start(t, Math.random() * 1.5);
        c.stop(t + 0.08);
      }
    }
  }
}

export const ambientAudio = new AmbientAudio();
