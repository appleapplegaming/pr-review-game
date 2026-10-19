// Synthesised sound effects and a looping background track. Everything is generated with the Web
// Audio API, so there are no asset files. The AudioContext is created on first use and resumed on
// the first user gesture, because browsers refuse to play before one. Every call is a safe no-op
// where Web Audio is missing (tests, old browsers) or the player has muted.

import type { GameEvent } from '../../../shared/types';

const STORAGE_KEY = 'shipit.sound';

interface Prefs {
  sfx: boolean;
  music: boolean;
}

function loadPrefs(): Prefs {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw !== null) {
      const parsed = JSON.parse(raw) as Partial<Prefs>;
      return { sfx: parsed.sfx !== false, music: parsed.music !== false };
    }
  } catch {
    // Storage can be blocked. Fall through to the defaults.
  }
  return { sfx: true, music: true };
}

let prefs: Prefs | null = null;
const listeners = new Set<() => void>();

export function getPrefs(): Prefs {
  prefs ??= loadPrefs();
  return prefs;
}

export function subscribePrefs(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setPrefs(next: Partial<Prefs>): void {
  prefs = { ...getPrefs(), ...next };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Not persisting is fine.
  }
  if (!prefs.music) stopMusic();
  else if (musicWanted) startMusic();
  listeners.forEach((fn) => fn());
}

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

function context(): AudioContext | null {
  if (ctx !== null) return ctx;
  const Ctor =
    typeof window === 'undefined'
      ? undefined
      : (window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
  if (Ctor === undefined) return null;
  ctx = new Ctor();
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);
  return ctx;
}

/** Call from a user gesture (click, key) so audio is allowed to start. */
export function unlockAudio(): void {
  const c = context();
  if (c !== null && c.state === 'suspended') void c.resume();
}

interface Note {
  freq: number;
  /** Seconds after the start of the sound. */
  at: number;
  dur: number;
  type?: OscillatorType;
  gain?: number;
  /** Frequency to glide to over the note. */
  slideTo?: number;
}

function playNotes(notes: Note[], out?: AudioNode): void {
  const c = context();
  if (c === null || master === null) return;
  const t0 = c.currentTime + 0.01;
  for (const n of notes) {
    const osc = c.createOscillator();
    const amp = c.createGain();
    const start = t0 + n.at;
    osc.type = n.type ?? 'square';
    osc.frequency.setValueAtTime(n.freq, start);
    if (n.slideTo !== undefined)
      osc.frequency.exponentialRampToValueAtTime(n.slideTo, start + n.dur);
    const peak = n.gain ?? 0.15;
    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.exponentialRampToValueAtTime(peak, start + 0.01);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + n.dur);
    osc.connect(amp).connect(out ?? master);
    osc.start(start);
    osc.stop(start + n.dur + 0.05);
  }
}

const SFX = {
  merge: (): Note[] => [
    { freq: 660, at: 0, dur: 0.08 },
    { freq: 880, at: 0.07, dur: 0.12 },
  ],
  decline: (): Note[] => [{ freq: 300, at: 0, dur: 0.18, type: 'sawtooth', slideTo: 150 }],
  catch: (streak: number): Note[] => {
    const base = 523 * Math.pow(2, Math.min(streak - 1, 5) / 12);
    return [
      { freq: base, at: 0, dur: 0.1 },
      { freq: base * 1.25, at: 0.09, dur: 0.1 },
      { freq: base * 1.5, at: 0.18, dur: 0.1 },
      { freq: base * 2, at: 0.27, dur: 0.3, gain: 0.2 },
    ];
  },
  incident: (): Note[] => [
    { freq: 880, at: 0, dur: 0.22, type: 'sawtooth' },
    { freq: 622, at: 0.25, dur: 0.22, type: 'sawtooth' },
    { freq: 880, at: 0.5, dur: 0.22, type: 'sawtooth' },
    { freq: 622, at: 0.75, dur: 0.3, type: 'sawtooth' },
  ],
  ping: (): Note[] => [
    { freq: 1175, at: 0, dur: 0.1, type: 'sine', gain: 0.2 },
    { freq: 1568, at: 0.12, dur: 0.18, type: 'sine', gain: 0.2 },
  ],
  comment: (): Note[] => [{ freq: 990, at: 0, dur: 0.05, type: 'triangle', gain: 0.12 }],
  start: (): Note[] => [
    { freq: 392, at: 0, dur: 0.12 },
    { freq: 523, at: 0.12, dur: 0.12 },
    { freq: 659, at: 0.24, dur: 0.12 },
    { freq: 784, at: 0.36, dur: 0.35, gain: 0.2 },
  ],
  win: (): Note[] => [
    { freq: 523, at: 0, dur: 0.15 },
    { freq: 659, at: 0.15, dur: 0.15 },
    { freq: 784, at: 0.3, dur: 0.15 },
    { freq: 1047, at: 0.45, dur: 0.5, gain: 0.2 },
  ],
  lose: (): Note[] => [
    { freq: 392, at: 0, dur: 0.25, type: 'triangle' },
    { freq: 330, at: 0.28, dur: 0.25, type: 'triangle' },
    { freq: 262, at: 0.56, dur: 0.6, type: 'triangle', slideTo: 196 },
  ],
};

export function sfxForEvent(event: GameEvent): void {
  if (!getPrefs().sfx) return;
  switch (event.kind) {
    case 'merge':
      return playNotes(SFX.merge());
    case 'decline':
      return playNotes(SFX.decline());
    case 'catch':
      return playNotes(SFX.catch(1));
    case 'incident':
      return playNotes(SFX.incident());
    case 'ping':
      return playNotes(SFX.ping());
    case 'comment':
      return playNotes(SFX.comment());
  }
}

export function sfxQuarterStart(): void {
  if (getPrefs().sfx) playNotes(SFX.start());
}

export function sfxQuarterEnd(good: boolean): void {
  if (getPrefs().sfx) playNotes(good ? SFX.win() : SFX.lose());
}

// --- Music: a four-bar minor-key loop (bass, arpeggio, soft kick/hat), scheduled a bar ahead. ---

const BPM = 112;
const STEP = 60 / BPM / 2; // eighth note
const BASS = [110, 110, 87.31, 98]; // A2 A2 F2 G2 per bar
const ARP = [
  [220, 261.63, 329.63, 261.63],
  [220, 261.63, 329.63, 261.63],
  [174.61, 220, 261.63, 220],
  [196, 246.94, 293.66, 246.94],
];

let musicWanted = false;
let musicTimer: number | null = null;
let musicBus: GainNode | null = null;
let nextBar = 0;
let barIndex = 0;

function scheduleBar(): void {
  const c = context();
  if (c === null || musicBus === null) return;
  const bar = barIndex % 4;
  const t = nextBar;
  const notes: Note[] = [];
  for (let i = 0; i < 8; i++) {
    const arp = ARP[bar]?.[i % 4] ?? 220;
    notes.push({
      freq: arp * 2,
      at: t - c.currentTime + i * STEP,
      dur: STEP * 0.8,
      type: 'triangle',
      gain: 0.05,
    });
    if (i % 2 === 0) {
      notes.push({
        freq: BASS[bar] ?? 110,
        at: t - c.currentTime + i * STEP,
        dur: STEP * 1.6,
        type: 'sawtooth',
        gain: 0.06,
      });
    }
    if (i % 4 === 0) {
      notes.push({
        freq: 120,
        at: t - c.currentTime + i * STEP,
        dur: 0.12,
        type: 'sine',
        slideTo: 45,
        gain: 0.2,
      });
    }
  }
  playNotes(notes, musicBus);
  nextBar += STEP * 8;
  barIndex++;
}

function startMusic(): void {
  musicWanted = true;
  if (!getPrefs().music || musicTimer !== null) return;
  const c = context();
  if (c === null || master === null) return;
  musicBus = c.createGain();
  musicBus.gain.value = 0.5;
  musicBus.connect(master);
  nextBar = c.currentTime + 0.1;
  barIndex = 0;
  scheduleBar();
  musicTimer = window.setInterval(() => {
    // Keep about one bar queued ahead.
    if (ctx !== null && nextBar - ctx.currentTime < STEP * 8) scheduleBar();
  }, 500);
}

function stopMusic(): void {
  if (musicTimer !== null) {
    window.clearInterval(musicTimer);
    musicTimer = null;
  }
  if (musicBus !== null && ctx !== null) {
    const bus = musicBus;
    bus.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
    window.setTimeout(() => bus.disconnect(), 600);
    musicBus = null;
  }
}

/** The game screen is up: play the loop (if music is on) until `setMusicPlaying(false)`. */
export function setMusicPlaying(on: boolean): void {
  if (on) startMusic();
  else {
    musicWanted = false;
    stopMusic();
  }
}
