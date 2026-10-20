import { describe, expect, it } from 'vitest';
import type { Bug, BugType, PullRequest } from '../../shared/types';
import type { Intent } from '../../shared/protocol';
import { config } from '../../shared/config';
import { applyIntent, type ApplyResult, type Applied } from '../../server/engine/apply-intent';
import { createRng } from '../../server/engine/rng';
import { tick } from '../../server/engine/tick';
import {
  defaultTiming,
  type GameState,
  type Quarter,
  type ServerPlayer,
  type ServerPr,
} from '../../server/engine/state';

// A fake clock and a seeded RNG: the engine reads neither the wall clock nor Math.random().
const NOW = 1_700_000_000_000;
const FEATURE_VALUE = 800_000;

const SARA: ServerPlayer = { id: 'p-sara', name: 'Sara', joinedAt: NOW, connected: true };
const JOE: ServerPlayer = { id: 'p-joe', name: 'Joe', joinedAt: NOW, connected: true };

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
    featureValue: FEATURE_VALUE,
    bug,
  };
}

/** A spawned, open PR with its answer key. */
function serverPr(
  id: string,
  bugType: BugType | null,
  overrides: Partial<ServerPr> = {},
): ServerPr {
  return {
    pr: makePr(id, bugType),
    spawnAt: NOW - 1_000,
    expiresAt: NOW + 89_000,
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
  overrides: { phase?: GameState['phase']; quarter?: Quarter | null } = {},
): GameState {
  const quarter: Quarter = {
    timing: defaultTiming(),
    minutes: config.durationMinutes.default,
    startedAt: NOW - 60_000,
    endsAt: NOW + 540_000,
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
    quarter: overrides.quarter === undefined ? quarter : overrides.quarter,
  };
}

function quarterOf(state: GameState): Quarter {
  if (state.quarter === null) throw new Error('expected a quarter');
  return state.quarter;
}

function serverPrOf(state: GameState, prId: string): ServerPr {
  const pr = quarterOf(state).prs.get(prId);
  if (pr === undefined) throw new Error(`expected PR ${prId}`);
  return pr;
}

function valueOf(state: GameState): number {
  return quarterOf(state).metrics.value;
}

function expectApplied(result: ApplyResult): Applied {
  if (!result.ok) throw new Error(`expected ok, got ${result.code}: ${result.message}`);
  return result;
}

function expectRejected(result: ApplyResult): { code: string; message: string } {
  if (result.ok) throw new Error('expected a rejection, got ok');
  return result;
}

const rng = () => createRng(7);

describe('merge and decline outcomes (the Decisions table)', () => {
  it('clean merge adds the feature value and logs a merged resolution', () => {
    const state = gameWith([serverPr('c1', null)]);
    const result = expectApplied(
      applyIntent(state, SARA.id, { t: 'merge', prId: 'c1' }, NOW, rng()),
    );

    expect(valueOf(result.state)).toBe(config.startingValue + FEATURE_VALUE);
    expect(serverPrOf(result.state, 'c1').status).toBe('merged');
    expect(serverPrOf(result.state, 'c1').resolution).toEqual({
      kind: 'merged',
      by: SARA.id,
      byName: 'Sara',
      at: NOW,
    });
    expect(result.events).toEqual([
      { kind: 'merge', prId: 'c1', prTitle: 'PR c1', by: SARA.id, byName: 'Sara', at: NOW },
    ]);
  });

  it('clean decline changes no value, logs a declined resolution, and is not an incident', () => {
    const state = gameWith([serverPr('c1', null)]);
    const result = expectApplied(
      applyIntent(state, SARA.id, { t: 'decline', prId: 'c1', bugType: 'money' }, NOW, rng()),
    );

    expect(valueOf(result.state)).toBe(config.startingValue);
    expect(serverPrOf(result.state, 'c1').status).toBe('declined');
    expect(serverPrOf(result.state, 'c1').resolution).toEqual({
      kind: 'declined',
      by: SARA.id,
      byName: 'Sara',
      at: NOW,
      bugType: 'money',
    });
    expect(quarterOf(result.state).incidents).toEqual([]);
    expect(result.events).toEqual([
      {
        kind: 'decline',
        prId: 'c1',
        prTitle: 'PR c1',
        by: SARA.id,
        byName: 'Sara',
        bugType: 'money',
        verdict: 'clean',
        at: NOW,
      },
    ]);
  });

  it('buggy merge adds the feature value now and records a merged resolution', () => {
    const state = gameWith([serverPr('b1', 'security')]);
    const result = expectApplied(
      applyIntent(state, JOE.id, { t: 'merge', prId: 'b1' }, NOW, rng()),
    );

    expect(valueOf(result.state)).toBe(config.startingValue + FEATURE_VALUE);
    expect(serverPrOf(result.state, 'b1').resolution).toEqual({
      kind: 'merged',
      by: JOE.id,
      byName: 'Joe',
      at: NOW,
    });
    expect(result.events).toEqual([
      { kind: 'merge', prId: 'b1', prTitle: 'PR b1', by: JOE.id, byName: 'Joe', at: NOW },
    ]);
  });

  it('buggy decline with the correct type pays the +$150k catch bonus and makes no incident', () => {
    const state = gameWith([serverPr('b1', 'money')]);
    const result = expectApplied(
      applyIntent(state, SARA.id, { t: 'decline', prId: 'b1', bugType: 'money' }, NOW, rng()),
    );

    expect(config.catchBonus).toBe(150_000);
    expect(valueOf(result.state)).toBe(config.startingValue + config.catchBonus);
    expect(serverPrOf(result.state, 'b1').status).toBe('declined');
    expect(quarterOf(result.state).incidents).toEqual([]);
    expect(result.events).toEqual([
      {
        kind: 'catch',
        prId: 'b1',
        prTitle: 'PR b1',
        by: SARA.id,
        byName: 'Sara',
        bugType: 'money',
        bonus: 150_000,
        at: NOW,
      },
    ]);
  });

  it('buggy decline with the wrong type is "right call, wrong reason": no bonus, no incident', () => {
    const state = gameWith([serverPr('b1', 'money')]);
    const result = expectApplied(
      applyIntent(state, SARA.id, { t: 'decline', prId: 'b1', bugType: 'outage' }, NOW, rng()),
    );

    expect(valueOf(result.state)).toBe(config.startingValue);
    const resolution = serverPrOf(result.state, 'b1').resolution;
    expect(resolution).toMatchObject({ kind: 'declined', bugType: 'outage' });
    expect(quarterOf(result.state).incidents).toEqual([]);
    expect(result.events).toEqual([
      {
        kind: 'decline',
        prId: 'b1',
        prTitle: 'PR b1',
        by: SARA.id,
        byName: 'Sara',
        bugType: 'outage',
        verdict: 'wrong-reason',
        at: NOW,
      },
    ]);
  });

  it('does not mutate the input state', () => {
    const state = gameWith([serverPr('b1', 'money')]);
    const before = JSON.stringify([...quarterOf(state).prs.values()]);
    const valueBefore = valueOf(state);

    applyIntent(state, SARA.id, { t: 'merge', prId: 'b1' }, NOW, rng());

    expect(JSON.stringify([...quarterOf(state).prs.values()])).toBe(before);
    expect(valueOf(state)).toBe(valueBefore);
    expect(quarterOf(state).incidents).toEqual([]);
  });
});

describe('first decision wins', () => {
  it('rejects a second merge with PR_NOT_OPEN, naming the player who merged first', () => {
    const first = expectApplied(
      applyIntent(
        gameWith([serverPr('c1', null)]),
        SARA.id,
        { t: 'merge', prId: 'c1' },
        NOW,
        rng(),
      ),
    );
    const second = expectRejected(
      applyIntent(first.state, JOE.id, { t: 'merge', prId: 'c1' }, NOW + 500, rng()),
    );

    expect(second.code).toBe('PR_NOT_OPEN');
    expect(second.message).toBe('Already merged by Sara');
  });

  it('rejects a decline after a merge with the first decider named', () => {
    const first = expectApplied(
      applyIntent(
        gameWith([serverPr('b1', 'money')]),
        SARA.id,
        { t: 'merge', prId: 'b1' },
        NOW,
        rng(),
      ),
    );
    const second = expectRejected(
      applyIntent(
        first.state,
        JOE.id,
        { t: 'decline', prId: 'b1', bugType: 'money' },
        NOW + 500,
        rng(),
      ),
    );

    expect(second.code).toBe('PR_NOT_OPEN');
    expect(second.message).toBe('Already merged by Sara');
  });

  it('rejects a merge after a decline with the first decider named', () => {
    const first = expectApplied(
      applyIntent(
        gameWith([serverPr('c1', null)]),
        JOE.id,
        { t: 'decline', prId: 'c1', bugType: 'security' },
        NOW,
        rng(),
      ),
    );
    const second = expectRejected(
      applyIntent(first.state, SARA.id, { t: 'merge', prId: 'c1' }, NOW + 500, rng()),
    );

    expect(second.code).toBe('PR_NOT_OPEN');
    expect(second.message).toBe('Already declined by Joe');
  });

  it('a rejected second decision changes nothing: no double bonus, no second incident', () => {
    const first = expectApplied(
      applyIntent(
        gameWith([serverPr('b1', 'money')]),
        SARA.id,
        { t: 'decline', prId: 'b1', bugType: 'money' },
        NOW,
        rng(),
      ),
    );
    const valueAfterFirst = valueOf(first.state);

    const second = applyIntent(
      first.state,
      JOE.id,
      { t: 'decline', prId: 'b1', bugType: 'money' },
      NOW + 500,
      rng(),
    );

    expect(second.ok).toBe(false);
    expect(valueOf(first.state)).toBe(valueAfterFirst);
    expect(quarterOf(first.state).incidents).toEqual([]);
  });

  it('names an auto-merge as an automatic merge when no player merged it', () => {
    const autoMerged = serverPr('c1', null, {
      status: 'merged',
      resolution: { kind: 'merged', by: null, byName: null, at: NOW - 1 },
    });
    const result = expectRejected(
      applyIntent(gameWith([autoMerged]), SARA.id, { t: 'merge', prId: 'c1' }, NOW, rng()),
    );

    expect(result.code).toBe('PR_NOT_OPEN');
    expect(result.message).toBe('Already merged automatically');
  });

  it('rejects a decision on an unknown PR with PR_NOT_FOUND', () => {
    const result = expectRejected(
      applyIntent(gameWith([]), SARA.id, { t: 'merge', prId: 'nope' }, NOW, rng()),
    );

    expect(result.code).toBe('PR_NOT_FOUND');
  });

  it('rejects a decision on a PR that has not spawned yet with PR_NOT_FOUND', () => {
    const state = gameWith([]);
    const quarter = quarterOf(state);
    const withUpcoming: GameState = {
      ...state,
      quarter: {
        ...quarter,
        upcoming: [{ pr: makePr('later', 'money'), spawnAt: NOW + 60_000 }],
      },
    };
    const result = expectRejected(
      applyIntent(withUpcoming, SARA.id, { t: 'merge', prId: 'later' }, NOW, rng()),
    );

    expect(result.code).toBe('PR_NOT_FOUND');
  });
});

describe('buggy merge schedules one incident', () => {
  it('adds one pending incident for the PR, due 4 to 12 s after the merge', () => {
    const result = expectApplied(
      applyIntent(
        gameWith([serverPr('b1', 'outage')]),
        SARA.id,
        { t: 'merge', prId: 'b1' },
        NOW,
        rng(),
      ),
    );
    const incidents = quarterOf(result.state).incidents;

    expect(incidents).toHaveLength(1);
    expect(incidents[0]?.prId).toBe('b1');
    const fireAt = incidents[0]?.fireAt ?? Number.NaN;
    expect(fireAt).toBeGreaterThanOrEqual(NOW + config.incidentDelayMs.min);
    expect(fireAt).toBeLessThanOrEqual(NOW + config.incidentDelayMs.max);
  });

  it('draws the delay from the RNG, so it spans the window across seeds and repeats for one seed', () => {
    const delayFor = (seed: number) => {
      const result = expectApplied(
        applyIntent(
          gameWith([serverPr('b1', 'money')]),
          SARA.id,
          { t: 'merge', prId: 'b1' },
          NOW,
          createRng(seed),
        ),
      );
      return (quarterOf(result.state).incidents[0]?.fireAt ?? NOW) - NOW;
    };

    const delays = Array.from({ length: 200 }, (_, seed) => delayFor(seed + 1));
    expect(Math.min(...delays)).toBeGreaterThanOrEqual(config.incidentDelayMs.min);
    expect(Math.max(...delays)).toBeLessThanOrEqual(config.incidentDelayMs.max);
    expect(new Set(delays).size).toBeGreaterThan(50);
    expect(delayFor(99)).toBe(delayFor(99));
  });

  it('keeps incidents already pending from earlier merges', () => {
    const state = gameWith([serverPr('b1', 'money'), serverPr('b2', 'security')]);
    const first = expectApplied(
      applyIntent(state, SARA.id, { t: 'merge', prId: 'b1' }, NOW, rng()),
    );
    const second = expectApplied(
      applyIntent(first.state, JOE.id, { t: 'merge', prId: 'b2' }, NOW + 1_000, rng()),
    );

    expect(quarterOf(second.state).incidents.map((i) => i.prId)).toEqual(['b1', 'b2']);
  });

  it('a clean merge schedules no incident', () => {
    const result = expectApplied(
      applyIntent(
        gameWith([serverPr('c1', null)]),
        SARA.id,
        { t: 'merge', prId: 'c1' },
        NOW,
        rng(),
      ),
    );

    expect(quarterOf(result.state).incidents).toEqual([]);
  });
});

describe('open is presence only', () => {
  it('adds the player to the viewers and changes nothing else', () => {
    const state = gameWith([serverPr('b1', 'money')]);
    const result = expectApplied(
      applyIntent(state, SARA.id, { t: 'open', prId: 'b1' }, NOW, rng()),
    );

    expect(serverPrOf(result.state, 'b1').viewers).toEqual([SARA.id]);
    expect(serverPrOf(result.state, 'b1').status).toBe('open');
    expect(valueOf(result.state)).toBe(config.startingValue);
    expect(quarterOf(result.state).incidents).toEqual([]);
    expect(result.events).toEqual([]);
  });

  it('does not repeat a viewer who opens the PR twice', () => {
    const first = expectApplied(
      applyIntent(
        gameWith([serverPr('b1', 'money')]),
        SARA.id,
        { t: 'open', prId: 'b1' },
        NOW,
        rng(),
      ),
    );
    const second = expectApplied(
      applyIntent(first.state, SARA.id, { t: 'open', prId: 'b1' }, NOW + 1, rng()),
    );

    expect(serverPrOf(second.state, 'b1').viewers).toEqual([SARA.id]);
  });

  it('does not lock the PR: another player can still decide it after it is opened', () => {
    const opened = expectApplied(
      applyIntent(gameWith([serverPr('c1', null)]), SARA.id, { t: 'open', prId: 'c1' }, NOW, rng()),
    );
    const merged = expectApplied(
      applyIntent(opened.state, JOE.id, { t: 'merge', prId: 'c1' }, NOW + 1, rng()),
    );

    expect(serverPrOf(merged.state, 'c1').resolution).toMatchObject({ byName: 'Joe' });
  });

  it('opening a PR that is already resolved is a harmless no-op, not an error', () => {
    const merged = expectApplied(
      applyIntent(
        gameWith([serverPr('c1', null)]),
        SARA.id,
        { t: 'merge', prId: 'c1' },
        NOW,
        rng(),
      ),
    );
    const opened = expectApplied(
      applyIntent(merged.state, JOE.id, { t: 'open', prId: 'c1' }, NOW + 1, rng()),
    );

    expect(opened.events).toEqual([]);
    expect(serverPrOf(opened.state, 'c1').status).toBe('merged');
  });
});

describe('guards', () => {
  it('rejects a player who is not in the room with NOT_IN_ROOM', () => {
    const result = expectRejected(
      applyIntent(
        gameWith([serverPr('c1', null)]),
        'p-stranger',
        { t: 'merge', prId: 'c1' },
        NOW,
        rng(),
      ),
    );

    expect(result.code).toBe('NOT_IN_ROOM');
  });

  it('rejects decisions in the lobby with WRONG_PHASE', () => {
    const lobby = gameWith([serverPr('c1', null)], { phase: 'lobby', quarter: null });
    const result = expectRejected(
      applyIntent(lobby, SARA.id, { t: 'merge', prId: 'c1' }, NOW, rng()),
    );

    expect(result.code).toBe('WRONG_PHASE');
  });

  it('rejects decisions once the quarter has ended with WRONG_PHASE', () => {
    const ended = gameWith([serverPr('c1', null)], { phase: 'ended' });
    const result = expectRejected(
      applyIntent(ended, SARA.id, { t: 'merge', prId: 'c1' }, NOW, rng()),
    );

    expect(result.code).toBe('WRONG_PHASE');
  });

  it('rejects a decision at or after the quarter end time, before the tick closes the quarter', () => {
    const state = gameWith([serverPr('c1', null, { expiresAt: NOW + 600_000 })]);
    const endsAt = quarterOf(state).endsAt;

    const atEnd = expectRejected(
      applyIntent(state, SARA.id, { t: 'merge', prId: 'c1' }, endsAt, rng()),
    );
    expect(atEnd.code).toBe('WRONG_PHASE');

    const justBefore = applyIntent(state, SARA.id, { t: 'merge', prId: 'c1' }, endsAt - 1, rng());
    expect(justBefore.ok).toBe(true);
  });
});

describe('the 90 s timer beats a late decision', () => {
  it('rejects a merge or decline at or after expiresAt, even before the tick has auto-merged it', () => {
    const state = gameWith([serverPr('b1', 'money')]);
    const expiresAt = serverPrOf(state, 'b1').expiresAt;

    const merge = expectRejected(
      applyIntent(state, SARA.id, { t: 'merge', prId: 'b1' }, expiresAt, rng()),
    );
    expect(merge.code).toBe('PR_NOT_OPEN');
    const decline = expectRejected(
      applyIntent(state, SARA.id, { t: 'decline', prId: 'b1', bugType: 'money' }, expiresAt, rng()),
    );
    expect(decline.code).toBe('PR_NOT_OPEN');
    expect(applyIntent(state, SARA.id, { t: 'merge', prId: 'b1' }, expiresAt - 1, rng()).ok).toBe(
      true,
    );
  });

  it('the tick then auto-merges it as nobody reviewed it, so a late click cannot take the credit', () => {
    const state = gameWith([serverPr('b1', 'money')]);
    const expiresAt = serverPrOf(state, 'b1').expiresAt;
    expectRejected(applyIntent(state, SARA.id, { t: 'merge', prId: 'b1' }, expiresAt, rng()));

    const ticked = tick(state, expiresAt, rng());
    expect(serverPrOf(ticked.state, 'b1').resolution).toMatchObject({ kind: 'merged', by: null });
  });
});

describe('decline validation', () => {
  it('rejects a decline whose bug type is not money, security or outage, changing nothing', () => {
    const state = gameWith([serverPr('b1', 'money')]);
    const bad = { t: 'decline', prId: 'b1', bugType: 'typo' } as unknown as Intent;
    const result = expectRejected(applyIntent(state, SARA.id, bad, NOW, rng()));

    expect(result.code).toBe('BAD_MESSAGE');
    expect(serverPrOf(state, 'b1').status).toBe('open');
  });
});

describe('presence follows the player', () => {
  it('opening a second PR moves the 👀 off the first one', () => {
    const state = gameWith([serverPr('a1', null), serverPr('b1', null)]);
    const first = expectApplied(applyIntent(state, SARA.id, { t: 'open', prId: 'a1' }, NOW, rng()));
    const joe = expectApplied(
      applyIntent(first.state, JOE.id, { t: 'open', prId: 'a1' }, NOW + 1, rng()),
    );
    const second = expectApplied(
      applyIntent(joe.state, SARA.id, { t: 'open', prId: 'b1' }, NOW + 2, rng()),
    );

    expect(serverPrOf(second.state, 'a1').viewers).toEqual([JOE.id]);
    expect(serverPrOf(second.state, 'b1').viewers).toEqual([SARA.id]);
  });
});

describe('joining mid-quarter', () => {
  it('a player added to the room after the quarter started can decide a PR straight away', () => {
    const state = gameWith([serverPr('c1', null)]);
    const late: ServerPlayer = {
      id: 'p-late',
      name: 'Late',
      joinedAt: NOW + 30_000,
      connected: true,
    };
    const joined: GameState = { ...state, players: [...state.players, late] };

    const result = expectApplied(
      applyIntent(joined, late.id, { t: 'merge', prId: 'c1' }, NOW + 31_000, rng()),
    );
    expect(serverPrOf(result.state, 'c1').resolution).toMatchObject({ byName: 'Late' });
  });
});

describe('comment events', () => {
  it('emits a small comment event with no text, for a line and for the whole PR', () => {
    const state = gameWith([serverPr('c1', null)]);
    const line = expectApplied(
      applyIntent(
        state,
        SARA.id,
        { t: 'comment', prId: 'c1', line: 1, text: 'secret words' },
        NOW,
        rng(),
      ),
    );
    expect(line.events).toEqual([
      {
        kind: 'comment',
        prId: 'c1',
        prTitle: 'PR c1',
        by: SARA.id,
        byName: 'Sara',
        onLine: true,
        at: NOW,
      },
    ]);
    const whole = expectApplied(
      applyIntent(
        state,
        SARA.id,
        { t: 'comment', prId: 'c1', line: null, text: 'hello' },
        NOW,
        rng(),
      ),
    );
    expect(whole.events).toMatchObject([{ kind: 'comment', onLine: false }]);
    expect(JSON.stringify(whole.events)).not.toContain('hello');
  });

  it('emits no event for a rejected comment', () => {
    const state = gameWith([serverPr('c1', null)]);
    const result = applyIntent(
      state,
      SARA.id,
      { t: 'comment', prId: 'c1', line: null, text: '  ' },
      NOW,
      rng(),
    );
    expect(result.ok).toBe(false);
  });
});
