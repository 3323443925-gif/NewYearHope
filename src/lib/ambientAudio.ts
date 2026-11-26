/**
 * Layered winter night audio engine:
 * 1) Synthesized ambient soundscape (zero external audio required):
 *    - soft winter wind bed (filtered noise with slow LFO)
 *    - sparse music-box chimes on a pentatonic scale through generated hall reverb
 *    - lantern release arpeggio & firework thumps + crackle tails
 * 2) Rotating playlist player for curated songs under /public (e.g. .mp4 / .mp3 / .m4a),
 *    layered gently with the ambient winter soundscape and smooth volume cross-fades.
 *
 * Defaults to enabled on every visit/refresh, starting immediately when permitted by the
 * browser and seamlessly unlocking synchronously on the very first user gesture otherwise.
 */

const PENTATONIC = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51];
const TARGET_MUSIC_VOLUME = 0.45;

export type PlayMode = 'loop-all' | 'shuffle' | 'loop-one';

export interface PlaylistTrack {
  id: string;
  title: string;
  src: string;
}

export const DEFAULT_PLAYLIST_TRACKS: PlaylistTrack[] = [
  {
    id: '1猫猫.mp4',
    title: '1猫猫',
    src: `/${encodeURIComponent('1猫猫.mp4')}`,
  },
  {
    id: '2lostmypieces.mp4',
    title: '2lostmypieces',
    src: `/${encodeURIComponent('2lostmypieces.mp4')}`,
  },
  {
    id: '3黄昏之时.mp4',
    title: '3黄昏之时',
    src: `/${encodeURIComponent('3黄昏之时.mp4')}`,
  },
];

export interface AudioSnapshot {
  enabled: boolean;
  playing: boolean;
  needsGesture: boolean;
  tracks: PlaylistTrack[];
  currentTrack: PlaylistTrack | null;
  trackIndex: number;
  trackCount: number;
  playMode: PlayMode;
}

class AmbientAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private reverb: ConvolverNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private chimeTimer: ReturnType<typeof setTimeout> | null = null;
  private stateListenerBound = false;
  private lastBoomAt = 0;

  // Playlist player state
  private tracks: PlaylistTrack[] = [...DEFAULT_PLAYLIST_TRACKS];
  private trackIndex = 0;
  private playMode: PlayMode = 'loop-all';
  private musicEl: HTMLAudioElement | null = null;
  private musicFadeRaf: number | null = null;
  private nextTrackTimer: ReturnType<typeof setTimeout> | null = null;
  private consecutiveErrors = 0;

  // Playback / autoplay state (default ON)
  private enabled = true;
  private ambientRunning = false;
  private musicPlaying = false;
  private needsGesture = false;
  private listeners = new Set<() => void>();

  get isEnabled(): boolean {
    return this.enabled;
  }

  get isPlaying(): boolean {
    return this.enabled && (this.ambientRunning || this.musicPlaying);
  }

  getSnapshot(): AudioSnapshot {
    return {
      enabled: this.enabled,
      playing: this.isPlaying,
      needsGesture: this.enabled && this.needsGesture,
      tracks: this.tracks,
      currentTrack: this.tracks[this.trackIndex] ?? null,
      trackIndex: this.trackIndex,
      trackCount: this.tracks.length,
      playMode: this.playMode,
    };
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    this.listeners.forEach((fn) => fn());
  }

  setTracks(nextTracks: PlaylistTrack[]): void {
    if (!nextTracks || nextTracks.length === 0) return;
    const currentId = this.tracks[this.trackIndex]?.id;
    this.tracks = [...nextTracks];
    const preservedIdx = currentId
      ? this.tracks.findIndex((t) => t.id === currentId)
      : -1;
    this.trackIndex = preservedIdx >= 0 ? preservedIdx : 0;
    this.consecutiveErrors = 0;
    this.emit();
  }

  setPlayMode(mode: PlayMode): void {
    this.playMode = mode;
    this.emit();
  }

  cyclePlayMode(): PlayMode {
    const order: PlayMode[] = ['loop-all', 'shuffle', 'loop-one'];
    const next = order[(order.indexOf(this.playMode) + 1) % order.length];
    this.playMode = next;
    this.emit();
    return next;
  }

  private setupWebAudio(): boolean {
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

    // Soft winter wind bed
    const wind = ctx.createBufferSource();
    wind.buffer = noise;
    wind.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 420;
    windFilter.Q.value = 0.7;
    const windGain = ctx.createGain();
    windGain.gain.value = 0.036;
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

    if (!this.stateListenerBound) {
      this.stateListenerBound = true;
      ctx.addEventListener('statechange', () => {
        if (ctx.state === 'running' && this.enabled) {
          this.onWebAudioRunning();
        }
      });
    }

    return true;
  }

  private onWebAudioRunning(): void {
    if (!this.ctx || !this.master || !this.enabled) return;
    const wasRunning = this.ambientRunning;
    this.ambientRunning = true;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(0.68, now + 1.5);
    if (!wasRunning || !this.chimeTimer) {
      this.scheduleChimes();
    }
    if (this.musicPlaying || this.tracks.length === 0) {
      this.needsGesture = false;
    }
    this.emit();
  }

  /**
   * Fires AudioContext.resume() synchronously inside the current call stack
   * (critical for Safari/Chrome user-gesture activation), and caps waiting
   * at 150ms because Chromium keeps ctx.resume() pending forever if blocked.
   */
  private tryResumeContextSync(): Promise<boolean> {
    if (!this.setupWebAudio() || !this.ctx) return Promise.resolve(false);
    const ctx = this.ctx;
    if (ctx.state === 'running') {
      this.onWebAudioRunning();
      return Promise.resolve(true);
    }

    const resumePromise = ctx
      .resume()
      .then(() => {
        if (ctx.state === 'running' && this.enabled) {
          this.onWebAudioRunning();
          return true;
        }
        return false;
      })
      .catch(() => false);

    const timeoutPromise = new Promise<boolean>((resolve) => {
      setTimeout(() => resolve(ctx.state === 'running'), 150);
    });

    return Promise.race([resumePromise, timeoutPromise]);
  }

  private pickNextIndex(direction: 1 | -1 = 1): number {
    const count = this.tracks.length;
    if (count <= 1) return 0;
    if (this.playMode === 'loop-one') return this.trackIndex;
    if (this.playMode === 'shuffle') {
      let next = this.trackIndex;
      while (next === this.trackIndex) {
        next = Math.floor(Math.random() * count);
      }
      return next;
    }
    return (this.trackIndex + direction + count) % count;
  }

  private ensureMusicElement(): HTMLAudioElement | null {
    if (typeof window === 'undefined') return null;
    if (this.musicEl) return this.musicEl;

    const audio = new Audio();
    audio.preload = 'auto';
    audio.volume = 0;
    audio.loop = false;

    audio.addEventListener('ended', () => {
      this.musicPlaying = false;
      if (!this.enabled || this.tracks.length === 0) return;
      if (this.nextTrackTimer) clearTimeout(this.nextTrackTimer);
      // Brief breathing pause where winter wind & chimes shine before next track fades in
      this.nextTrackTimer = setTimeout(() => {
        if (!this.enabled) return;
        this.trackIndex = this.pickNextIndex(1);
        this.emit();
        void this.playCurrentTrackSync(true);
      }, 1100);
    });

    audio.addEventListener('playing', () => {
      this.consecutiveErrors = 0;
      this.musicPlaying = true;
      if (this.ambientRunning) {
        this.needsGesture = false;
      }
      this.emit();
    });

    audio.addEventListener('pause', () => {
      this.musicPlaying = false;
      this.emit();
    });

    audio.addEventListener('error', () => {
      this.musicPlaying = false;
      if (!this.enabled || this.tracks.length <= 1) return;
      this.consecutiveErrors += 1;
      if (this.consecutiveErrors >= this.tracks.length) return;
      this.trackIndex = (this.trackIndex + 1) % this.tracks.length;
      this.emit();
      void this.playCurrentTrackSync(true);
    });

    this.musicEl = audio;
    return audio;
  }

  private rampMusicVolume(target: number, durationMs: number, onDone?: () => void): void {
    const audio = this.musicEl;
    if (!audio) {
      onDone?.();
      return;
    }
    if (this.musicFadeRaf !== null) {
      cancelAnimationFrame(this.musicFadeRaf);
      this.musicFadeRaf = null;
    }
    const startVol = audio.volume;
    const clampedTarget = Math.max(0, Math.min(1, target));
    if (durationMs <= 16 || Math.abs(startVol - clampedTarget) < 0.005) {
      audio.volume = clampedTarget;
      onDone?.();
      return;
    }
    const startTime = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - startTime) / durationMs);
      const eased = 1 - Math.pow(1 - t, 2);
      audio.volume = Math.max(0, Math.min(1, startVol + (clampedTarget - startVol) * eased));
      if (t < 1) {
        this.musicFadeRaf = requestAnimationFrame(step);
      } else {
        this.musicFadeRaf = null;
        onDone?.();
      }
    };
    this.musicFadeRaf = requestAnimationFrame(step);
  }

  /**
   * Calls audio.play() synchronously inside the current call stack so browser
   * user-gesture activation is preserved.
   */
  private playCurrentTrackSync(reload = false): Promise<boolean> {
    const track = this.tracks[this.trackIndex];
    if (!track) return Promise.resolve(true);
    const audio = this.ensureMusicElement();
    if (!audio) return Promise.resolve(false);

    const absoluteSrc = new URL(track.src, window.location.origin).href;
    if (reload || audio.src !== absoluteSrc) {
      audio.src = track.src;
      audio.currentTime = 0;
      audio.volume = 0;
    }

    const playResult = audio.play();
    if (!playResult) {
      this.musicPlaying = !audio.paused;
      if (this.musicPlaying) {
        this.rampMusicVolume(TARGET_MUSIC_VOLUME, 1200);
      }
      return Promise.resolve(this.musicPlaying);
    }

    return playResult
      .then(() => {
        if (!this.enabled) {
          audio.pause();
          return false;
        }
        this.musicPlaying = true;
        this.rampMusicVolume(TARGET_MUSIC_VOLUME, 1200);
        this.emit();
        return true;
      })
      .catch(() => {
        this.musicPlaying = false;
        return false;
      });
  }

  /**
   * Enables both the ambient winter soundscape and the rotating playlist.
   * Safe to invoke both on page load and inside a user gesture handler.
   */
  async enable(): Promise<boolean> {
    this.enabled = true;
    if (this.nextTrackTimer) {
      clearTimeout(this.nextTrackTimer);
      this.nextTrackTimer = null;
    }
    if (this.musicFadeRaf !== null) {
      cancelAnimationFrame(this.musicFadeRaf);
      this.musicFadeRaf = null;
    }
    this.emit();

    // Trigger both synchronously in the same event turn before awaiting!
    const webAudioPromise = this.tryResumeContextSync();
    const musicPromise = this.playCurrentTrackSync(false);

    const [webAudioStarted, musicStarted] = await Promise.all([
      webAudioPromise,
      musicPromise,
    ]);

    if (!this.enabled) return false;
    this.needsGesture = !webAudioStarted || !musicStarted;
    this.emit();
    return webAudioStarted && musicStarted;
  }

  /**
   * Called synchronously inside the first user gesture when default-on autoplay
   * was initially blocked by the browser.
   */
  async unlockFromGesture(): Promise<boolean> {
    if (!this.enabled) return false;
    if (this.ambientRunning && (this.musicPlaying || this.tracks.length === 0)) {
      this.needsGesture = false;
      this.emit();
      return true;
    }
    return this.enable();
  }

  disable(): void {
    this.enabled = false;
    this.needsGesture = false;
    this.ambientRunning = false;

    if (this.chimeTimer) {
      clearTimeout(this.chimeTimer);
      this.chimeTimer = null;
    }
    if (this.nextTrackTimer) {
      clearTimeout(this.nextTrackTimer);
      this.nextTrackTimer = null;
    }

    if (this.ctx && this.master) {
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(this.master.gain.value, now);
      this.master.gain.linearRampToValueAtTime(0, now + 0.65);
      const ctx = this.ctx;
      setTimeout(() => {
        if (!this.enabled) void ctx.suspend();
      }, 800);
    }

    if (this.musicEl) {
      const audio = this.musicEl;
      this.rampMusicVolume(0, 500, () => {
        if (!this.enabled) {
          audio.pause();
          this.musicPlaying = false;
          this.emit();
        }
      });
    }

    this.emit();
  }

  async selectTrack(index: number): Promise<boolean> {
    if (this.tracks.length === 0) return false;
    const safeIdx = ((index % this.tracks.length) + this.tracks.length) % this.tracks.length;
    if (this.nextTrackTimer) {
      clearTimeout(this.nextTrackTimer);
      this.nextTrackTimer = null;
    }
    if (this.musicFadeRaf !== null) {
      cancelAnimationFrame(this.musicFadeRaf);
      this.musicFadeRaf = null;
    }
    this.trackIndex = safeIdx;
    this.consecutiveErrors = 0;
    this.enabled = true;
    this.emit();

    const webAudioPromise = this.tryResumeContextSync();
    const musicPromise = this.playCurrentTrackSync(true);
    const [webAudioStarted, musicStarted] = await Promise.all([
      webAudioPromise,
      musicPromise,
    ]);
    if (!this.enabled) return false;
    this.needsGesture = !webAudioStarted || !musicStarted;
    this.emit();
    return webAudioStarted && musicStarted;
  }

  async nextTrack(): Promise<boolean> {
    if (this.tracks.length === 0) return false;
    const nextIdx =
      this.playMode === 'shuffle' && this.tracks.length > 1
        ? this.pickNextIndex(1)
        : (this.trackIndex + 1) % this.tracks.length;
    return this.selectTrack(nextIdx);
  }

  async prevTrack(): Promise<boolean> {
    if (this.tracks.length === 0) return false;
    const prevIdx = (this.trackIndex - 1 + this.tracks.length) % this.tracks.length;
    return this.selectTrack(prevIdx);
  }

  private scheduleChimes(): void {
    if (this.chimeTimer) clearTimeout(this.chimeTimer);
    const loop = () => {
      if (!this.enabled) return;
      // Keep the music-box chimes gentler and airier while a song is playing so both harmonize
      const chimeGain = this.musicPlaying ? 0.032 : 0.075;
      this.playChime(undefined, chimeGain);
      if (!this.musicPlaying && Math.random() < 0.35) {
        setTimeout(() => this.playChime(undefined, chimeGain), 180 + Math.random() * 260);
      }
      const delay = this.musicPlaying
        ? 3400 + Math.random() * 3600
        : 1500 + Math.random() * 2800;
      this.chimeTimer = setTimeout(loop, delay);
    };
    this.chimeTimer = setTimeout(loop, 1100);
  }

  playChime(freq?: number, peakGain = 0.075): void {
    if (!this.enabled || !this.ctx || !this.master || !this.reverb) return;
    if (this.ctx.state !== 'running') return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const f = freq ?? PENTATONIC[Math.floor(Math.random() * PENTATONIC.length)];

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, now);
    env.gain.exponentialRampToValueAtTime(peakGain, now + 0.008);
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
      setTimeout(() => this.playChime(PENTATONIC[idx], 0.085), k * 140);
    });
  }

  playBoom(intensity = 1): void {
    if (!this.enabled || !this.ctx || !this.master || !this.noiseBuffer || !this.reverb) return;
    if (this.ctx.state !== 'running') return;
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
