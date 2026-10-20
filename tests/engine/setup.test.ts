import { describe, expect, it } from 'vitest';
import type { Bug, BugType, PullRequest } from '../../shared/types';
import { config } from '../../shared/config';
import { createQuarter, prCountFor, replanUpcoming, startQuarter } from '../../server/engine/setup';
import { createRng } from '../../server/engine/rng';
import { defaultTiming, type GameState, type Quarter } from '../../server/engine/state';
import { tick } from '../../server/engine/tick';

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

/** Runs the real engine clock on a quarter up to `at`, so PRs spawn the way they do in play. */
function playUntil(quarter: Quarter, at: number, seed = 99): Quarter {
  const state: GameState = {
    code: 'KZQX',
    companyName: 'Acme',
    hostId: 'p1',
    players: [],
    phase: 'playing',
    quarter,
  };
  const next = tick(state, at, createRng(seed)).state.quarter;
  if (next === null) throw new Error('no quarter');
  return next;
}

function windowEnd(quarter: Quarter): number {
  return quarter.startedAt + quarter.timing.spawnWindowMs;
}

describe('replanUpcoming', () => {
  it('grows the quarter to the new player count when players join', () => {
    const now = NOW + 180_000;
    const before = playUntil(setupFor(2, 1), now);
    const after = replanUpcoming(before, fullPool(), 4, createRng(2), now);
    expect(allPrs(after)).toHaveLength(prCountFor(4));
  });

  it('spawns the remaining PRs faster after players join', () => {
    const now = NOW + 180_000;
    const before = playUntil(setupFor(2, 1), now);
    const after = replanUpcoming(before, fullPool(), 4, createRng(2), now);
    const gap = (q: Quarter) => (windowEnd(q) - now) / q.upcoming.length;
    expect(gap(after)).toBeLessThan(gap(before));
  });

  it('never draws a PR twice', () => {
    for (let seed = 0; seed < 50; seed++) {
      const now = NOW + 120_000;
      const before = playUntil(setupFor(1, seed), now);
      const after = replanUpcoming(before, fullPool(), 8, createRng(seed), now);
      const ids = allPrs(after).map((p) => p.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('schedules every remaining PR after now, inside the window, in ascending order', () => {
    for (let seed = 0; seed < 50; seed++) {
      const now = NOW + 200_000;
      const before = playUntil(setupFor(2, seed), now);
      const after = replanUpcoming(before, fullPool(), 6, createRng(seed), now);
      const times = after.upcoming.map((u) => u.spawnAt);
      for (const [i, t] of times.entries()) {
        expect(t).toBeGreaterThan(now);
        expect(t).toBeLessThanOrEqual(windowEnd(after));
        if (i > 0) expect(t).toBeGreaterThan(times[i - 1] as number);
      }
    }
  });

  it('leaves the PRs that already spawned alone', () => {
    const now = NOW + 180_000;
    const before = playUntil(setupFor(2, 1), now);
    expect(before.prs.size).toBeGreaterThan(0);
    const after = replanUpcoming(before, fullPool(), 4, createRng(2), now);
    expect(after.prs).toBe(before.prs);
  });

  it('keeps about a third of the PRs clean when it draws more', () => {
    const now = NOW + 60_000;
    const before = playUntil(setupFor(1, 3), now);
    const after = replanUpcoming(before, fullPool(), 5, createRng(3), now);
    const total = allPrs(after);
    const clean = total.filter((p) => p.bug === null).length;
    expect(clean).toBe(Math.round(total.length * config.cleanShare));
  });

  it('shrinks the quarter to the new player count when players leave', () => {
    const now = NOW + 60_000;
    const before = playUntil(setupFor(5, 1), now);
    const after = replanUpcoming(before, fullPool(), 2, createRng(2), now);
    expect(allPrs(after)).toHaveLength(prCountFor(2));
  });

  it('spawns the remaining PRs slower after players leave', () => {
    const now = NOW + 60_000;
    const before = playUntil(setupFor(5, 1), now);
    const after = replanUpcoming(before, fullPool(), 2, createRng(2), now);
    const gap = (q: Quarter) => (windowEnd(q) - now) / q.upcoming.length;
    expect(gap(after)).toBeGreaterThan(gap(before));
  });

  it('never drops below the PRs that already spawned', () => {
    const now = NOW + 400_000;
    const before = playUntil(setupFor(6, 1), now);
    expect(before.prs.size).toBeGreaterThan(prCountFor(1));
    const after = replanUpcoming(before, fullPool(), 1, createRng(2), now);
    expect(after.upcoming).toHaveLength(0);
    expect(after.prs.size).toBe(before.prs.size);
  });

  it('reaches the smaller count whichever PRs have already spawned', () => {
    for (let seed = 0; seed < 50; seed++) {
      for (const elapsed of [30_000, 90_000, 150_000]) {
        const now = NOW + elapsed;
        const before = playUntil(setupFor(6, seed), now, seed);
        const after = replanUpcoming(before, fullPool(), 1, createRng(seed), now);
        expect(allPrs(after)).toHaveLength(Math.max(before.prs.size, prCountFor(1)));
      }
    }
  });

  it('drops surplus clean PRs first, so a smaller game is not mostly clean', () => {
    for (let seed = 0; seed < 50; seed++) {
      const before = setupFor(5, seed);
      const after = replanUpcoming(before, fullPool(), 2, createRng(seed), NOW + 1_000);
      const clean = allPrs(after).filter((p) => p.bug === null).length;
      expect(clean).toBeLessThanOrEqual(Math.round(prCountFor(2) * config.cleanShare));
    }
  });

  it('keeps at least one PR of each bug type when it shrinks', () => {
    for (let seed = 0; seed < 50; seed++) {
      const now = NOW + 30_000;
      const before = playUntil(setupFor(6, seed), now);
      const after = replanUpcoming(before, fullPool(), 1, createRng(seed), now);
      const types = new Set(allPrs(after).map((p) => p.bug?.type));
      for (const type of ['money', 'security', 'outage'] as const) expect(types).toContain(type);
    }
  });

  it('changes nothing once the spawn window has closed', () => {
    const before = setupFor(2, 1);
    const now = windowEnd(before) + 1;
    expect(replanUpcoming(before, fullPool(), 6, createRng(2), now)).toBe(before);
  });

  it('changes nothing when the PR count would stay the same', () => {
    const now = NOW + 60_000;
    const before = playUntil(setupFor(6, 1), now);
    expect(replanUpcoming(before, fullPool(), 8, createRng(2), now)).toBe(before);
  });

  it('uses the game length the quarter was started with', () => {
    const state: GameState = {
      code: 'KZQX',
      companyName: 'Acme',
      hostId: 'p1',
      players: [{ id: 'p1', name: 'Sara', joinedAt: NOW, connected: true }],
      phase: 'lobby',
      quarter: null,
    };
    const started = startQuarter(state, fullPool(), createRng(1), NOW, defaultTiming(), 5);
    const quarter = started.quarter as Quarter;
    const after = replanUpcoming(quarter, fullPool(), 4, createRng(2), NOW + 10_000);
    expect(allPrs(after)).toHaveLength(prCountFor(4, 5));
  });

  it('adds what the pool still has rather than failing when it runs short', () => {
    // 9 clean, 7 money, 1 security, 1 outage: 18 PRs, too few for 4 players (24).
    const small = fullPool().filter((p) => p.id < 't-2' || p.id === 't-2-01' || p.id === 't-3-01');
    const before = createQuarter(small, 1, createRng(1), NOW);
    const after = replanUpcoming(before, small, 4, createRng(2), NOW + 10_000);
    expect(allPrs(after)).toHaveLength(small.length);
  });

  it('replays the same plan for the same seed', () => {
    const now = NOW + 90_000;
    const before = playUntil(setupFor(2, 7), now);
    const a = replanUpcoming(before, fullPool(), 5, createRng(11), now);
    const b = replanUpcoming(before, fullPool(), 5, createRng(11), now);
    expect(a.upcoming).toEqual(b.upcoming);
  });
});
