// Per-course ambient soundscapes generated with the Web Audio API.
// Each theme combines a base bed (filtered noise that reads as wind
// or water) with a scheduled chirp loop (short oscillator bursts
// that read as birds or seagulls). No external assets, no license
// complications, fully tunable per hole.

export type AmbientTheme = 'parkland' | 'coast' | 'island';

type Scheduled = {
    timer: ReturnType<typeof setTimeout> | null;
};

class AmbientEngine {
    private ctx: AudioContext | null = null;
    private master: GainNode | null = null;
    private nodes: AudioNode[] = [];
    private timers: Array<ReturnType<typeof setTimeout>> = [];
    private currentTheme: AmbientTheme | null = null;

    start(theme: AmbientTheme) {
        if (this.currentTheme === theme && this.ctx) return; // already running
        this.stop();
        try {
            const Ctx = (typeof window !== 'undefined'
                ? (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)
                : null);
            if (!Ctx) return;
            this.ctx = new Ctx();
            this.master = this.ctx.createGain();
            this.master.gain.value = 0.16;
            this.master.connect(this.ctx.destination);

            switch (theme) {
                case 'parkland': this.startParkland(); break;
                case 'coast':    this.startCoast(); break;
                case 'island':   this.startIsland(); break;
            }
            this.currentTheme = theme;
        } catch {
            this.stop();
        }
    }

    /** Resume the AudioContext if it was suspended (iOS Safari blocks
     *  audio until the first user gesture). Call from a click/tap
     *  handler. */
    unlock() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume().catch(() => undefined);
        }
    }

    stop() {
        for (const t of this.timers) clearTimeout(t);
        this.timers = [];
        for (const n of this.nodes) {
            try {
                if ('stop' in n) (n as AudioScheduledSourceNode).stop();
            } catch { /* node already stopped */ }
            try { n.disconnect(); } catch { /* ignore */ }
        }
        this.nodes = [];
        if (this.master) {
            try { this.master.disconnect(); } catch { /* ignore */ }
            this.master = null;
        }
        if (this.ctx) {
            this.ctx.close().catch(() => undefined);
            this.ctx = null;
        }
        this.currentTheme = null;
    }

    // ─── Parkland: wind hum + occasional bird chirps ─────────────

    private startParkland() {
        const ctx = this.ctx!;
        const master = this.master!;

        // Wind: pink noise through a low-pass filter at ~350 Hz
        const wind = this.makeNoiseSource('pink');
        const windFilter = ctx.createBiquadFilter();
        windFilter.type = 'lowpass';
        windFilter.frequency.value = 350;
        windFilter.Q.value = 0.7;
        const windGain = ctx.createGain();
        windGain.gain.value = 0.85;
        wind.connect(windFilter).connect(windGain).connect(master);
        this.nodes.push(wind, windFilter, windGain);

        // Sparse bird chirps, 2-3 per 6 seconds
        const scheduleChirp = () => {
            if (!this.ctx) return;
            this.chirp({
                freq: 1800 + Math.random() * 1800,
                durationMs: 70 + Math.random() * 90,
                gain: 0.06 + Math.random() * 0.04,
                bend: 600 + Math.random() * 800,
            });
            const next = 900 + Math.random() * 2400;
            this.timers.push(setTimeout(scheduleChirp, next));
        };
        scheduleChirp();
    }

    // ─── Coast: waves + occasional seagull caws ──────────────────

    private startCoast() {
        const ctx = this.ctx!;
        const master = this.master!;

        // Waves: brown-ish noise with a slow LFO swelling the gain
        const waves = this.makeNoiseSource('brown');
        const wavesFilter = ctx.createBiquadFilter();
        wavesFilter.type = 'lowpass';
        wavesFilter.frequency.value = 520;
        const wavesGain = ctx.createGain();
        wavesGain.gain.value = 0.55;

        const lfo = ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = 0.13;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 0.35;
        lfo.connect(lfoGain).connect(wavesGain.gain);
        lfo.start();
        waves.connect(wavesFilter).connect(wavesGain).connect(master);
        this.nodes.push(waves, wavesFilter, wavesGain, lfo, lfoGain);

        // Seagulls: 1 every 7-12 seconds, descending pitch sweep
        const scheduleGull = () => {
            if (!this.ctx) return;
            this.chirp({
                freq: 1100 + Math.random() * 300,
                durationMs: 380 + Math.random() * 220,
                gain: 0.07,
                bend: -350, // descending caw
            });
            const next = 5500 + Math.random() * 5500;
            this.timers.push(setTimeout(scheduleGull, next));
        };
        // First gull comes in slightly delayed so the waves bed plays first
        this.timers.push(setTimeout(scheduleGull, 3000));
    }

    // ─── Island: lighter water + frequent tropical bird chatter ──

    private startIsland() {
        const ctx = this.ctx!;
        const master = this.master!;

        // Water lapping: softer than coast waves
        const water = this.makeNoiseSource('pink');
        const waterFilter = ctx.createBiquadFilter();
        waterFilter.type = 'lowpass';
        waterFilter.frequency.value = 420;
        const waterGain = ctx.createGain();
        waterGain.gain.value = 0.6;

        const lfo = ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = 0.25;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 0.18;
        lfo.connect(lfoGain).connect(waterGain.gain);
        lfo.start();
        water.connect(waterFilter).connect(waterGain).connect(master);
        this.nodes.push(water, waterFilter, waterGain, lfo, lfoGain);

        // Tropical birds: chattier than parkland, higher pitch
        const scheduleChirp = () => {
            if (!this.ctx) return;
            this.chirp({
                freq: 2400 + Math.random() * 2200,
                durationMs: 50 + Math.random() * 70,
                gain: 0.05 + Math.random() * 0.04,
                bend: 800 + Math.random() * 1200,
            });
            const next = 500 + Math.random() * 1400;
            this.timers.push(setTimeout(scheduleChirp, next));
        };
        scheduleChirp();
    }

    // ─── Helpers ─────────────────────────────────────────────────

    /** Generate a 4-second looping noise buffer filtered to 'pink' or
     *  'brown' colour using Paul Kellet's pink noise algorithm. */
    private makeNoiseSource(color: 'pink' | 'brown'): AudioBufferSourceNode {
        const ctx = this.ctx!;
        const duration = 4;
        const buffer = ctx.createBuffer(1, duration * ctx.sampleRate, ctx.sampleRate);
        const data = buffer.getChannelData(0);

        if (color === 'pink') {
            let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
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
            // Brown noise: integrated white noise, bounded
            let last = 0;
            for (let i = 0; i < data.length; i++) {
                const white = Math.random() * 2 - 1;
                last = (last + 0.02 * white) / 1.02;
                data[i] = last * 3.5;
            }
        }
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.loop = true;
        src.start();
        return src;
    }

    /** Short pitched oscillator with an attack-decay envelope. bend > 0
     *  rises, bend < 0 falls (matches a seagull caw). */
    private chirp(opts: { freq: number; durationMs: number; gain: number; bend: number }) {
        const ctx = this.ctx;
        const master = this.master;
        if (!ctx || !master) return;
        const now = ctx.currentTime;
        const dur = opts.durationMs / 1000;

        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(opts.freq, now);
        osc.frequency.linearRampToValueAtTime(opts.freq + opts.bend, now + dur);

        const env = ctx.createGain();
        env.gain.setValueAtTime(0, now);
        env.gain.linearRampToValueAtTime(opts.gain, now + 0.012);
        env.gain.exponentialRampToValueAtTime(0.0001, now + dur);

        osc.connect(env).connect(master);
        osc.start(now);
        osc.stop(now + dur + 0.05);
    }
}

// Singleton so the scene can call start/stop without managing lifetime.
export const ambient = new AmbientEngine();

/** Map a HoleSpec.name (or inspiration) to a theme. Falls back to
 *  parkland for anything we have not classified. */
export function themeFor(holeName: string, inspiration: string): AmbientTheme {
    const tag = `${holeName} ${inspiration}`.toLowerCase();
    if (tag.includes('sawgrass') || tag.includes('island')) return 'island';
    if (tag.includes('pebble') || tag.includes('cliff'))    return 'coast';
    return 'parkland';
}
