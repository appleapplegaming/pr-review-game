import { describe, expect, it } from 'vitest';
import type { Bug, BugType, PullRequest } from '../../shared/types';
import { config } from '../../shared/config';
import { applyIntent, type ApplyResult, type Applied } from '../../server/engine/apply-intent';
import { isHighlighted } from '../../server/engine/collab';
import { createRng } from '../../server/engine/rng';
import { tick } from '../../server/engine/tick';
import {
  defaultTiming,
  type GameState,
  type Quarter,
  type ServerPlayer,
  type ServerPr,
} from '../../server/engine/state';

// Comments and pings: a fake clock and a seeded RNG, as in the other engine tests.
const NOW = 1_700_000_000_000;
const FEATURE_VALUE = 800_000;
const DIFF = '@@ a.ts @@\n const a = 1;\n+const b = 2;\n-const c = 3;';
const DIFF_LINES = 3;

const SARA: ServerPlayer = { id: 'p-sara', name: 'Sara', joinedAt: NOW, connected: true };
const JOE: ServerPlayer = { id: 'p-joe', name: 'Joe', joinedAt: NOW, connected: true };

function makePr(id: string, bugType: BugType | null): PullRequest {
  const bug: Bug | null =
    bugType === null
      ? null
      : {
          type: bugType,
          severity: 'major',
          lines: [2],
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
    diff: DIFF,
    featureValue: FEATURE_VALUE,
    bug,
  };
}

/** A spawned, open PR that expires 90 s after NOW. */
function serverPr(
  id: string,
  bugType: BugType | null,
  overrides: Partial<ServerPr> = {},
): ServerPr {
  return {
    pr: makePr(id, bugType),
    spawnAt: NOW,
    expiresAt: NOW + config.prTimerMs,
    status: 'open',
    resolution: null,
    viewers: [],
    comments: [],
    pings: [],
    ...overrides,
  };
}

function gameWith(
  prs: ServerPr[],
  overrides: { phase?: GameState['phase']; endsAt?: number } = {},
): GameState {
  const quarter: Quarter = {
    timing: defaultTiming(),
    minutes: config.durationMinutes.default,
    startedAt: NOW,
    endsAt: overrides.endsAt ?? NOW + 600_000,
    upcoming: [],
    prs: new Map(prs.map((p) => [p.pr.id, p])),
    incidents: [],
    metrics: { value: config.startingValue, downtimeMinutes: 0, breaches: 0 },
    bankrupt: false,
    nextId: 1,
  };
  return {
    code: 'ABCD',
    companyName: 'Acme',
    hostId: SARA.id,
    players: [SARA, JOE],
    phase: overrides.phase ?? 'playing',
    quarter,
  };
}

const rng = () => createRng(7);

function quarterOf(state: GameState): Quarter {
  if (state.quarter === null) throw new Error('expected a quarter');
  return state.quarter;
}

function serverPrOf(state: GameState, prId: string): ServerPr {
  const pr = quarterOf(state).prs.get(prId);
  if (pr === undefined) throw new Error(`expected PR ${prId}`);
  return pr;
}

function expectApplied(result: ApplyResult): Applied {
  if (!result.ok) throw new Error(`expected ok, got ${result.code}: ${result.message}`);
  return result;
}

function expectRejected(result: ApplyResult): { code: string; message: string } {
  if (result.ok) throw new Error('expected a rejection, got ok');
  return result;
}

function comment(
  state: GameState,
  playerId: string,
  text: string,
  line: number | null = null,
  at = NOW,
) {
  return applyIntent(state, playerId, { t: 'comment', prId: 'p1', line, text }, at, rng());
}

function ping(state: GameState, playerId: string, at: number, prId = 'p1') {
  return applyIntent(state, playerId, { t: 'ping', prId }, at, rng());
}

describe('comments', () => {
  it('stores a whole-PR comment with its author, time and trimmed text', () => {
    const state = gameWith([serverPr('p1', null)]);
    const result = expectApplied(comment(state, SARA.id, '  looks fine  ', null, NOW + 5_000));

    expect(serverPrOf(result.state, 'p1').comments).toEqual([
      {
        id: 'c-1',
        prId: 'p1',
        playerId: SARA.id,
        playerName: 'Sara',
        line: null,
        text: 'looks fine',
        at: NOW + 5_000,
      },
    ]);
    expect(quarterOf(result.state).nextId).toBe(2);
    expect(result.events).toEqual([
      {
        kind: 'comment',
        prId: 'p1',
        prTitle: 'PR p1',
        by: SARA.id,
        byName: 'Sara',
        onLine: false,
        at: NOW + 5_000,
      },
    ]);
  });

  it('accepts a comment on a diff line that exists', () => {
    const state = gameWith([serverPr('p1', null)]);
    const result = expectApplied(comment(state, SARA.id, 'line three', DIFF_LINES));

    expect(serverPrOf(result.state, 'p1').comments[0]?.line).toBe(DIFF_LINES);
  });

  it('rejects a line past the end of the diff, a line below 1 and a fractional line', () => {
    const state = gameWith([serverPr('p1', null)]);
    for (const line of [0, -1, DIFF_LINES + 1, 1.5, Number.NaN]) {
      const result = expectRejected(comment(state, SARA.id, 'nope', line));
      expect(result.code).toBe('INVALID_COMMENT');
    }
  });

  it('rejects empty and whitespace-only text', () => {
    const state = gameWith([serverPr('p1', null)]);
    for (const text of ['', '   ', '\n\t ']) {
      expect(expectRejected(comment(state, SARA.id, text)).code).toBe('INVALID_COMMENT');
    }
  });

  it('accepts exactly 280 characters and rejects 281', () => {
    const state = gameWith([serverPr('p1', null)]);
    expectApplied(comment(state, SARA.id, 'a'.repeat(280)));

    const result = expectRejected(comment(state, SARA.id, 'a'.repeat(281)));
    expect(result.code).toBe('INVALID_COMMENT');
  });

  it('counts characters, not UTF-16 code units, when checking the length', () => {
    const state = gameWith([serverPr('p1', null)]);
    // 280 emoji are 560 UTF-16 code units but 280 characters.
    expectApplied(comment(state, SARA.id, '😀'.repeat(280)));
    expect(expectRejected(comment(state, SARA.id, '😀'.repeat(281))).code).toBe('INVALID_COMMENT');
  });

  it('accepts a comment on a merged or declined PR, and leaves its resolution alone', () => {
    const merged = gameWith([
      serverPr('p1', null, {
        status: 'merged',
        resolution: { kind: 'merged', by: JOE.id, byName: 'Joe', at: NOW + 1_000 },
      }),
    ]);
    const afterMerge = expectApplied(comment(merged, SARA.id, 'too late to matter'));
    expect(serverPrOf(afterMerge.state, 'p1').comments).toHaveLength(1);
    expect(serverPrOf(afterMerge.state, 'p1').resolution).toEqual(
      merged.quarter?.prs.get('p1')?.resolution,
    );

    const declined = gameWith([
      serverPr('p1', 'money', {
        status: 'declined',
        resolution: {
          kind: 'declined',
          by: JOE.id,
          byName: 'Joe',
          at: NOW + 1_000,
          bugType: 'money',
        },
      }),
    ]);
    const afterDecline = expectApplied(comment(declined, SARA.id, 'agreed'));
    expect(serverPrOf(afterDecline.state, 'p1').status).toBe('declined');
    expect(serverPrOf(afterDecline.state, 'p1').comments).toHaveLength(1);
  });

  it('does not change the PR status, viewers or the company value', () => {
    const state = gameWith([serverPr('p1', null, { viewers: [JOE.id] })]);
    const result = expectApplied(comment(state, SARA.id, 'hello'));

    expect(serverPrOf(result.state, 'p1').status).toBe('open');
    expect(serverPrOf(result.state, 'p1').viewers).toEqual([JOE.id]);
    expect(quarterOf(result.state).metrics.value).toBe(config.startingValue);
  });

  it('rejects a comment from a player who is not in the room', () => {
    const state = gameWith([serverPr('p1', null)]);
    expect(expectRejected(comment(state, 'p-stranger', 'hi')).code).toBe('NOT_IN_ROOM');
  });

  it('rejects a comment on an unknown PR', () => {
    const state = gameWith([serverPr('p1', null)]);
    const result = expectRejected(
      applyIntent(
        state,
        SARA.id,
        { t: 'comment', prId: 'nope', line: null, text: 'hi' },
        NOW,
        rng(),
      ),
    );
    expect(result.code).toBe('PR_NOT_FOUND');
  });

  it('rejects a comment once the quarter has ended', () => {
    const state = gameWith([serverPr('p1', null)], { phase: 'ended' });
    expect(expectRejected(comment(state, SARA.id, 'too late')).code).toBe('WRONG_PHASE');
  });
});

describe('second-opinion pings', () => {
  it('records the ping, emits a ping event and highlights the PR', () => {
    const state = gameWith([serverPr('p1', null)]);
    const result = expectApplied(ping(state, SARA.id, NOW + 1_000));

    expect(serverPrOf(result.state, 'p1').pings).toEqual([
      { prId: 'p1', playerId: SARA.id, playerName: 'Sara', at: NOW + 1_000 },
    ]);
    expect(result.events).toEqual([
      {
        kind: 'ping',
        prId: 'p1',
        prTitle: 'PR p1',
        playerId: SARA.id,
        playerName: 'Sara',
        at: NOW + 1_000,
      },
    ]);
    expect(isHighlighted(serverPrOf(result.state, 'p1'))).toBe(true);
  });

  it('rejects a second ping from the same player within 20 s', () => {
    const first = expectApplied(ping(gameWith([serverPr('p1', null)]), SARA.id, NOW));
    const result = expectRejected(ping(first.state, SARA.id, NOW + config.pingCooldownMs - 1));

    expect(result.code).toBe('PING_COOLDOWN');
    expect(serverPrOf(first.state, 'p1').pings).toHaveLength(1);
  });

  it('accepts a ping from the same player once 20 s have passed', () => {
    const first = expectApplied(ping(gameWith([serverPr('p1', null)]), SARA.id, NOW));

    expectApplied(ping(first.state, SARA.id, NOW + config.pingCooldownMs));
    expectApplied(ping(first.state, SARA.id, NOW + config.pingCooldownMs + 1));
  });

  it('keeps the cooldown independent per player', () => {
    const first = expectApplied(ping(gameWith([serverPr('p1', null)]), SARA.id, NOW));

    const joes = expectApplied(ping(first.state, JOE.id, NOW + 1_000));
    expect(serverPrOf(joes.state, 'p1').pings).toHaveLength(2);

    // Sara is still cooling down, whatever Joe has done.
    expect(expectRejected(ping(joes.state, SARA.id, NOW + 2_000)).code).toBe('PING_COOLDOWN');
  });

  it('keeps the cooldown independent per PR', () => {
    const state = gameWith([serverPr('p1', null), serverPr('p2', null)]);
    const first = expectApplied(ping(state, SARA.id, NOW, 'p1'));

    expectApplied(ping(first.state, SARA.id, NOW + 1_000, 'p2'));
  });

  it('rejects a ping on a resolved PR, since a resolved PR is no longer highlighted', () => {
    const state = gameWith([
      serverPr('p1', null, {
        status: 'merged',
        resolution: { kind: 'merged', by: JOE.id, byName: 'Joe', at: NOW + 1_000 },
      }),
    ]);
    expect(expectRejected(ping(state, SARA.id, NOW + 2_000)).code).toBe('PR_NOT_OPEN');
  });

  it('rejects a ping from a player who is not in the room', () => {
    const state = gameWith([serverPr('p1', null)]);
    expect(expectRejected(ping(state, 'p-stranger', NOW)).code).toBe('NOT_IN_ROOM');
  });

  it('clears the highlight when the PR resolves', () => {
    const pinged = expectApplied(ping(gameWith([serverPr('p1', null)]), SARA.id, NOW));
    expect(isHighlighted(serverPrOf(pinged.state, 'p1'))).toBe(true);

    const merged = expectApplied(
      applyIntent(pinged.state, JOE.id, { t: 'merge', prId: 'p1' }, NOW + 1_000, rng()),
    );
    expect(isHighlighted(serverPrOf(merged.state, 'p1'))).toBe(false);
  });

  it('does not highlight a PR with no pings', () => {
    expect(isHighlighted(serverPr('p1', null))).toBe(false);
  });
});

describe('comments and pings never move the PR timer', () => {
  it('auto-merges at exactly expiresAt after a comment and pings', () => {
    const expiresAt = NOW + config.prTimerMs;
    let state = gameWith([serverPr('p1', null)]);
    state = expectApplied(comment(state, SARA.id, 'first', null, NOW + 10_000)).state;
    state = expectApplied(ping(state, SARA.id, NOW + 80_000)).state;
    state = expectApplied(ping(state, JOE.id, NOW + 85_000)).state;
    state = expectApplied(comment(state, JOE.id, 'late', 1, NOW + 88_000)).state;

    expect(serverPrOf(state, 'p1').expiresAt).toBe(expiresAt);

    const justBefore = tick(state, expiresAt - 1, rng());
    expect(serverPrOf(justBefore.state, 'p1').status).toBe('open');

    const atExpiry = tick(state, expiresAt, rng());
    expect(serverPrOf(atExpiry.state, 'p1')).toMatchObject({
      status: 'merged',
      resolution: { kind: 'merged', by: null, at: expiresAt },
    });
  });
});
