import { mulberry32 } from "../greeting/random.ts";
import { DURATION } from "../greeting/renderer.ts";

/**
 * An original score, synthesised in the browser, so there is nothing to
 * license and nothing to download. It follows the greeting's timeline:
 * a tanpura drone throughout, a bell as each lamp catches, a bansuri-like
 * phrase in raag Bhupali (D E F♯ A B), santoor sparkle as the petals bloom,
 * sparkler crackle while the name is written, and a closing chord.
 * Rendered offline, so the on-screen music and the exported MP4 are identical.
 */

export const MUSIC_SAMPLE_RATE = 48000;

const N = {
  D2: 73.42,
  A2: 110.0,
  D3: 146.83,
  D4: 293.66,
  E4: 329.63,
  Fs4: 369.99,
  A4: 440.0,
  B4: 493.88,
  D5: 587.33,
  E5: 659.26,
  Fs5: 739.99,
  A5: 880.0,
  B5: 987.77,
  D6: 1174.66,
};

type Ctx = OfflineAudioContext;

function tanpura(ctx: Ctx, out: AudioNode, t: number, f: number, gain: number) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.02);
  g.gain.exponentialRampToValueAtTime(gain * 0.35, t + 1.2);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(2600, t);
  lp.frequency.exponentialRampToValueAtTime(900, t + 2.5);
  g.connect(lp).connect(out);
  // harmonic-rich string with a slow "jawari" shimmer
  [1, 2, 3, 4, 5, 6].forEach((h, i) => {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(f * h * (1 + (i % 2 ? 0.0015 : -0.001)), t);
    const hg = ctx.createGain();
    hg.gain.value = [1, 0.55, 0.42, 0.3, 0.2, 0.12][i];
    o.connect(hg).connect(g);
    o.start(t);
    o.stop(t + 3.3);
  });
}

function bell(ctx: Ctx, out: AudioNode, t: number, f: number, gain: number, decay = 2.6) {
  const carrier = ctx.createOscillator();
  const mod = ctx.createOscillator();
  const modGain = ctx.createGain();
  const amp = ctx.createGain();
  carrier.frequency.value = f;
  mod.frequency.value = f * 1.414;
  modGain.gain.setValueAtTime(f * 1.8, t);
  modGain.gain.exponentialRampToValueAtTime(f * 0.05, t + decay);
  mod.connect(modGain).connect(carrier.frequency);
  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(gain, t + 0.005);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  carrier.connect(amp).connect(out);
  carrier.start(t);
  mod.start(t);
  carrier.stop(t + decay + 0.05);
  mod.stop(t + decay + 0.05);
}

function flute(ctx: Ctx, out: AudioNode, noise: AudioBuffer, t: number, f: number, dur: number, gain: number) {
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(gain, t + 0.09);
  amp.gain.setValueAtTime(gain * 0.9, t + Math.max(0.1, dur - 0.12));
  amp.gain.linearRampToValueAtTime(0, t + dur + 0.18);
  const o = ctx.createOscillator();
  o.type = "sine";
  o.frequency.setValueAtTime(f * 0.985, t);
  o.frequency.exponentialRampToValueAtTime(f, t + 0.08); // a small meend into the note
  const o2 = ctx.createOscillator();
  o2.type = "triangle";
  o2.frequency.value = f * 2;
  const o2g = ctx.createGain();
  o2g.gain.value = 0.08;
  // vibrato that blooms after the attack
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 5.2;
  const lfoGain = ctx.createGain();
  lfoGain.gain.setValueAtTime(0, t);
  lfoGain.gain.linearRampToValueAtTime(f * 0.006, t + Math.min(0.5, dur));
  lfo.connect(lfoGain).connect(o.frequency);
  o.connect(amp);
  o2.connect(o2g).connect(amp);
  // breath
  const b = ctx.createBufferSource();
  b.buffer = noise;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = f * 2;
  bp.Q.value = 6;
  const bg = ctx.createGain();
  bg.gain.value = 0.18;
  b.connect(bp).connect(bg).connect(amp);
  amp.connect(out);
  const end = t + dur + 0.25;
  [o, o2, lfo].forEach((n) => {
    n.start(t);
    n.stop(end);
  });
  b.start(t, (t * 0.37) % 1);
  b.stop(end);
}

function santoor(ctx: Ctx, out: AudioNode, t: number, f: number, gain: number) {
  [1, 1.003].forEach((detune) => {
    const o = ctx.createOscillator();
    o.type = "triangle";
    o.frequency.value = f * detune;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 1.5);
  });
}

function makeNoise(ctx: Ctx, seconds: number, seed: number): AudioBuffer {
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
  const d = buf.getChannelData(0);
  const rand = mulberry32(seed);
  for (let i = 0; i < d.length; i++) d[i] = rand() * 2 - 1;
  return buf;
}

function makeImpulse(ctx: Ctx, seconds: number): AudioBuffer {
  const len = Math.ceil(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  const rand = mulberry32(99);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (rand() * 2 - 1) * Math.pow(1 - i / len, 3);
  }
  return buf;
}

let cached: Promise<AudioBuffer> | null = null;

export function renderMusic(): Promise<AudioBuffer> {
  if (cached) return cached;
  cached = (async () => {
    const sr = MUSIC_SAMPLE_RATE;
    const ctx = new OfflineAudioContext(2, Math.ceil(DURATION * sr), sr);
    const master = ctx.createGain();
    master.gain.setValueAtTime(0, 0);
    master.gain.linearRampToValueAtTime(2.0, 0.6);
    master.gain.setValueAtTime(2.0, DURATION - 1.2);
    master.gain.linearRampToValueAtTime(0, DURATION);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    master.connect(comp).connect(ctx.destination);

    const reverb = ctx.createConvolver();
    reverb.buffer = makeImpulse(ctx, 2.4);
    const wet = ctx.createGain();
    wet.gain.value = 0.32;
    reverb.connect(wet).connect(master);
    const bus = ctx.createGain();
    bus.connect(master);
    bus.connect(reverb);

    const noise = makeNoise(ctx, 3, 7);

    // tanpura: Pa Sa Sa Sa, the whole way through
    const drone = ctx.createGain();
    drone.gain.value = 0.05;
    drone.connect(bus);
    for (let c = 0; c < DURATION; c += 2.4) {
      tanpura(ctx, drone, c, N.A2, 1);
      tanpura(ctx, drone, c + 0.6, N.D3, 0.9);
      tanpura(ctx, drone, c + 1.2, N.D3, 0.9);
      tanpura(ctx, drone, c + 1.8, N.D2, 1.1);
    }

    // a bell as each lamp catches: the first low, then rising
    bell(ctx, bus, 0.95, N.D5, 0.11, 3.2);
    [N.E5, N.Fs5, N.A5, N.B5].forEach((f, i) => bell(ctx, bus, [6.55, 6.9, 7.25, 7.6][i], f, 0.07, 2.2));

    // bansuri phrase in Bhupali
    const phrase: Array<[number, number, number]> = [
      [2.0, N.A4, 0.85],
      [2.9, N.B4, 0.45],
      [3.4, N.A4, 0.45],
      [3.9, N.Fs4, 0.95],
      [4.9, N.E4, 0.45],
      [5.4, N.Fs4, 0.45],
      [5.9, N.A4, 1.1],
      [9.2, N.D5, 0.75],
      [10.0, N.B4, 0.45],
      [10.5, N.A4, 0.55],
      [11.1, N.Fs4, 0.45],
      [11.6, N.E4, 0.4],
      [12.0, N.D4, 1.6],
    ];
    for (const [t, f, d] of phrase) flute(ctx, bus, noise, t, f, d, 0.09);

    // santoor sparkle as the petals bloom
    [N.D5, N.E5, N.Fs5, N.A5, N.B5, N.D6].forEach((f, i) => santoor(ctx, bus, 5.5 + i * 0.22, f, 0.05));

    // sparkler crackle while the name is written
    const rand = mulberry32(2026);
    for (let t = 7.7; t < 9.15; t += 0.012 + rand() * 0.03) {
      const src = ctx.createBufferSource();
      src.buffer = noise;
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 3500 + rand() * 3000;
      const g = ctx.createGain();
      const a = 0.02 + rand() * 0.05;
      g.gain.setValueAtTime(a, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.02 + rand() * 0.03);
      src.connect(hp).connect(g).connect(bus);
      src.start(t, rand() * 2);
      src.stop(t + 0.06);
    }

    // closing chord
    [N.D4, N.A4, N.D5, N.Fs5].forEach((f, i) => bell(ctx, bus, 11.7 + i * 0.04, f, 0.05, 2.4));

    return ctx.startRendering();
  })();
  cached.catch(() => {
    cached = null;
  });
  return cached;
}

/** Plays the score on screen, in step with the animation clock. */
export class MusicPlayer {
  private ctx: AudioContext | null = null;
  private source: AudioBufferSourceNode | null = null;

  /** Call inside the tap handler, before any await: Safari only unlocks audio there. */
  unlock() {
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  async play(offset: number) {
    this.unlock();
    const buffer = await renderMusic();
    if (!this.ctx) return;
    this.stop();
    if (offset >= buffer.duration) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.ctx.destination);
    src.start(0, Math.max(0, offset));
    this.source = src;
  }

  stop() {
    try {
      this.source?.stop();
    } catch {
      // already stopped
    }
    this.source = null;
  }

  close() {
    this.stop();
    void this.ctx?.close();
    this.ctx = null;
  }
}
