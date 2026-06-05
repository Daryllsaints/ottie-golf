// Per-course audio bed: ambient layer (filtered noise + scheduled
// chirps that read as birds, waves, seagulls) plus a music layer
// (looping chord pads and a soft sine melody). Everything is
// generated procedurally with the Web Audio API, no external assets.
//
// iOS Safari requires the AudioContext to be created or first
// resumed inside a user-gesture handler. We DEFER context creation
// until unlock() is called from a pointerdown. start(theme) just
// remembers the desired theme; the real work happens on unlock.

export type AmbientTheme = 'parkland' | 'coast' | 'island';

class AmbientEngine {
    private ctx: AudioContext | null = null;
    private master: GainNode | null = null;
    private ambientGain: GainNode | null = null;
    private musicGain: GainNode | null = null;
    private nodes: AudioNode[] = [];
    private timers: Array<ReturnType<typeof setTimeout>> = [];
    private currentTheme: AmbientTheme | null = null;
    private pendingTheme: AmbientTheme | null = null;

    /** Record that we want this theme playing. Defers actual audio
     *  setup until unlock() so iOS Safari's user-gesture rule is met. */
    start(theme: AmbientTheme) {
        this.pendingTheme = theme;
        if (!this.ctx) return;
        if (this.currentTheme === theme) return;
        this.tearDownGraph();
        this.buildGraph(theme);
    }

    /** Create the AudioContext (first time) or resume it (subsequent).
     *  MUST be called from a user-gesture handler on iOS. */
    unlock() {
        if (this.ctx) {
            if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => undefined);
            return;
        }
        const Ctx = (typeof window !== 'undefined'
            ? (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)
            : null);
        if (!Ctx) return;
        try {
            this.ctx = new Ctx();
            this.master = this.ctx.createGain();
            this.master.gain.value = 0.35;
            this.master.connect(this.ctx.destination);

            this.ambientGain = this.ctx.createGain();
            this.ambientGain.gain.value = 0.85;
            this.ambientGain.connect(this.master);

            this.musicGain = this.ctx.createGain();
            this.musicGain.gain.value = 0.55;
            this.musicGain.connect(this.master);

            if (this.pendingTheme) this.buildGraph(this.pendingTheme);
        } catch {
            this.stop();
        }
    }

    stop() {
        this.tearDownGraph();
        if (this.master) {
            try { this.master.disconnect(); } catch { /* ignore */ }
            this.master = null;
        }
        this.ambientGain = null;
        this.musicGain = null;
        if (this.ctx) {
            this.ctx.close().catch(() => undefined);
            this.ctx = null;
        }
        this.currentTheme = null;
        this.pendingTheme = null;
    }

    private tearDownGraph() {
        for (const t of this.timers) clearTimeout(t);
        this.timers = [];
        for (const n of this.nodes) {
            try { if ('stop' in n) (n as AudioScheduledSourceNode).stop(); } catch { /* ignore */ }
            try { n.disconnect(); } catch { /* ignore */ }
        }
        this.nodes = [];
        this.currentTheme = null;
    }

    private buildGraph(theme: AmbientTheme) {
        if (!this.ctx || !this.ambientGain || !this.musicGain) return;
        switch (theme) {
            case 'parkland': this.buildParkland(); this.buildMusic(THEME_MUSIC.parkland); break;
            case 'coast':    this.buildCoast();    this.buildMusic(THEME_MUSIC.coast);    break;
            case 'island':   this.buildIsland();   this.buildMusic(THEME_MUSIC.island);   break;
        }
        this.currentTheme = theme;
    }

    // ─── Ambient layers ──────────────────────────────────────────

    private buildParkland() {
        const ctx = this.ctx!;
        const out = this.ambientGain!;
        const wind = this.makeNoiseSource('pink');
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380;
        const g = ctx.createGain(); g.gain.value = 0.90;
        wind.connect(f).connect(g).connect(out);
        this.nodes.push(wind, f, g);

        const scheduleChirp = () => {
            if (!this.ctx) return;
            this.chirp({ freq: 1800 + Math.random() * 1800, durationMs: 70 + Math.random() * 90, gain: 0.10 + Math.random() * 0.05, bend: 600 + Math.random() * 800 });
            this.timers.push(setTimeout(scheduleChirp, 900 + Math.random() * 2400));
        };
        scheduleChirp();
    }

    private buildCoast() {
        const ctx = this.ctx!;
        const out = this.ambientGain!;
        const waves = this.makeNoiseSource('brown');
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 540;
        const g = ctx.createGain(); g.gain.value = 0.70;
        const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.13;
        const lfoGain = ctx.createGain(); lfoGain.gain.value = 0.35;
        lfo.connect(lfoGain).connect(g.gain); lfo.start();
        waves.connect(f).connect(g).connect(out);
        this.nodes.push(waves, f, g, lfo, lfoGain);

        const scheduleGull = () => {
            if (!this.ctx) return;
            this.chirp({ freq: 1100 + Math.random() * 300, durationMs: 380 + Math.random() * 220, gain: 0.12, bend: -350 });
            this.timers.push(setTimeout(scheduleGull, 5500 + Math.random() * 5500));
        };
        this.timers.push(setTimeout(scheduleGull, 3000));
    }

    private buildIsland() {
        const ctx = this.ctx!;
        const out = this.ambientGain!;
        const water = this.makeNoiseSource('pink');
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 450;
        const g = ctx.createGain(); g.gain.value = 0.75;
        const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.25;
        const lfoGain = ctx.createGain(); lfoGain.gain.value = 0.18;
        lfo.connect(lfoGain).connect(g.gain); lfo.start();
        water.connect(f).connect(g).connect(out);
        this.nodes.push(water, f, g, lfo, lfoGain);

        const scheduleChirp = () => {
            if (!this.ctx) return;
            this.chirp({ freq: 2400 + Math.random() * 2200, durationMs: 50 + Math.random() * 70, gain: 0.09 + Math.random() * 0.04, bend: 800 + Math.random() * 1200 });
            this.timers.push(setTimeout(scheduleChirp, 500 + Math.random() * 1400));
        };
        scheduleChirp();
    }

    // ─── Music layer (chord pads + simple melody) ────────────────

    private buildMusic(score: ThemeMusic) {
        if (!this.ctx || !this.musicGain) return;
        const ctx = this.ctx;

        // A short delay tail for warmth without a full reverb.
        const delay = ctx.createDelay(0.5);
        delay.delayTime.value = 0.22;
        const feedback = ctx.createGain(); feedback.gain.value = 0.28;
        const wetGain = ctx.createGain(); wetGain.gain.value = 0.35;
        delay.connect(feedback).connect(delay);
        delay.connect(wetGain).connect(this.musicGain);
        this.nodes.push(delay, feedback, wetGain);

        const beatMs = 60_000 / score.bpm;
        const beatsPerBar = 4;

        let barIdx = 0;
        const tickBar = () => {
            if (!this.ctx) return;
            const chord = score.chords[barIdx % score.chords.length];
            this.playChord(chord, beatMs * beatsPerBar, wetGain);
            barIdx += 1;
            this.timers.push(setTimeout(tickBar, beatMs * beatsPerBar));
        };
        // Tiny delay before first chord so the ambient bed registers first.
        this.timers.push(setTimeout(tickBar, 300));

        // Melody: schedule one note per beat of the loop.
        let beatIdx = 0;
        const tickBeat = () => {
            if (!this.ctx) return;
            const note = score.melody[beatIdx % score.melody.length];
            if (note !== null) this.playMelodyNote(note, beatMs, wetGain);
            beatIdx += 1;
            this.timers.push(setTimeout(tickBeat, beatMs));
        };
        this.timers.push(setTimeout(tickBeat, beatMs * 2 + 300));
    }

    private playChord(midiNotes: number[], durationMs: number, fx: AudioNode) {
        const ctx = this.ctx;
        const out = this.musicGain;
        if (!ctx || !out) return;
        const now = ctx.currentTime;
        const dur = durationMs / 1000;
        for (const m of midiNotes) {
            const freq = midiToFreq(m);
            const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = freq;
            const env = ctx.createGain();
            env.gain.setValueAtTime(0, now);
            env.gain.linearRampToValueAtTime(0.08, now + 0.6);
            env.gain.linearRampToValueAtTime(0.06, now + dur - 0.6);
            env.gain.linearRampToValueAtTime(0.0001, now + dur);
            osc.connect(env).connect(out);
            osc.connect(env).connect(fx);
            osc.start(now); osc.stop(now + dur + 0.05);
        }
    }

    private playMelodyNote(midi: number, durationMs: number, fx: AudioNode) {
        const ctx = this.ctx;
        const out = this.musicGain;
        if (!ctx || !out) return;
        const now = ctx.currentTime;
        const dur = (durationMs * 0.6) / 1000;
        const freq = midiToFreq(midi);
        const osc = ctx.createOscillator(); osc.type = 'triangle'; osc.frequency.value = freq;
        const env = ctx.createGain();
        env.gain.setValueAtTime(0, now);
        env.gain.linearRampToValueAtTime(0.12, now + 0.04);
        env.gain.exponentialRampToValueAtTime(0.0001, now + dur);
        osc.connect(env).connect(out);
        osc.connect(env).connect(fx);
        osc.start(now); osc.stop(now + dur + 0.05);
    }

    // ─── Noise + chirp helpers ───────────────────────────────────

    private makeNoiseSource(color: 'pink' | 'brown'): AudioBufferSourceNode {
        const ctx = this.ctx!;
        const duration = 4;
        const buffer = ctx.createBuffer(1, duration * ctx.sampleRate, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        if (color === 'pink') {
            let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;
            for (let i = 0; i < data.length; i++) {
                const white = Math.random() * 2 - 1;
                b0 = 0.99886 * b0 + white * 0.0555179;
                b1 = 0.99332 * b1 + white * 0.0750759;
                b2 = 0.96900 * b2 + white * 0.1538520;
                b3 = 0.86650 * b3 + white * 0.3104856;
                b4 = 0.55000 * b4 + white * 0.5329522;
                b5 = -0.7616 * b5 - white * 0.0168980;
                data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
                b6 = white * 0.115926;
            }
        } else {
            let last = 0;
            for (let i = 0; i < data.length; i++) {
                const white = Math.random() * 2 - 1;
                last = (last + 0.02 * white) / 1.02;
                data[i] = last * 3.5;
            }
        }
        const src = ctx.createBufferSource();
        src.buffer = buffer; src.loop = true; src.start();
        return src;
    }

    private chirp(opts: { freq: number; durationMs: number; gain: number; bend: number }) {
        const ctx = this.ctx; const out = this.ambientGain;
        if (!ctx || !out) return;
        const now = ctx.currentTime;
        const dur = opts.durationMs / 1000;
        const osc = ctx.createOscillator(); osc.type = 'sine';
        osc.frequency.setValueAtTime(opts.freq, now);
        osc.frequency.linearRampToValueAtTime(opts.freq + opts.bend, now + dur);
        const env = ctx.createGain();
        env.gain.setValueAtTime(0, now);
        env.gain.linearRampToValueAtTime(opts.gain, now + 0.012);
        env.gain.exponentialRampToValueAtTime(0.0001, now + dur);
        osc.connect(env).connect(out);
        osc.start(now); osc.stop(now + dur + 0.05);
    }
}

function midiToFreq(midi: number): number {
    return 440 * Math.pow(2, (midi - 69) / 12);
}

// ─── Per-theme music scores ──────────────────────────────────────

type ThemeMusic = {
    bpm: number;
    chords: number[][];          // one chord per bar; chord is array of MIDI notes
    melody: (number | null)[];   // one entry per beat, null = rest
};

const THEME_MUSIC: Record<AmbientTheme, ThemeMusic> = {
    // Parkland: warm folk-ish progression in F major (I, vi, IV, V),
    // simple stepwise melody that resolves on the tonic.
    parkland: {
        bpm: 62,
        chords: [
            [53, 57, 60],  // F major
            [50, 53, 57],  // D minor
            [48, 52, 55],  // C major
            [50, 53, 57],  // D minor (resolve down)
        ],
        melody: [
            65, null, 67, 69, null, 67, 65, null,
            64, null, 65, 67, null, null, 65, null,
        ],
    },
    // Coast: airy minor key vamp in A minor with longer rests for the
    // wind/waves to breathe through.
    coast: {
        bpm: 52,
        chords: [
            [57, 60, 64],  // A minor
            [55, 59, 62],  // G major
            [53, 57, 60],  // F major
            [52, 55, 59],  // E minor
        ],
        melody: [
            72, null, null, 71, null, 69, null, null,
            67, null, 69, null, null, 67, null, null,
        ],
    },
    // Island: warm pentatonic vibe in C major, slightly tropical bounce.
    island: {
        bpm: 74,
        chords: [
            [48, 52, 55],  // C major
            [50, 53, 57],  // D minor
            [55, 59, 62],  // G major
            [48, 52, 55],  // C major
        ],
        melody: [
            60, 62, 64, 67, null, 64, 62, 60,
            62, 64, 67, 69, null, 67, 64, 62,
        ],
    },
};

// Singleton so the scene can call start/stop without managing lifetime.
export const ambient = new AmbientEngine();

export function themeFor(holeName: string, inspiration: string): AmbientTheme {
    const tag = `${holeName} ${inspiration}`.toLowerCase();
    if (tag.includes('sawgrass') || tag.includes('island')) return 'island';
    if (tag.includes('pebble') || tag.includes('cliff'))    return 'coast';
    return 'parkland';
}
