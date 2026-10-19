import { describe, expect, it } from 'vitest';
import type {
  Bug,
  BugType,
  Comment,
  Ping,
  PullRequest,
  Resolution,
  Severity,
  SlippedEntry,
} from '../../shared/types';
import { config } from '../../shared/config';
import { computeUptime } from '../../shared/money';
import {
  defaultTiming,
  type GameState,
  type Quarter,
  type ServerPlayer,
  type ServerPr,
} from '../../server/engine/state';
import { badgeFor, compareSlipped, damageOf, postmortem } from '../../server/engine/postmortem';

// Postmortem report (SPEC.md → Postmortem). Each section and each badge threshold has a test.

const NOW = 1_700_000_000_000;
const MERGED_AT = NOW + 60_000;

const SARA: ServerPlayer = { id: 'p-sara', name: 'Sara', joinedAt: NOW, connected: true };
const TOM: ServerPlayer = { id: 'p-tom', name: 'Tom', joinedAt: NOW + 1, connected: true };
const JOE: ServerPlayer = { id: 'p-joe', name: 'Joe', joinedAt: NOW + 2, connected: false };

function bug(type: BugType, severity: Severity = 'minor', lines: number[] = [6]): Bug {
  return {
    type,
    severity,
    lines,
    explanation: `Explanation for ${type}/${severity}.`,
    incident: `Incident for ${type}/${severity}.`,
  };
}

function makePr(id: string, bugValue: Bug | null, featureValue = 800_000): PullRequest {
  return {
    id,
    title: `PR ${id}`,
    author: 'test.user',
    area: 'payments',
    description: `Description ${id}.`,
    language: 'ts',
    diff: '@@ a.ts @@\n const a = 1;\n const b = 2;',
    featureValue,
    bug: bugValue,
  };
}

function comment(
  id: string,
  prId: string,
  player: ServerPlayer,
  line: number | null,
  text: string,
): Comment {
  return { id, prId, playerId: player.id, playerName: player.name, line, text, at: NOW + 1_000 };
}

function ping(prId: string, player: ServerPlayer): Ping {
  return { prId, playerId: player.id, playerName: player.name, at: NOW + 2_000 };
}

/** A PR the team merged. `by` is null for an auto-merge. */
function merged(
  id: string,
  bugValue: Bug | null,
  by: ServerPlayer | null,
  extra: Partial<ServerPr> = {},
): ServerPr {
  const resolution: Resolution = {
    kind: 'merged',
    by: by?.id ?? null,
    byName: by?.name ?? null,
    at: MERGED_AT,
  };
  return {
    pr: makePr(id, bugValue),
    spawnAt: NOW,
    expiresAt: NOW + config.prTimerMs,
    status: 'merged',
    resolution,
    viewers: [],
    comments: [],
    pings: [],
    ...extra,
  };
}

/** A PR the player declined, choosing `chosen` as the bug type. */
function declined(
  id: string,
  bugValue: Bug | null,
  by: ServerPlayer,
  chosen: BugType,
  extra: Partial<ServerPr> = {},
  featureValue = 800_000,
): ServerPr {
  return {
    pr: makePr(id, bugValue, featureValue),
    spawnAt: NOW,
    expiresAt: NOW + config.prTimerMs,
    status: 'declined',
    resolution: { kind: 'declined', by: by.id, byName: by.name, at: MERGED_AT, bugType: chosen },
    viewers: [],
    comments: [],
    pings: [],
    ...extra,
  };
}

function openPr(id: string, bugValue: Bug | null): ServerPr {
  return {
    pr: makePr(id, bugValue),
    spawnAt: NOW,
    expiresAt: NOW + config.prTimerMs,
    status: 'open',
    resolution: null,
    viewers: [],
    comments: [],
    pings: [],
  };
}

function game(
  prs: ServerPr[],
  quarter: Partial<Quarter> = {},
  players = [SARA, TOM, JOE],
): GameState {
  const q: Quarter = {
    timing: defaultTiming(),
    startedAt: NOW,
    endsAt: NOW + config.quarterMs,
    upcoming: [],
    prs: new Map(prs.map((p) => [p.pr.id, p])),
    incidents: [],
    metrics: { value: config.startingValue, downtimeMinutes: 0, breaches: 0 },
    bankrupt: false,
    nextId: 1,
    ...quarter,
  };
  return {
    code: 'ABCD',
    companyName: 'Acme Corp',
    hostId: SARA.id,
    players,
    phase: 'ended',
    quarter: q,
  };
}

describe('badgeFor: thresholds and exact boundaries', () => {
  it('five nines at exactly 99.99% with 0 breaches', () => {
    expect(badgeFor(0.9999, 0)).toBe('five-nines');
  });

  it('just under 99.99% with 0 breaches drops to three nines', () => {
    expect(badgeFor(0.99989999, 0)).toBe('three-nines');
  });

  it('99.99% with 1 breach is three nines, because five nines allows no breaches', () => {
    expect(badgeFor(0.9999, 1)).toBe('three-nines');
  });

  it('99.99% with 2 breaches is business as usual', () => {
    expect(badgeFor(0.9999, 2)).toBe('business-as-usual');
  });

  it('three nines at exactly 99.9% with 1 breach', () => {
    expect(badgeFor(0.999, 1)).toBe('three-nines');
  });

  it('just under 99.9% drops to business as usual', () => {
    expect(badgeFor(0.99899999, 0)).toBe('business-as-usual');
  });

  it('three nines at 99.9% with 2 breaches is business as usual', () => {
    expect(badgeFor(0.999, 2)).toBe('business-as-usual');
  });

  it('business as usual at exactly 99% with any breach count', () => {
    expect(badgeFor(0.99, 0)).toBe('business-as-usual');
    expect(badgeFor(0.99, 5)).toBe('business-as-usual');
  });

  it('just under 99% is this is fine', () => {
    expect(badgeFor(0.98999999, 0)).toBe('this-is-fine');
  });

  it('0 uptime is this is fine', () => {
    expect(badgeFor(0, 0)).toBe('this-is-fine');
  });
});

describe('badgeFor: the same boundaries reached from downtime minutes', () => {
  // 129,600 minutes in the quarter, so 12 min is 99.9907%, 13 min is 99.9900% (just under 99.99%).
  const badgeAt = (downtimeMinutes: number, breaches: number) =>
    badgeFor(computeUptime(downtimeMinutes), breaches);

  it('12 minutes of downtime is five nines, 13 minutes is three nines', () => {
    expect(badgeAt(12, 0)).toBe('five-nines');
    expect(badgeAt(13, 0)).toBe('three-nines');
  });

  it('129 minutes is three nines, 130 minutes is business as usual', () => {
    expect(badgeAt(129, 0)).toBe('three-nines');
    expect(badgeAt(130, 0)).toBe('business-as-usual');
  });

  it('1,296 minutes is exactly 99%, 1,297 minutes is this is fine', () => {
    expect(badgeAt(1296, 0)).toBe('business-as-usual');
    expect(badgeAt(1297, 0)).toBe('this-is-fine');
  });
});

describe('damageOf: value lost per bug', () => {
  it('money and security use the table value', () => {
    expect(damageOf(bug('money', 'minor'))).toBe(config.money.minor);
    expect(damageOf(bug('money', 'critical'))).toBe(config.money.critical);
    expect(damageOf(bug('security', 'major'))).toBe(config.security.major);
  });

  it('outage counts downtime at the hourly rate', () => {
    expect(damageOf(bug('outage', 'minor'))).toBe(20_000); // 30 min at $40k/h
    expect(damageOf(bug('outage', 'major'))).toBe(160_000); // 4 h
    expect(damageOf(bug('outage', 'critical'))).toBe(960_000); // 24 h
  });
});

describe('compareSlipped: sort order', () => {
  function entry(damage: number, severity: Severity): SlippedEntry {
    return {
      pr: makePr('x', bug('money', severity)),
      bug: bug('money', severity),
      mergedBy: null,
      mergedByName: null,
      autoMerged: true,
      damage,
      downtimeMinutes: 0,
      comments: [],
      pings: [],
    };
  }

  it('puts more damage first', () => {
    expect(compareSlipped(entry(2_000_000, 'minor'), entry(500_000, 'critical'))).toBeLessThan(0);
  });

  it('breaks a damage tie with the higher severity first', () => {
    expect(compareSlipped(entry(1_000_000, 'critical'), entry(1_000_000, 'minor'))).toBeLessThan(0);
    expect(compareSlipped(entry(1_000_000, 'minor'), entry(1_000_000, 'critical'))).toBeGreaterThan(
      0,
    );
  });

  it('treats equal damage and severity as a tie', () => {
    expect(compareSlipped(entry(1_000_000, 'major'), entry(1_000_000, 'major'))).toBe(0);
  });
});

describe('postmortem: headline', () => {
  it('reports the final metrics, badge, bankruptcy flag and company name', () => {
    const state = game([], {
      metrics: { value: 4_200_000, downtimeMinutes: 30, breaches: 1 },
      bankrupt: false,
    });
    const report = postmortem(state);

    expect(report.companyName).toBe('Acme Corp');
    expect(report.finalMetrics).toEqual({
      value: 4_200_000,
      downtimeMinutes: 30,
      uptime: computeUptime(30),
      breaches: 1,
    });
    expect(report.badge).toBe('three-nines');
    expect(report.bankrupt).toBe(false);
  });

  it('flags bankruptcy and gives the this-is-fine badge at $0', () => {
    const state = game([], {
      metrics: { value: 0, downtimeMinutes: 1440, breaches: 0 },
      bankrupt: true,
    });
    const report = postmortem(state);

    expect(report.bankrupt).toBe(true);
    expect(report.finalMetrics.value).toBe(0);
    // 1,440 minutes of downtime is 98.889% uptime, below the 99% line.
    expect(report.badge).toBe('this-is-fine');
  });

  it('throws when there is no quarter to report on', () => {
    const lobby: GameState = {
      code: 'ABCD',
      companyName: 'Acme Corp',
      hostId: SARA.id,
      players: [SARA],
      phase: 'lobby',
      quarter: null,
    };
    expect(() => postmortem(lobby)).toThrow();
  });
});

describe('postmortem: what slipped through', () => {
  it('lists only buggy PRs that merged, not clean merges, declines or open PRs', () => {
    const state = game([
      merged('buggy-merged', bug('money'), TOM),
      merged('clean-merged', null, TOM),
      declined('buggy-declined', bug('money'), SARA, 'money'),
      openPr('buggy-open', bug('money')),
    ]);
    const report = postmortem(state);

    expect(report.slipped.map((s) => s.pr.id)).toEqual(['buggy-merged']);
  });

  it('sorts by damage, with outage downtime at the hourly rate', () => {
    const state = game([
      merged('money-minor', bug('money', 'minor'), TOM), // 500k
      merged('outage-critical', bug('outage', 'critical'), TOM), // 960k
      merged('security-major', bug('security', 'major'), JOE), // 3M
      merged('outage-minor', bug('outage', 'minor'), TOM), // 20k
    ]);
    const report = postmortem(state);

    expect(report.slipped.map((s) => s.pr.id)).toEqual([
      'security-major',
      'outage-critical',
      'money-minor',
      'outage-minor',
    ]);
    expect(report.slipped.map((s) => s.damage)).toEqual([3_000_000, 960_000, 500_000, 20_000]);
  });

  it('names the merger, and marks an auto-merge as nobody reviewing it', () => {
    const state = game([
      merged('by-tom', bug('money'), TOM),
      merged('auto', bug('security'), null),
    ]);
    const report = postmortem(state);
    const byTom = report.slipped.find((s) => s.pr.id === 'by-tom');
    const auto = report.slipped.find((s) => s.pr.id === 'auto');

    expect(byTom).toMatchObject({ mergedBy: TOM.id, mergedByName: 'Tom', autoMerged: false });
    expect(auto).toMatchObject({ mergedBy: null, mergedByName: null, autoMerged: true });
  });

  it('shows the comment thread and pings: "Sara flagged line 42, Tom merged it anyway"', () => {
    const prId = 'flagged';
    const flagged = merged(prId, bug('money', 'major', [42]), TOM, {
      comments: [
        comment('c-1', prId, SARA, 42, 'This looks wrong to me.'),
        comment('c-2', prId, TOM, null, 'Looks fine, merging.'),
      ],
      pings: [ping(prId, SARA)],
    });
    const report = postmortem(game([flagged]));
    const [entry] = report.slipped;

    expect(entry?.mergedByName).toBe('Tom');
    expect(entry?.comments).toEqual(flagged.comments);
    expect(entry?.comments[0]).toMatchObject({ playerName: 'Sara', line: 42 });
    expect(entry?.pings).toEqual([
      { prId, playerId: SARA.id, playerName: 'Sara', at: NOW + 2_000 },
    ]);
  });

  it('carries the diff, explanation, incident text and downtime for each entry', () => {
    const outage = merged('outage', bug('outage', 'major'), TOM);
    const [entry] = postmortem(game([outage])).slipped;

    expect(entry?.pr.diff).toBe(outage.pr.diff);
    expect(entry?.bug.explanation).toBe('Explanation for outage/major.');
    expect(entry?.bug.incident).toBe('Incident for outage/major.');
    expect(entry?.downtimeMinutes).toBe(240);
  });

  it('reports zero downtime for non-outage bugs', () => {
    const [entry] = postmortem(game([merged('money', bug('money', 'critical'), TOM)])).slipped;
    expect(entry?.downtimeMinutes).toBe(0);
  });
});

describe('postmortem: great catches, right call wrong reason and lost revenue', () => {
  it('lists declines with the correct type as great catches, with who made them', () => {
    const catchPr = declined('catch', bug('security'), SARA, 'security');
    const report = postmortem(game([catchPr]));

    expect(report.catches).toEqual([
      {
        pr: catchPr.pr,
        by: SARA.id,
        byName: 'Sara',
        bugType: 'security',
        comments: [],
        pings: [],
      },
    ]);
    expect(report.wrongReason).toEqual([]);
  });

  it('lists declines with the wrong type as right call, wrong reason', () => {
    const wrong = declined('wrong', bug('money'), JOE, 'outage');
    const report = postmortem(game([wrong]));

    expect(report.wrongReason).toHaveLength(1);
    expect(report.wrongReason[0]).toMatchObject({ by: JOE.id, byName: 'Joe', bugType: 'outage' });
    expect(report.catches).toEqual([]);
  });

  it('lists declined clean PRs as lost revenue, with the total of their feature value', () => {
    const lostA = declined('lost-a', null, JOE, 'money', {}, 500_000);
    const lostB = declined('lost-b', null, SARA, 'outage', {}, 1_200_000);
    const report = postmortem(game([lostA, lostB]));

    expect(report.lostRevenue.map((d) => [d.byName, d.bugType])).toEqual([
      ['Joe', null],
      ['Sara', null],
    ]);
    expect(report.lostRevenueTotal).toBe(1_700_000);
  });

  it('gives an empty section and zero total when nothing was declined', () => {
    const report = postmortem(game([merged('m', null, TOM)]));

    expect(report.catches).toEqual([]);
    expect(report.wrongReason).toEqual([]);
    expect(report.lostRevenue).toEqual([]);
    expect(report.lostRevenueTotal).toBe(0);
  });
});

describe('postmortem: team stats', () => {
  // Fixture. Totals: 2 manual merges, 3 declines, 2 comments, 1 catch, 1 miss.
  //   Tom merges the flagged money bug (a miss) and a clean PR.
  //   Sara declines an outage with the right type (catch) and a money bug with the wrong type.
  //   Joe declines a clean PR (lost revenue) and comments on Tom's clean merge.
  //   An auto-merged security bug belongs to nobody.
  //   An open PR belongs to nobody.
  function richGame(): GameState {
    const flaggedId = 'flagged';
    return game([
      merged(flaggedId, bug('money', 'minor', [42]), TOM, {
        comments: [comment('c-1', flaggedId, SARA, 42, 'Line 42 looks off.')],
        pings: [ping(flaggedId, SARA)],
      }),
      merged('clean-tom', null, TOM, {
        comments: [comment('c-2', 'clean-tom', JOE, null, 'Nice.')],
      }),
      declined('outage-catch', bug('outage', 'major'), SARA, 'outage'),
      declined('money-wrong', bug('money', 'major'), SARA, 'security'),
      declined('clean-lost', null, JOE, 'money'),
      merged('auto-security', bug('security', 'minor'), null),
      openPr('still-open', bug('money')),
    ]);
  }

  it('gives each player their own counts, in player order, with zeros for idle players', () => {
    const { teamStats } = postmortem(richGame());

    expect(teamStats).toEqual([
      {
        playerId: SARA.id,
        name: 'Sara',
        merged: 0,
        declined: 2,
        comments: 1,
        catches: 1,
        misses: 0,
      },
      { playerId: TOM.id, name: 'Tom', merged: 2, declined: 0, comments: 0, catches: 0, misses: 1 },
      { playerId: JOE.id, name: 'Joe', merged: 0, declined: 1, comments: 1, catches: 0, misses: 0 },
    ]);
  });

  it('gives a player with no activity all zeros', () => {
    const report = postmortem(game([merged('m', null, TOM)], {}, [SARA, TOM]));
    expect(report.teamStats[0]).toEqual({
      playerId: SARA.id,
      name: 'Sara',
      merged: 0,
      declined: 0,
      comments: 0,
      catches: 0,
      misses: 0,
    });
  });

  it('adds up to the action log totals', () => {
    const report = postmortem(richGame());
    const sum = (key: 'merged' | 'declined' | 'comments' | 'catches' | 'misses') =>
      report.teamStats.reduce((total, p) => total + p[key], 0);

    // Manual merges only. Auto-merges have no player.
    expect(sum('merged')).toBe(2);
    // Every decline is a catch, a wrong-reason decline or a lost-revenue decline.
    expect(sum('declined')).toBe(3);
    expect(sum('declined')).toBe(
      report.catches.length + report.wrongReason.length + report.lostRevenue.length,
    );
    // Every comment, on any PR, including comments on resolved PRs.
    expect(sum('comments')).toBe(2);
    expect(sum('catches')).toBe(report.catches.length);
    // A miss is a slipped-through bug that a player merged by hand.
    expect(sum('misses')).toBe(report.slipped.filter((s) => s.mergedBy !== null).length);
  });

  it('counts a wrong-reason decline as a decline, but not as a miss or a catch', () => {
    const sara = postmortem(richGame()).teamStats.find((p) => p.playerId === SARA.id);
    expect(sara).toMatchObject({ declined: 2, catches: 1, misses: 0 });
  });
});
