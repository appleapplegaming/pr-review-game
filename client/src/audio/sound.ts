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
  if (musicWanted) startMusic();
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

// --- Music: the songs in client/public, played in a shuffled order, one after the other. ---

const TRACKS = [
  '67 Skibidi Wallahi - TR3N TEN.mp3',
  'Bomboclat Wallahi - TR3N TEN.mp3',
  'Miguel Netanyahu - TR3N TEN.mp3',
  'One Little Pigeon - TR3N TEN.mp3',
].map((name) => `/${encodeURIComponent(name)}`);

const MUSIC_VOLUME = 0.4;

/** Fisher-Yates copy. */
function shuffled<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

let musicWanted = false;
let player: HTMLAudioElement | null = null;
let queue: string[] = [];
let lastTrack: string | null = null;

/** Next track from the shuffled queue. A new shuffle never starts with the track just played. */
function nextTrack(): string {
  if (queue.length === 0) {
    queue = shuffled(TRACKS);
    if (queue.length > 1 && queue[0] === lastTrack) queue.push(queue.shift() as string);
  }
  lastTrack = queue.shift() as string;
  return lastTrack;
}

function playNext(): void {
  if (player === null) return;
  player.src = nextTrack();
  void player.play().catch(() => {
    // Autoplay was refused before a user gesture. The next unlock or toggle retries.
  });
}

function startMusic(): void {
  musicWanted = true;
  if (!getPrefs().music || typeof Audio === 'undefined') return;
  if (player === null) {
    player = new Audio();
    player.volume = MUSIC_VOLUME;
    player.addEventListener('ended', playNext);
    playNext();
  } else if (player.paused) {
    void player.play().catch(() => {});
  }
}

function stopMusic(): void {
  if (player === null) return;
  player.removeEventListener('ended', playNext);
  player.pause();
  player = null;
}

/** The game screen is up: play the songs (if music is on) until `setMusicPlaying(false)`. */
export function setMusicPlaying(on: boolean): void {
  if (on) startMusic();
  else {
    musicWanted = false;
    stopMusic();
  }
}
