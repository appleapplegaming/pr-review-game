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
  it('schedules a bar and loops on a timer, then stops', async () => {
    const s = await load();
    s.setMusicPlaying(true);
    expect(oscillators.length).toBeGreaterThan(0);
    expect(window.setInterval).toHaveBeenCalledOnce();
    s.setMusicPlaying(false);
    expect(window.clearInterval).toHaveBeenCalled();
  });

  it('does not start when music is off', async () => {
    const s = await load();
    s.setPrefs({ music: false });
    s.setMusicPlaying(true);
    expect(oscillators).toHaveLength(0);
    expect(window.setInterval).not.toHaveBeenCalled();
  });
});
