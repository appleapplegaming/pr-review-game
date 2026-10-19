import { describe, expect, it } from 'vitest';
import type { Bug, BugType, GameEvent, PullRequest, Severity } from '../../shared/types';
import { config } from '../../shared/config';
import { computeUptime, formatUptime } from '../../shared/money';
import { createRng } from '../../server/engine/rng';
import { tick } from '../../server/engine/tick';
import {
  defaultTiming,
  type GameState,
  type PendingIncident,
  type Quarter,
  type ScheduledPr,
  type ServerPlayer,
  type ServerPr,
} from '../../server/engine/state';

// A fake clock and a seeded RNG: the engine reads neither the wall clock nor Math.random().
const NOW = 1_700_000_000_000;
const END = NOW + config.quarterMs;
const FEATURE_VALUE = 800_000;
const PR_TIMER = config.prTimerMs;

const SARA: ServerPlayer = { id: 'p-sara', name: 'Sara', joinedAt: NOW, connected: true };
const JOE: ServerPlayer = { id: 'p-joe', name: 'Joe', joinedAt: NOW, connected: true };

function makePr(id: string, bugType: BugType | null, severity: Severity = 'minor'): PullRequest {
  const bug: Bug | null =
    bugType === null
      ? null
      : {
          type: bugType,
          severity,
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

/** A spawned PR. Open by default, with the 90 s timer running from spawnAt. */
function serverPr(
  id: string,
  bugType: BugType | null,
  overrides: Partial<ServerPr> & { severity?: Severity; spawnAt?: number } = {},
): ServerPr {
  const { severity, spawnAt = NOW, ...rest } = overrides;
  return {
    pr: makePr(id, bugType, severity),
    spawnAt,
    expiresAt: spawnAt + PR_TIMER,
    status: 'open',
    resolution: null,
    viewers: [],
    comments: [],
    pings: [],
    ...rest,
  };
}

function merged(pr: ServerPr, at: number): ServerPr {
  return {
    ...pr,
    status: 'merged',
    resolution: { kind: 'merged', by: SARA.id, byName: SARA.name, at },
  };
}

function gameWith(
  prs: ServerPr[],
  overrides: {
    upcoming?: ScheduledPr[];
    incidents?: PendingIncident[];
    value?: number;
    downtimeMinutes?: number;
    breaches?: number;
  } = {},
): GameState {
  const quarter: Quarter = {
    timing: defaultTiming(),
    startedAt: NOW,
    endsAt: END,
    upcoming: overrides.upcoming ?? [],
    prs: new Map(prs.map((p) => [p.pr.id, p])),
    incidents: overrides.incidents ?? [],
    metrics: {
      value: overrides.value ?? config.startingValue,
      downtimeMinutes: overrides.downtimeMinutes ?? 0,
      breaches: overrides.breaches ?? 0,
    },
    bankrupt: false,
    nextId: 1,
  };
  return {
    code: 'ABCD',
    companyName: 'Acme',
    hostId: SARA.id,
    players: [SARA, JOE],
    phase: 'playing',
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

function incidentEvents(events: GameEvent[]): Extract<GameEvent, { kind: 'incident' }>[] {
  return events.filter((e): e is Extract<GameEvent, { kind: 'incident' }> => e.kind === 'incident');
}

// A still-open clean PR that keeps the quarter running through a test.
const KEEP_OPEN = (): ServerPr => serverPr('keep', null, { spawnAt: NOW + 1_000 });

describe('spawns', () => {
  it('a scheduled PR spawns at its spawnAt, open, with its 90 s timer from that moment', () => {
    const spawnAt = NOW + 10_000;
    const state = gameWith([KEEP_OPEN()], {
      upcoming: [{ pr: makePr('u1', null), spawnAt }],
    });

    const early = tick(state, spawnAt - 1, rng()).state;
    expect(quarterOf(early).prs.has('u1')).toBe(false);
    expect(quarterOf(early).upcoming).toHaveLength(1);

    const onTime = tick(state, spawnAt, rng()).state;
    const spawned = serverPrOf(onTime, 'u1');
    expect(spawned.status).toBe('open');
    expect(spawned.spawnAt).toBe(spawnAt);
    expect(spawned.expiresAt).toBe(spawnAt + PR_TIMER);
    expect(quarterOf(onTime).upcoming).toHaveLength(0);
  });
});

describe('auto-merge', () => {
  it('auto-merges at exactly 90 s, recorded as nobody reviewed it', () => {
    const state = gameWith([serverPr('c1', null), KEEP_OPEN()]);

    const before = tick(state, NOW + PR_TIMER - 1, rng());
    expect(serverPrOf(before.state, 'c1').status).toBe('open');
    expect(before.events).toEqual([]);

    const at = tick(state, NOW + PR_TIMER, rng());
    const pr = serverPrOf(at.state, 'c1');
    expect(pr.status).toBe('merged');
    expect(pr.resolution).toEqual({ kind: 'merged', by: null, byName: null, at: NOW + PR_TIMER });
    expect(quarterOf(at.state).metrics.value).toBe(config.startingValue + FEATURE_VALUE);
    expect(at.events).toEqual([
      {
        kind: 'merge',
        prId: 'c1',
        prTitle: 'PR c1',
        by: null,
        byName: null,
        at: NOW + PR_TIMER,
      },
    ]);
  });

  it('a buggy auto-merge schedules its incident 4 to 12 s after the merge', () => {
    const state = gameWith([serverPr('b1', 'money'), KEEP_OPEN()]);

    const result = tick(state, NOW + PR_TIMER, rng());
    const incidents = quarterOf(result.state).incidents;

    expect(incidents).toHaveLength(1);
    expect(incidents[0]?.prId).toBe('b1');
    expect(incidents[0]?.fireAt).toBeGreaterThanOrEqual(NOW + PR_TIMER + 4_000);
    expect(incidents[0]?.fireAt).toBeLessThanOrEqual(NOW + PR_TIMER + 12_000);
    expect(incidentEvents(result.events)).toEqual([]);
  });

  it('a late tick still auto-merges at the PR expiry time, not at the tick time', () => {
    const state = gameWith([serverPr('c1', null), KEEP_OPEN()]);

    const result = tick(state, NOW + PR_TIMER + 5_000, rng());

    expect(serverPrOf(result.state, 'c1').resolution).toEqual({
      kind: 'merged',
      by: null,
      byName: null,
      at: NOW + PR_TIMER,
    });
  });
});

describe('incidents fire at their time', () => {
  it.each<{
    type: BugType;
    severity: Severity;
    valueLoss: number;
    downtime: number;
    breach: number;
  }>([
    { type: 'outage', severity: 'minor', valueLoss: 20_000, downtime: 30, breach: 0 },
    { type: 'outage', severity: 'major', valueLoss: 160_000, downtime: 240, breach: 0 },
    { type: 'outage', severity: 'critical', valueLoss: 960_000, downtime: 1440, breach: 0 },
    { type: 'money', severity: 'minor', valueLoss: 500_000, downtime: 0, breach: 0 },
    { type: 'money', severity: 'major', valueLoss: 2_000_000, downtime: 0, breach: 0 },
    { type: 'money', severity: 'critical', valueLoss: 5_000_000, downtime: 0, breach: 0 },
    { type: 'security', severity: 'minor', valueLoss: 1_000_000, downtime: 0, breach: 1 },
    { type: 'security', severity: 'major', valueLoss: 3_000_000, downtime: 0, breach: 1 },
    { type: 'security', severity: 'critical', valueLoss: 8_000_000, downtime: 0, breach: 1 },
  ])('$type $severity fires its effect and its text', (cell) => {
    const fireAt = NOW + 5_000;
    const bugPr = merged(serverPr('b1', cell.type, { severity: cell.severity }), NOW);
    const state = gameWith([bugPr, KEEP_OPEN()], {
      incidents: [{ prId: 'b1', fireAt }],
    });

    const result = tick(state, fireAt, rng());
    const metrics = quarterOf(result.state).metrics;

    expect(metrics.value).toBe(config.startingValue - cell.valueLoss);
    expect(metrics.downtimeMinutes).toBe(cell.downtime);
    expect(metrics.breaches).toBe(cell.breach);
    expect(quarterOf(result.state).incidents).toEqual([]);
    expect(incidentEvents(result.events)).toEqual([
      { kind: 'incident', bugType: cell.type, text: 'Incident for b1.', at: fireAt },
    ]);
  });

  it('does not fire an incident before its fireAt', () => {
    const fireAt = NOW + 5_000;
    const state = gameWith([merged(serverPr('b1', 'money'), NOW), KEEP_OPEN()], {
      incidents: [{ prId: 'b1', fireAt }],
    });

    const result = tick(state, fireAt - 1, rng());

    expect(quarterOf(result.state).metrics.value).toBe(config.startingValue);
    expect(quarterOf(result.state).incidents).toHaveLength(1);
    expect(result.events).toEqual([]);
  });

  it('incidents fire in fireAt order even when they were queued out of order', () => {
    const state = gameWith(
      [
        merged(serverPr('late', 'money'), NOW),
        merged(serverPr('early', 'money'), NOW),
        KEEP_OPEN(),
      ],
      {
        incidents: [
          { prId: 'late', fireAt: NOW + 8_000 },
          { prId: 'early', fireAt: NOW + 3_000 },
        ],
      },
    );

    const result = tick(state, NOW + 9_000, rng());

    expect(incidentEvents(result.events).map((e) => e.text)).toEqual([
      'Incident for early.',
      'Incident for late.',
    ]);
  });

  it('a late tick fires the due incidents at their own fireAt times, in order', () => {
    const state = gameWith(
      [
        merged(serverPr('late', 'outage'), NOW),
        merged(serverPr('early', 'money'), NOW),
        KEEP_OPEN(),
      ],
      {
        incidents: [
          { prId: 'late', fireAt: NOW + 8_000 },
          { prId: 'early', fireAt: NOW + 3_000 },
        ],
      },
    );

    const result = tick(state, NOW + 9_000, rng());

    expect(incidentEvents(result.events).map((e) => [e.text, e.at])).toEqual([
      ['Incident for early.', NOW + 3_000],
      ['Incident for late.', NOW + 8_000],
    ]);
  });

  it('uptime: 4 h of outage gives 99.815%', () => {
    const state = gameWith(
      [merged(serverPr('b1', 'outage', { severity: 'major' }), NOW), KEEP_OPEN()],
      {
        incidents: [{ prId: 'b1', fireAt: NOW + 5_000 }],
      },
    );

    const result = tick(state, NOW + 5_000, rng());
    const downtime = quarterOf(result.state).metrics.downtimeMinutes;

    expect(downtime).toBe(240);
    expect(formatUptime(computeUptime(downtime))).toBe('99.815%');
  });
});

describe('the quarter ends', () => {
  it('at time-up: open PRs auto-merge and pending incidents fire at once, in order', () => {
    // Both PRs run past the end of the quarter, so they are still open when it ends.
    const openClean = serverPr('c1', null, { expiresAt: END + 60_000 });
    const openBuggy = serverPr('b1', 'money', { expiresAt: END + 60_000, spawnAt: NOW + 1_000 });
    const state = gameWith([openClean, openBuggy]);

    const result = tick(state, END, rng());
    const q = quarterOf(result.state);

    expect(result.state.phase).toBe('ended');
    expect(serverPrOf(result.state, 'c1').resolution).toMatchObject({ by: null, at: END });
    expect(serverPrOf(result.state, 'b1').resolution).toMatchObject({ by: null, at: END });
    expect(q.incidents).toEqual([]);
    expect(incidentEvents(result.events)).toEqual([
      { kind: 'incident', bugType: 'money', text: 'Incident for b1.', at: END },
    ]);
    expect(q.metrics.value).toBe(config.startingValue + 2 * FEATURE_VALUE - 500_000);
  });

  it('time-up is measured against endsAt even if the tick arrives late', () => {
    const openClean = serverPr('c1', null, { expiresAt: END + 10_000 });
    const state = gameWith([openClean]);

    const result = tick(state, END + 30_000, rng());

    expect(result.state.phase).toBe('ended');
    expect(serverPrOf(result.state, 'c1').resolution).toMatchObject({ by: null, at: END });
  });

  it('early: once every PR is resolved, the quarter ends and pending incidents fire at once', () => {
    const now = NOW + 100_000;
    const state = gameWith([merged(serverPr('b1', 'money'), now - 1_000)], {
      incidents: [{ prId: 'b1', fireAt: now + 8_000 }],
    });

    const result = tick(state, now, rng());

    expect(result.state.phase).toBe('ended');
    expect(quarterOf(result.state).incidents).toEqual([]);
    expect(incidentEvents(result.events)).toEqual([
      { kind: 'incident', bugType: 'money', text: 'Incident for b1.', at: now },
    ]);
  });

  it('early: does not end while a PR is still due to spawn', () => {
    const now = NOW + 100_000;
    const state = gameWith([merged(serverPr('c1', null), now - 1_000)], {
      upcoming: [{ pr: makePr('u1', null), spawnAt: now + 50_000 }],
    });

    const result = tick(state, now, rng());

    expect(result.state.phase).toBe('playing');
  });

  it('bankruptcy: value floors at $0, the quarter ends at once and the flag is set', () => {
    const state = gameWith(
      [merged(serverPr('b1', 'money', { severity: 'critical' }), NOW), KEEP_OPEN()],
      {
        value: 1_000_000,
        incidents: [{ prId: 'b1', fireAt: NOW + 5_000 }],
      },
    );

    const result = tick(state, NOW + 5_000, rng());
    const q = quarterOf(result.state);

    expect(result.state.phase).toBe('ended');
    expect(q.bankrupt).toBe(true);
    expect(q.metrics.value).toBe(0);
  });

  it('bankruptcy stops the timeline: a later auto-merge does not happen', () => {
    const state = gameWith(
      [
        merged(serverPr('b1', 'money', { severity: 'critical' }), NOW),
        serverPr('c1', null, { expiresAt: NOW + 20_000 }),
      ],
      {
        value: 1_000_000,
        incidents: [{ prId: 'b1', fireAt: NOW + 5_000 }],
      },
    );

    const result = tick(state, NOW + 30_000, rng());

    expect(quarterOf(result.state).bankrupt).toBe(true);
    expect(serverPrOf(result.state, 'c1').status).toBe('open');
    expect(quarterOf(result.state).metrics.value).toBe(0);
  });

  it('bankruptcy still fires incidents that were already owed, so the postmortem has them', () => {
    const state = gameWith(
      [
        merged(serverPr('b1', 'money', { severity: 'critical' }), NOW),
        merged(serverPr('b2', 'security', { severity: 'minor' }), NOW),
      ],
      {
        value: 1_000_000,
        incidents: [
          { prId: 'b1', fireAt: NOW + 5_000 },
          { prId: 'b2', fireAt: NOW + 50_000 },
        ],
      },
    );

    const result = tick(state, NOW + 5_000, rng());

    expect(quarterOf(result.state).metrics.breaches).toBe(1);
    expect(incidentEvents(result.events).map((e) => e.text)).toEqual([
      'Incident for b1.',
      'Incident for b2.',
    ]);
  });

  it('value never drops below 0 across several incidents', () => {
    const state = gameWith(
      [
        merged(serverPr('b1', 'security', { severity: 'critical' }), NOW),
        merged(serverPr('b2', 'money', { severity: 'critical' }), NOW),
      ],
      {
        value: 2_000_000,
        incidents: [
          { prId: 'b1', fireAt: NOW + 5_000 },
          { prId: 'b2', fireAt: NOW + 6_000 },
        ],
      },
    );

    const result = tick(state, NOW + 6_000, rng());

    expect(quarterOf(result.state).metrics.value).toBe(0);
  });

  it('a quarter that has ended is left alone', () => {
    const state = gameWith([serverPr('c1', null)]);
    const ended: GameState = { ...state, phase: 'ended' };

    const result = tick(ended, NOW + PR_TIMER, rng());

    expect(result.state).toBe(ended);
    expect(result.events).toEqual([]);
  });
});
