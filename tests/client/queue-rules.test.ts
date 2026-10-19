import { describe, expect, it } from 'vitest';
import { config } from '../../shared/config';
import type { PublicPlayer, PublicPr } from '../../shared/types';
import { serverTimeFrom, offsetFromWelcome } from '../../client/src/net/clock';
import { countdown, openQueue, viewerNames } from '../../client/src/views/game/queue-rules';

function pr(overrides: Partial<PublicPr> & { id: string }): PublicPr {
  return {
    title: `PR ${overrides.id}`,
    author: 'dev',
    area: 'payments',
    description: '',
    diff: '+x',
    featureValue: 500_000,
    spawnAt: 0,
    expiresAt: 90_000,
    status: 'open',
    resolution: null,
    viewers: [],
    comments: [],
    highlighted: false,
    ...overrides,
  };
}

function player(id: string, name: string): PublicPlayer {
  return { id, name, isHost: false, connected: true, joinedAt: 0 };
}

describe('countdown', () => {
  it('reports remaining time and an m:ss label', () => {
    const c = countdown({ expiresAt: 90_000, spawnAt: 0, now: 30_000 });
    expect(c.remainingMs).toBe(60_000);
    expect(c.label).toBe('1:00');
  });

  it('rounds up so 0:00 only shows at expiry', () => {
    expect(countdown({ expiresAt: 20_000, spawnAt: 0, now: 0 }).label).toBe('0:20');
    expect(countdown({ expiresAt: 20_000, spawnAt: 0, now: 19_001 }).label).toBe('0:01');
    expect(countdown({ expiresAt: 20_000, spawnAt: 0, now: 19_999 }).label).toBe('0:01');
    expect(countdown({ expiresAt: 20_000, spawnAt: 0, now: 20_000 }).label).toBe('0:00');
  });

  it('never goes negative after expiry', () => {
    const c = countdown({ expiresAt: 20_000, spawnAt: 0, now: 25_000 });
    expect(c.remainingMs).toBe(0);
    expect(c.label).toBe('0:00');
    expect(c.fraction).toBe(0);
  });

  it('uses the PR window (expiresAt - spawnAt) as the ring denominator, not the config timer', () => {
    // A time-scaled server gives a shorter window than config.prTimerMs.
    const c = countdown({ expiresAt: 9_000, spawnAt: 0, now: 4_500 });
    expect(c.fraction).toBeCloseTo(0.5, 5);
  });

  it('is urgent strictly under the configured threshold', () => {
    const at = (remaining: number) =>
      countdown({ expiresAt: 100_000, spawnAt: 0, now: 100_000 - remaining }).urgent;
    expect(at(config.countdownUrgentMs + 1)).toBe(false);
    expect(at(config.countdownUrgentMs)).toBe(false);
    expect(at(config.countdownUrgentMs - 1)).toBe(true);
  });

  it('keeps the countdown within 1 s of the server expiry when the local clock is skewed', () => {
    // The server is 7 s ahead. The welcome arrives 200 ms after it was sent, so the midpoint
    // estimate is off by at most half the round trip.
    const localSent = 1_000_000;
    const localReceived = 1_000_200;
    const serverNow = localSent + 7_000 + 100;
    const offset = offsetFromWelcome({ serverNow, sentAt: localSent, receivedAt: localReceived });

    const expiresAt = serverNow + 45_000; // in server time
    // Two moments later on the local clock, the reading is still tied to server time.
    for (const elapsed of [0, 5_000, 40_000]) {
      const localNow = localReceived + elapsed;
      const estimatedServerNow = serverTimeFrom(offset, localNow);
      const trueServerNow = localNow + 7_000;
      const shown = countdown({ expiresAt, spawnAt: serverNow - 1, now: estimatedServerNow });
      const truth = countdown({ expiresAt, spawnAt: serverNow - 1, now: trueServerNow });
      expect(Math.abs(shown.remainingMs - truth.remainingMs)).toBeLessThanOrEqual(1_000);
    }
  });
});

describe('openQueue', () => {
  it('lists only open PRs, soonest expiry first', () => {
    const queue = openQueue([
      pr({ id: 'a', expiresAt: 50_000 }),
      pr({ id: 'b', expiresAt: 10_000 }),
      pr({ id: 'c', expiresAt: 30_000, status: 'merged' }),
      pr({ id: 'd', expiresAt: 20_000, status: 'declined' }),
    ]);
    expect(queue.map((p) => p.id)).toEqual(['b', 'a']);
  });

  it('breaks expiry ties by id so the order is stable', () => {
    const queue = openQueue([pr({ id: 'y', expiresAt: 5 }), pr({ id: 'x', expiresAt: 5 })]);
    expect(queue.map((p) => p.id)).toEqual(['x', 'y']);
  });

  it('does not mutate its input', () => {
    const input = [pr({ id: 'a', expiresAt: 9 }), pr({ id: 'b', expiresAt: 1 })];
    openQueue(input);
    expect(input.map((p) => p.id)).toEqual(['a', 'b']);
  });
});

describe('viewerNames', () => {
  const players = [player('p1', 'Sara'), player('p2', 'Ben'), player('p3', 'Ali')];

  it('resolves viewer ids to names and leaves out the viewer themselves', () => {
    expect(viewerNames(['p1', 'p2'], players, 'p1')).toEqual(['Ben']);
    expect(viewerNames(['p2', 'p3'], players, 'p1')).toEqual(['Ben', 'Ali']);
  });

  it('skips ids that are not in the player list instead of throwing', () => {
    expect(viewerNames(['gone', 'p2'], players, 'p1')).toEqual(['Ben']);
  });

  it('returns an empty list when nobody else is looking', () => {
    expect(viewerNames([], players, 'p1')).toEqual([]);
    expect(viewerNames(['p1'], players, 'p1')).toEqual([]);
  });
});

import { commentLabel } from '../../client/src/views/game/queue-rules';

describe('commentLabel', () => {
  it('spells out the count', () => {
    expect([0, 1, 2].map(commentLabel)).toEqual(['No comments', '1 comment', '2 comments']);
  });
});
