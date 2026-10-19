// The answer-key leak rule (plan.md Resolved Decision 2, SPEC → Content rules). Every frame that
// every client received before its postmortem is scanned:
//   - no bug.lines, bug.explanation or bug.severity key, and no explanation text, anywhere;
//   - no incident text in a state snapshot;
//   - an incident event shows its text only once a buggy PR with that incident is merged, and a
//     catch event only once its PR is declined, as seen in the latest state the client had.

import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../../content/prs';
import type { PublicRoomState, PullRequest } from '../../shared/types';
import type { ServerMsg } from '../../shared/protocol';
import {
  playQuarter,
  startTestServer,
  type Frame,
  type PlayedQuarter,
  type TestServer,
} from './helpers';

const FORBIDDEN_KEYS = ['bug', 'lines', 'explanation', 'severity'];
const buggyPool = pool.filter(
  (pr): pr is PullRequest & { bug: NonNullable<PullRequest['bug']> } => pr.bug !== null,
);

/** Every object key anywhere in a parsed JSON value. */
function keysIn(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) keysIn(item, out);
  } else if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      out.push(key);
      keysIn(child, out);
    }
  }
  return out;
}

/** The JSON-escaped form of a string, as it would appear inside a frame's text. */
function escapedInFrame(text: string): string {
  return JSON.stringify(text).slice(1, -1);
}

export interface LeakReport {
  violations: string[];
  incidentsShown: number;
  catchesShown: number;
}

/** Checks one client's frames in arrival order, up to (not including) its first postmortem. */
export function scanBeforePostmortem(frames: readonly Frame[]): LeakReport {
  const violations: string[] = [];
  let incidentsShown = 0;
  let catchesShown = 0;
  let latest: PublicRoomState | null = null;

  for (const [index, { raw, msg }] of frames.entries()) {
    if (msg.t === 'postmortem') break;
    const where = `frame ${index} (${msg.t})`;

    for (const key of keysIn(JSON.parse(raw))) {
      if (FORBIDDEN_KEYS.includes(key)) violations.push(`${where} has key "${key}"`);
    }
    for (const pr of buggyPool) {
      if (raw.includes(escapedInFrame(pr.bug.explanation))) {
        violations.push(`${where} contains the explanation of ${pr.id}`);
      }
    }

    if (msg.t === 'state') {
      latest = msg.state;
      for (const pr of buggyPool) {
        if (raw.includes(escapedInFrame(pr.bug.incident))) {
          violations.push(`${where} contains the incident text of ${pr.id}`);
        }
      }
    }

    if (msg.t !== 'event') continue;
    const resolved = new Map((latest?.prs ?? []).map((p) => [p.id, p.status]));
    if (msg.event.kind === 'incident') {
      const { text } = msg.event;
      const source = buggyPool.find((pr) => pr.bug.incident === text);
      incidentsShown += 1;
      if (source === undefined) {
        violations.push(`${where} is an incident with text that is in no buggy PR`);
      } else if (
        !buggyPool.some((pr) => pr.bug.incident === text && resolved.get(pr.id) === 'merged')
      ) {
        violations.push(`${where} shows the incident of ${source.id} before it was merged`);
      }
    }
    if (msg.event.kind === 'catch') {
      catchesShown += 1;
      if (resolved.get(msg.event.prId) !== 'declined') {
        violations.push(`${where} is a catch for ${msg.event.prId} before it was declined`);
      }
    }
  }
  return { violations, incidentsShown, catchesShown };
}

// ---- the scanner must itself catch leaks ---------------------------------------------------------

describe('leak scanner', () => {
  const bugged = buggyPool[0]!;
  const clean = pool.find((pr) => pr.bug === null)!;
  const frame = (msg: ServerMsg): Frame => ({ raw: JSON.stringify(msg), msg });
  const stateWith = (pr: PullRequest, status: 'open' | 'merged') => ({
    code: 'ABCD',
    companyName: 'Acme',
    phase: 'playing' as const,
    hostId: null,
    players: [],
    startedAt: 0,
    endsAt: 1,
    totalPrs: 1,
    prs: [
      {
        id: pr.id,
        title: pr.title,
        author: pr.author,
        area: pr.area,
        description: pr.description,
        diff: pr.diff,
        featureValue: pr.featureValue,
        spawnAt: 0,
        expiresAt: 1,
        status,
        resolution: null,
        viewers: [],
        comments: [],
        highlighted: false,
      },
    ],
    metrics: { value: 1, downtimeMinutes: 0, uptime: 1, breaches: 0 },
    bankrupt: false,
  });

  it('flags a bug object sent inside a state', () => {
    const leakyState = { ...stateWith(bugged, 'open'), prs: [{ id: bugged.id, bug: bugged.bug }] };
    const report = scanBeforePostmortem([
      frame({ t: 'state', state: leakyState } as unknown as ServerMsg),
    ]);
    expect(report.violations.some((v) => v.includes('"bug"'))).toBe(true);
  });

  it('flags explanation text anywhere in a frame', () => {
    const report = scanBeforePostmortem([
      frame({ t: 'error', code: 'BAD_MESSAGE', message: bugged.bug.explanation }),
    ]);
    expect(report.violations).toHaveLength(1);
  });

  it('flags an incident shown before its PR merged, and accepts it after', () => {
    const incident = frame({
      t: 'event',
      event: { kind: 'incident', bugType: bugged.bug.type, text: bugged.bug.incident, at: 0 },
    });
    expect(scanBeforePostmortem([incident]).violations).toHaveLength(1);
    const after = scanBeforePostmortem([
      frame({ t: 'state', state: stateWith(bugged, 'merged') }),
      incident,
    ]);
    expect(after.violations).toEqual([]);
    expect(after.incidentsShown).toBe(1);
  });

  it('flags a catch shown before its PR was declined', () => {
    const catchEvent = frame({
      t: 'event',
      event: {
        kind: 'catch',
        prId: clean.id,
        prTitle: clean.title,
        by: 'p',
        byName: 'Ada',
        bugType: 'money',
        bonus: 150_000,
        at: 0,
      },
    });
    expect(scanBeforePostmortem([catchEvent]).violations).toHaveLength(1);
  });

  it('ignores everything after the postmortem', () => {
    const report = scanBeforePostmortem([
      frame({ t: 'postmortem', report: {} as never }),
      frame({ t: 'error', code: 'BAD_MESSAGE', message: bugged.bug.explanation }),
    ]);
    expect(report.violations).toEqual([]);
  });
});

// ---- the real game ---------------------------------------------------------------------------------

describe('answer key over a full quarter', () => {
  let server: TestServer | undefined;
  let played: PlayedQuarter | undefined;

  beforeAll(() => {
    expect(buggyPool.length).toBeGreaterThan(0);
  });

  afterEach(async () => {
    for (const client of played?.clients ?? []) await client.close();
    played = undefined;
    await server?.close();
    server = undefined;
  });

  it('no client receives any answer-key data before the postmortem', async () => {
    server = await startTestServer(7);
    played = await playQuarter(server.url);

    let incidentsShown = 0;
    let catchesShown = 0;
    for (const client of played.clients) {
      const report = scanBeforePostmortem(client.frames);
      expect(report.violations, `client ${client.playerId}`).toEqual([]);
      incidentsShown += report.incidentsShown;
      catchesShown += report.catchesShown;
    }
    // The allowed exceptions really did happen, so the scan was not vacuous.
    expect(incidentsShown).toBeGreaterThanOrEqual(1);
    expect(catchesShown).toBeGreaterThanOrEqual(1);
  }, 40_000);
});
