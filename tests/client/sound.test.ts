import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameEvent } from '../../shared/types';

class FakeParam {
  setValueAtTime = vi.fn();
  exponentialRampToValueAtTime = vi.fn();
  setTargetAtTime = vi.fn();
  value = 0;
}
class FakeNode {
  gain = new FakeParam();
  frequency = new FakeParam();
  type = '';
  connect = vi.fn((n: unknown) => n);
  disconnect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}
let oscillators: FakeNode[] = [];
let created = 0;
let resumed = 0;

class FakeAudioContext {
  currentTime = 0;
  state = 'suspended';
  destination = new FakeNode();
  constructor() {
    created++;
  }
  createGain() {
    return new FakeNode();
  }
  createOscillator() {
    const o = new FakeNode();
    oscillators.push(o);
    return o;
  }
  resume() {
    resumed++;
    this.state = 'running';
    return Promise.resolve();
  }
}

const store = new Map<string, string>();

async function load() {
  vi.resetModules();
  return import('../../client/src/audio/sound');
}

const catchEvent: GameEvent = {
  kind: 'catch',
  prId: 'p',
  prTitle: 't',
  by: 'a',
  byName: 'A',
  bugType: 'money',
  bonus: 1,
  at: 0,
};

beforeEach(() => {
  oscillators = [];
  created = 0;
  resumed = 0;
  store.clear();
  vi.stubGlobal('window', {
    AudioContext: FakeAudioContext,
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
    },
    setInterval: vi.fn(() => 1),
    clearInterval: vi.fn(),
    setTimeout: vi.fn(),
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('sound effects', () => {
  it('plays notes for every event kind', async () => {
    const s = await load();
    const kinds: GameEvent[] = [
      catchEvent,
      { kind: 'merge', prId: 'p', prTitle: 't', by: null, byName: null, at: 0 },
      {
        kind: 'decline',
        prId: 'p',
        prTitle: 't',
        by: 'a',
        byName: 'A',
        bugType: 'money',
        verdict: 'clean',
        at: 0,
      },
      { kind: 'incident', bugType: 'outage', text: 'x', at: 0 },
      { kind: 'ping', prId: 'p', prTitle: 't', playerId: 'a', playerName: 'A', at: 0 },
      { kind: 'comment', prId: 'p', prTitle: 't', by: 'a', byName: 'A', onLine: false, at: 0 },
    ];
    for (const event of kinds) {
      oscillators = [];
      s.sfxForEvent(event);
      expect(oscillators.length, event.kind).toBeGreaterThan(0);
      for (const o of oscillators) {
        expect(o.start).toHaveBeenCalledOnce();
        expect(o.stop).toHaveBeenCalledOnce();
      }
    }
  });

  it('plays the start and end stingers', async () => {
    const s = await load();
    s.sfxQuarterStart();
    expect(oscillators.length).toBe(4);
    oscillators = [];
    s.sfxQuarterEnd(true);
    expect(oscillators.length).toBe(4);
    oscillators = [];
    s.sfxQuarterEnd(false);
    expect(oscillators.length).toBe(3);
  });

  it('is silent when sfx is muted, and the choice is saved', async () => {
    const s = await load();
    s.setPrefs({ sfx: false });
    s.sfxForEvent(catchEvent);
    s.sfxQuarterStart();
    expect(oscillators).toHaveLength(0);
    expect(JSON.parse(store.get('shipit.sound') ?? '{}')).toEqual({ sfx: false, music: true });
    const again = await load();
    expect(again.getPrefs().sfx).toBe(false);
  });

  it('resumes a suspended context on unlock', async () => {
    const s = await load();
    s.unlockAudio();
    s.unlockAudio();
    expect(created).toBe(1);
    expect(resumed).toBe(1);
  });

  it('does nothing without Web Audio', async () => {
    vi.stubGlobal('window', { localStorage: { getItem: () => null, setItem: () => {} } });
    const s = await load();
    expect(() => {
      s.sfxForEvent(catchEvent);
      s.setMusicPlaying(true);
      s.unlockAudio();
    }).not.toThrow();
  });
});

describe('music', () => {
  class FakeAudio {
    static all: FakeAudio[] = [];
    src = '';
    volume = 1;
    paused = true;
    handlers = new Map<string, () => void>();
    played: string[] = [];
    constructor() {
      FakeAudio.all.push(this);
    }
    addEventListener(name: string, fn: () => void) {
      this.handlers.set(name, fn);
    }
    removeEventListener(name: string) {
      this.handlers.delete(name);
    }
    play() {
      this.paused = false;
      this.played.push(this.src);
      return Promise.resolve();
    }
    pause() {
      this.paused = true;
    }
    end() {
      this.handlers.get('ended')?.();
    }
  }

  beforeEach(() => {
    FakeAudio.all = [];
    vi.stubGlobal('Audio', FakeAudio);
  });

  it('plays every song once in a shuffled order, then reshuffles without an immediate repeat', async () => {
    const s = await load();
    s.setMusicPlaying(true);
    const audio = FakeAudio.all[0] as FakeAudio;
    expect(FakeAudio.all).toHaveLength(1);
    for (let i = 0; i < 11; i++) audio.end();
    const played = audio.played;
    expect(played).toHaveLength(12);
    for (let round = 0; round < 3; round++) {
      expect(new Set(played.slice(round * 4, round * 4 + 4)).size).toBe(4);
    }
    for (let i = 1; i < played.length; i++) expect(played[i]).not.toBe(played[i - 1]);
    expect(played.every((src) => src.endsWith('.mp3'))).toBe(true);
    expect(played[0]).not.toMatch(/ /);
  });

  it('stops when asked and does not start when music is off', async () => {
    const s = await load();
    s.setMusicPlaying(true);
    const audio = FakeAudio.all[0] as FakeAudio;
    s.setMusicPlaying(false);
    expect(audio.paused).toBe(true);
    audio.end();
    expect(audio.played).toHaveLength(1);

    const off = await load();
    off.setPrefs({ music: false });
    off.setMusicPlaying(true);
    expect(FakeAudio.all).toHaveLength(1);
  });

  it('does nothing without an Audio element', async () => {
    vi.stubGlobal('Audio', undefined);
    const s = await load();
    expect(() => s.setMusicPlaying(true)).not.toThrow();
  });
});
