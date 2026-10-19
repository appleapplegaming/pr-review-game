import { describe, expect, expectTypeOf, it } from 'vitest';
import type {
  Bug,
  BugType,
  Comment,
  PublicPr,
  PublicRoomState,
  PullRequest,
  Severity,
} from '../../shared/types';
import { config } from '../../shared/config';
import { computeUptime } from '../../shared/money';
import {
  defaultTiming,
  type GameState,
  type Quarter,
  type ServerPlayer,
  type ServerPr,
  type ScheduledPr,
} from '../../server/engine/state';
import { toPublicState } from '../../server/engine/projection';

// The answer-key boundary. Every test here treats the public state as something a player could
// read, so the bug fields must be absent from every value, not only from the expected keys.

const NOW = 1_700_000_000_000;
const FEATURE_VALUE = 800_000;

const SARA: ServerPlayer = { id: 'p-sara', name: 'Sara', joinedAt: NOW, connected: true };
const JOE: ServerPlayer = { id: 'p-joe', name: 'Joe', joinedAt: NOW + 1, connected: false };

/** Incident and explanation text is distinctive, so a leak is easy to find in any string. */
function makeBug(id: string, type: BugType, severity: Severity = 'major'): Bug {
  return {
    type,
    severity,
    lines: [7, 8],
    explanation: `SECRET-EXPLANATION-${id}`,
    incident: `SECRET-INCIDENT-${id}`,
  };
}

function makePr(id: string, bugType: BugType | null): PullRequest {
  return {
    id,
    title: `Title ${id}`,
    author: 'test.user',
    area: 'payments',
    description: `Description ${id}.`,
    language: 'ts',
    diff: '@@ a.ts @@\n const a = 1;\n const b = 2;',
    featureValue: FEATURE_VALUE,
    bug: bugType === null ? null : makeBug(id, bugType),
  };
}

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

function quarterWith(
  prs: ServerPr[],
  upcoming: ScheduledPr[] = [],
  extra: Partial<Quarter> = {},
): Quarter {
  return {
    timing: defaultTiming(),
    startedAt: NOW,
    endsAt: NOW + config.quarterMs,
    upcoming,
    prs: new Map(prs.map((p) => [p.pr.id, p])),
    incidents: [],
    metrics: { value: 5_000_000, downtimeMinutes: 240, breaches: 1 },
    bankrupt: false,
    nextId: 1,
    ...extra,
  };
}

function gameWith(quarter: Quarter | null, phase: GameState['phase'] = 'playing'): GameState {
  return {
    code: 'ABCD',
    companyName: 'Acme',
    hostId: SARA.id,
    players: [SARA, JOE],
    phase,
    quarter,
  };
}

/** Every key and every string value reachable from `value`, including inside arrays and objects. */
function walk(
  value: unknown,
  visit: (key: string | null, leaf: unknown) => void,
  key: string | null = null,
): void {
  visit(key, value);
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit, null);
  } else if (value !== null && typeof value === 'object') {
    for (const [childKey, child] of Object.entries(value)) walk(child, visit, childKey);
  }
}

/** A state with every kind of buggy PR: open, merged by a player, auto-merged, and declined. */
function buggyState(): GameState {
  const openBuggy = serverPr('open-money', 'money');
  const mergedBuggy = serverPr('merged-security', 'security', {
    status: 'merged',
    resolution: { kind: 'merged', by: SARA.id, byName: SARA.name, at: NOW + 5_000 },
  });
  const autoBuggy = serverPr('auto-outage', 'outage', {
    status: 'merged',
    resolution: { kind: 'merged', by: null, byName: null, at: NOW + 90_000 },
  });
  const declinedBuggy = serverPr('declined-money', 'money', {
    status: 'declined',
    resolution: {
      kind: 'declined',
      by: JOE.id,
      byName: JOE.name,
      at: NOW + 7_000,
      bugType: 'money',
    },
  });
  const cleanOpen = serverPr('clean-open', null);
  return gameWith(quarterWith([openBuggy, mergedBuggy, autoBuggy, declinedBuggy, cleanOpen]));
}

describe('toPublicState: the answer key never reaches the public state', () => {
  it('a deep scan of a state full of buggy PRs finds no bug fields and no incident or explanation text', () => {
    const out = toPublicState(buggyState());

    const forbiddenKeys = new Set([
      'bug',
      'lines',
      'explanation',
      'severity',
      'incident',
      'incidents',
    ]);
    const leaked: string[] = [];
    walk(out, (key, leaf) => {
      if (key !== null && forbiddenKeys.has(key)) leaked.push(`key ${key}`);
      if (typeof leaf === 'string' && /SECRET-/.test(leaf)) leaked.push(`text ${leaf}`);
    });

    expect(leaked).toEqual([]);
    // The scan must have seen the PRs, or it proves nothing.
    expect(out.prs).toHaveLength(5);
  });

  it('a PR that has not spawned yet does not appear, and its id is not in the output at all', () => {
    const upcomingPr = serverPr('future-money', 'money');
    const scheduled: ScheduledPr = { pr: upcomingPr.pr, spawnAt: NOW + 60_000 };
    const out = toPublicState(gameWith(quarterWith([serverPr('spawned', null)], [scheduled])));

    expect(out.prs.map((p) => p.id)).toEqual(['spawned']);
    expect(JSON.stringify(out)).not.toContain('future-money');
  });

  it('totalPrs counts the whole quarter, spawned and not yet spawned', () => {
    const scheduled: ScheduledPr = { pr: makePr('future', null), spawnAt: NOW + 60_000 };
    const out = toPublicState(gameWith(quarterWith([serverPr('spawned', null)], [scheduled])));

    expect(out.totalPrs).toBe(2);
  });

  it('the public PR type has no bug field, checked at the type level', () => {
    expectTypeOf<PublicPr>().not.toHaveProperty('bug');
    expectTypeOf(toPublicState).returns.toEqualTypeOf<PublicRoomState>();
  });

  it('a PR copied from the state has no bug key at runtime', () => {
    const [first] = toPublicState(buggyState()).prs;
    expect(first).toBeDefined();
    expect(Object.keys(first ?? {})).not.toContain('bug');
  });
});

describe('toPublicState: the output is plain, JSON-serializable data', () => {
  it('survives a JSON round trip unchanged', () => {
    const out = toPublicState(buggyState());
    expect(JSON.parse(JSON.stringify(out))).toEqual(out);
  });

  it('contains no Map or Set values', () => {
    const out = toPublicState(buggyState());
    walk(out, (_key, leaf) => {
      expect(leaf instanceof Map).toBe(false);
      expect(leaf instanceof Set).toBe(false);
    });
  });

  it('does not change the state it was given', () => {
    const state = buggyState();
    const before = structuredClone(state.quarter?.prs ? [...state.quarter.prs.entries()] : []);
    toPublicState(state);
    const after = structuredClone(state.quarter?.prs ? [...state.quarter.prs.entries()] : []);
    expect(after).toEqual(before);
  });
});

describe('toPublicState: what each PR shows', () => {
  it('maps status, decider, viewers and comments', () => {
    const comment: Comment = {
      id: 'c-1',
      prId: 'merged-security',
      playerId: JOE.id,
      playerName: JOE.name,
      line: 3,
      text: 'Looks off',
      at: NOW + 1_000,
    };
    const state = gameWith(
      quarterWith([
        serverPr('merged-security', 'security', {
          status: 'merged',
          resolution: { kind: 'merged', by: SARA.id, byName: SARA.name, at: NOW + 5_000 },
          viewers: [JOE.id],
          comments: [comment],
        }),
      ]),
    );
    const [pr] = toPublicState(state).prs;

    expect(pr).toMatchObject({
      id: 'merged-security',
      status: 'merged',
      resolution: { kind: 'merged', by: SARA.id, byName: SARA.name, at: NOW + 5_000 },
      viewers: [JOE.id],
      comments: [comment],
      featureValue: FEATURE_VALUE,
      spawnAt: NOW,
      expiresAt: NOW + config.prTimerMs,
    });
  });

  it('highlights only an open PR that has pings', () => {
    const ping = { prId: 'x', playerId: JOE.id, playerName: JOE.name, at: NOW };
    const state = gameWith(
      quarterWith([
        serverPr('pinged-open', null, { pings: [ping] }),
        serverPr('pinged-merged', null, {
          pings: [ping],
          status: 'merged',
          resolution: { kind: 'merged', by: SARA.id, byName: SARA.name, at: NOW + 1 },
        }),
        serverPr('quiet-open', null),
      ]),
    );
    const byId = new Map(toPublicState(state).prs.map((p) => [p.id, p]));

    expect(byId.get('pinged-open')?.highlighted).toBe(true);
    expect(byId.get('pinged-merged')?.highlighted).toBe(false);
    expect(byId.get('quiet-open')?.highlighted).toBe(false);
  });

  it('keeps a decline resolution with the type the player chose', () => {
    const state = gameWith(
      quarterWith([
        serverPr('declined', 'money', {
          status: 'declined',
          resolution: {
            kind: 'declined',
            by: JOE.id,
            byName: JOE.name,
            at: NOW + 7_000,
            bugType: 'security',
          },
        }),
      ]),
    );
    const [pr] = toPublicState(state).prs;

    expect(pr?.resolution).toEqual({
      kind: 'declined',
      by: JOE.id,
      byName: JOE.name,
      at: NOW + 7_000,
      bugType: 'security',
    });
  });

  it('gives an open PR a null resolution', () => {
    const [pr] = toPublicState(gameWith(quarterWith([serverPr('open', null)]))).prs;
    expect(pr?.resolution).toBeNull();
  });

  it('shows the PR queue in spawn order', () => {
    const state = gameWith(
      quarterWith([
        serverPr('first', null, { spawnAt: NOW }),
        serverPr('second', null, { spawnAt: NOW + 1 }),
      ]),
    );
    expect(toPublicState(state).prs.map((p) => p.id)).toEqual(['first', 'second']);
  });
});

describe('toPublicState: room, players and metrics', () => {
  it('computes uptime from downtime and copies value and breaches', () => {
    const out = toPublicState(gameWith(quarterWith([])));

    expect(out.metrics).toEqual({
      value: 5_000_000,
      downtimeMinutes: 240,
      uptime: computeUptime(240),
      breaches: 1,
    });
  });

  it('marks the host and copies connection state', () => {
    const out = toPublicState(gameWith(quarterWith([])));

    expect(out.players).toEqual([
      { id: SARA.id, name: SARA.name, isHost: true, connected: true, joinedAt: NOW },
      { id: JOE.id, name: JOE.name, isHost: false, connected: false, joinedAt: NOW + 1 },
    ]);
  });

  it('shows the quarter timing and bankruptcy', () => {
    const quarter = quarterWith([], [], { bankrupt: true });
    const out = toPublicState(gameWith(quarter));

    expect(out).toMatchObject({
      code: 'ABCD',
      companyName: 'Acme',
      phase: 'playing',
      hostId: SARA.id,
      startedAt: NOW,
      endsAt: NOW + config.quarterMs,
      bankrupt: true,
    });
  });

  it('in the lobby, shows the starting company with no quarter', () => {
    const state: GameState = { ...gameWith(null, 'lobby') };
    const out = toPublicState(state);

    expect(out).toMatchObject({
      phase: 'lobby',
      startedAt: null,
      endsAt: null,
      totalPrs: 0,
      prs: [],
      bankrupt: false,
    });
    expect(out.metrics).toEqual({
      value: config.startingValue,
      downtimeMinutes: 0,
      uptime: 1,
      breaches: 0,
    });
  });

  it('after the quarter ends, keeps the PRs and metrics for the postmortem', () => {
    const state = gameWith(quarterWith([serverPr('kept', null)]), 'ended');
    const out = toPublicState(state);

    expect(out.phase).toBe('ended');
    expect(out.prs.map((p) => p.id)).toEqual(['kept']);
  });
});
