import { describe, expect, it } from 'vitest';
import type { Bug, BugType, PullRequest } from '../../shared/types';
import { config } from '../../shared/config';
import { createQuarter, startQuarter } from '../../server/engine/setup';
import { createRng } from '../../server/engine/rng';
import { defaultTiming, type GameState, type Quarter } from '../../server/engine/state';

// A fake clock: the engine never reads the wall clock, so every test passes a fixed `now`.
const NOW = 1_700_000_000_000;

function makePr(id: string, bugType: BugType | null): PullRequest {
  const bug: Bug | null =
    bugType === null
      ? null
      : {
          type: bugType,
          severity: 'major',
          lines: [6],
          explanation: `Explanation for ${id}.`,
          incident: `Incident for ${id}.`,
        };
  return {
    id,
    title: `PR ${id}`,
    author: 'test.user',
    area: 'payments',
    description: `Description for ${id}.`,
    language: 'ts',
    diff: '@@ a.ts @@\n const a = 1;',
    featureValue: 800_000,
    bug,
  };
}

/** A pool with the SPEC's target mix: 9 clean, 7 money, 7 security, 7 outage. */
function fullPool(): PullRequest[] {
  const mix: [BugType | null, number][] = [
    [null, 9],
    ['money', 7],
    ['security', 7],
    ['outage', 7],
  ];
  return mix.flatMap(([type, count], group) =>
    Array.from({ length: count }, (_, i) =>
      makePr(`t-${group}-${String(i + 1).padStart(2, '0')}`, type),
    ),
  );
}

/** Every PR in the quarter, spawned or not, in schedule order. */
function allPrs(quarter: Quarter): PullRequest[] {
  return [...[...quarter.prs.values()].map((p) => p.pr), ...quarter.upcoming.map((u) => u.pr)];
}

function setupFor(players: number, seed: number, pool = fullPool()): Quarter {
  return createQuarter(pool, players, createRng(seed), NOW);
}

describe('game length', () => {
  const half = config.quarterMs / 2;

  it('scales the quarter and the spawn window with the chosen length, but not the PR timer', () => {
    const base = defaultTiming();
    const state: GameState = {
      code: 'KZQX',
      companyName: 'Acme',
      hostId: 'p1',
      players: [{ id: 'p1', name: 'Sara', joinedAt: NOW, connected: true }],
      phase: 'lobby',
      quarter: null,
    };
    const started = startQuarter(state, fullPool(), createRng(1), NOW, base, 5);
    const quarter = started.quarter;
    if (quarter === null) throw new Error('no quarter');
    expect(quarter.endsAt - quarter.startedAt).toBe(half);
    expect(quarter.timing.spawnWindowMs).toBe(base.spawnWindowMs / 2);
    expect(quarter.timing.prTimerMs).toBe(base.prTimerMs);
    const last = quarter.upcoming[quarter.upcoming.length - 1];
    expect(last && last.spawnAt - NOW).toBeLessThanOrEqual(quarter.timing.spawnWindowMs);
  });

  it('draws fewer PRs for a shorter game and more for a longer one, within 6 and the cap', () => {
    const count = (players: number, minutes: number) => {
      const q = createQuarter(fullPool(), players, createRng(1), NOW, defaultTiming(), minutes);
      return q.upcoming.length;
    };
    expect(count(5, 5)).toBeLessThan(count(5, 10));
    expect(count(2, 15)).toBeGreaterThan(count(2, 10));
    expect(count(1, 5)).toBeGreaterThanOrEqual(6);
    expect(count(8, 15)).toBe(config.prCount.max);
  });
});

describe('createQuarter: PR count', () => {
  it.each([
    [1, 12],
    [2, 16],
    [5, 28],
    [8, 30],
  ])('draws %i players as %i PRs', (players, expected) => {
    expect(allPrs(setupFor(players, 1))).toHaveLength(expected);
  });

  it('caps the draw at 30 PRs for more players than that', () => {
    expect(allPrs(setupFor(20, 1))).toHaveLength(config.prCount.max);
  });

  it('gives the same draw for the same seed', () => {
    const ids = (q: Quarter) => q.upcoming.map((u) => `${u.pr.id}@${u.spawnAt}`);
    expect(ids(setupFor(5, 42))).toEqual(ids(setupFor(5, 42)));
  });

  it('gives a different draw for a different seed', () => {
    const ids = (q: Quarter) => q.upcoming.map((u) => u.pr.id).join(',');
    expect(ids(setupFor(5, 1))).not.toEqual(ids(setupFor(5, 2)));
  });

  it('never draws the same PR twice', () => {
    const ids = allPrs(setupFor(5, 9)).map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('createQuarter: bug mix', () => {
  const SEEDS = 200;

  it('has at least one money, one security and one outage PR in every draw', () => {
    for (let seed = 0; seed < SEEDS; seed++) {
      const types = new Set(allPrs(setupFor(2, seed)).map((p) => p.bug?.type));
      expect(types.has('money'), `seed ${seed}`).toBe(true);
      expect(types.has('security'), `seed ${seed}`).toBe(true);
      expect(types.has('outage'), `seed ${seed}`).toBe(true);
    }
  });

  it('keeps the guarantee when the pool has only one PR of a bug type', () => {
    const pool = fullPool().filter((p) => p.bug?.type !== 'money' || p.id === 't-1-01');
    for (let seed = 0; seed < 50; seed++) {
      const prs = allPrs(setupFor(2, seed, pool));
      expect(prs.some((p) => p.bug?.type === 'money')).toBe(true);
    }
  });

  it('draws about a third clean across many seeds', () => {
    let clean = 0;
    let total = 0;
    for (let seed = 0; seed < SEEDS; seed++) {
      for (const p of allPrs(setupFor(5, seed))) {
        total += 1;
        if (p.bug === null) clean += 1;
      }
    }
    expect(Math.abs(clean / total - 1 / 3)).toBeLessThan(0.02);
  });

  it('draws exactly a third clean for 12 PRs', () => {
    const clean = allPrs(setupFor(1, 3)).filter((p) => p.bug === null);
    expect(clean).toHaveLength(4);
  });

  it('fails loudly when the pool has too few buggy PRs for the draw', () => {
    const fewBuggy = fullPool().filter(
      (p) => p.bug === null || p.id === 't-1-01' || p.id === 't-2-01',
    );
    expect(() => setupFor(1, 1, fewBuggy)).toThrow(/needs 8/);
  });

  it('fails loudly when the pool cannot supply the draw', () => {
    const noOutage = fullPool().filter((p) => p.bug?.type !== 'outage');
    expect(() => setupFor(2, 1, noOutage)).toThrow(/outage/);
  });
});

describe('createQuarter: spawn schedule', () => {
  const window = config.spawnWindowMs;
  const jitter = config.spawnJitter;

  it('keeps every spawn within [0, 8:30] of the quarter start', () => {
    for (let seed = 0; seed < 50; seed++) {
      for (const u of setupFor(8, seed).upcoming) {
        expect(u.spawnAt).toBeGreaterThanOrEqual(NOW);
        expect(u.spawnAt).toBeLessThanOrEqual(NOW + window);
      }
    }
  });

  it('spawns in strictly ascending order', () => {
    for (let seed = 0; seed < 50; seed++) {
      const times = setupFor(2, seed).upcoming.map((u) => u.spawnAt);
      for (let i = 1; i < times.length; i++) {
        expect(times[i]).toBeGreaterThan(times[i - 1] as number);
      }
    }
  });

  it('places each spawn within ±20% of its slot', () => {
    const count = 12;
    const slot = window / count;
    for (let seed = 0; seed < 50; seed++) {
      const q = setupFor(1, seed);
      expect(q.upcoming).toHaveLength(count);
      q.upcoming.forEach((u, i) => {
        const centre = (i + 0.5) * slot;
        const offset = u.spawnAt - NOW;
        // 1 ms of slack for rounding to whole milliseconds.
        expect(Math.abs(offset - centre)).toBeLessThanOrEqual(jitter * slot + 1);
      });
    }
  });

  it('actually jitters: slot centres are not all hit exactly', () => {
    const slot = window / 12;
    const offsets = setupFor(1, 5).upcoming.map((u, i) => u.spawnAt - NOW - (i + 0.5) * slot);
    expect(offsets.some((d) => Math.abs(d) > 1)).toBe(true);
  });
});

describe('createQuarter: starting state', () => {
  it('starts the clock and sets the starting metrics', () => {
    const q = setupFor(2, 1);
    expect(q.startedAt).toBe(NOW);
    expect(q.endsAt).toBe(NOW + config.quarterMs);
    expect(q.metrics).toEqual({
      value: config.startingValue,
      downtimeMinutes: 0,
      breaches: 0,
    });
    expect(q.bankrupt).toBe(false);
  });

  it('starts with nothing spawned, nothing scheduled to fire, and the id counter at 1', () => {
    const q = setupFor(2, 1);
    expect(q.prs.size).toBe(0);
    expect(q.incidents).toEqual([]);
    expect(q.nextId).toBe(1);
  });

  it('uses the timing it was given', () => {
    const timing = { ...defaultTiming(), quarterMs: 60_000, spawnWindowMs: 30_000 };
    const q = createQuarter(fullPool(), 2, createRng(1), NOW, timing);
    expect(q.endsAt).toBe(NOW + 60_000);
    expect(q.timing).toEqual(timing);
    for (const u of q.upcoming) {
      expect(u.spawnAt).toBeLessThanOrEqual(NOW + 30_000);
    }
  });
});

describe('startQuarter', () => {
  it('moves a lobby into playing and draws the PRs for its players', () => {
    const lobby: GameState = {
      code: 'KZQX',
      companyName: 'Acme',
      hostId: 'p1',
      players: Array.from({ length: 5 }, (_, i) => ({
        id: `p${i + 1}`,
        name: `Player ${i + 1}`,
        joinedAt: NOW,
        connected: true,
      })),
      phase: 'lobby',
      quarter: null,
    };
    const next = startQuarter(lobby, fullPool(), createRng(4), NOW);
    expect(next.phase).toBe('playing');
    expect(next.quarter).not.toBeNull();
    expect(allPrs(next.quarter as Quarter)).toHaveLength(28);
    expect(next.players).toBe(lobby.players);
    expect(lobby.quarter).toBeNull();
  });
});
