// Player intents on a PR: open (presence), merge and decline (decisions), and comment and ping
// (collab, see collab.ts). Pure: the caller passes the player, the clock and the RNG. The first
// decision the engine receives wins. Later ones are rejected with PR_NOT_OPEN, naming whoever
// resolved the PR. Comments and pings are not decisions, so they still work after a resolve.

import { BUG_TYPES, type ErrorCode, type GameEvent, type Resolution } from '../../shared/types';
import type { Intent } from '../../shared/protocol';
import { config } from '../../shared/config';
import { randomInt, type Rng } from './rng';
import type { GameState, Quarter, ServerPr } from './state';
import { addComment, addPing } from './collab';

export type DecisionIntent = Extract<Intent, { t: 'open' | 'merge' | 'decline' }>;

export interface Applied {
  ok: true;
  state: GameState;
  events: GameEvent[];
}

export interface Rejected {
  ok: false;
  code: ErrorCode;
  /** Text the client can show as is, e.g. "Already merged by Sara". */
  message: string;
}

export type ApplyResult = Applied | Rejected;

function reject(code: ErrorCode, message: string): Rejected {
  return { ok: false, code, message };
}

function alreadyResolvedMessage(resolution: Resolution | null): string {
  if (resolution === null) return 'This PR is already resolved';
  if (resolution.kind === 'merged') {
    return resolution.byName === null
      ? 'Already merged automatically'
      : `Already merged by ${resolution.byName}`;
  }
  return `Already declined by ${resolution.byName}`;
}

/** A copy of the quarter with one PR replaced. The input is never changed. */
function withPr(quarter: Quarter, next: ServerPr, changes: Partial<Quarter> = {}): Quarter {
  const prs = new Map(quarter.prs);
  prs.set(next.pr.id, next);
  return { ...quarter, prs, ...changes };
}

function withQuarter(state: GameState, quarter: Quarter): GameState {
  return { ...state, quarter };
}

/**
 * Merges an open PR. `by` is null for an auto-merge. The value grows by the feature value, and a
 * buggy PR schedules its incident 4-12 s after the merge. Shared by manual merges and the tick.
 */
export function mergePr(
  quarter: Quarter,
  pr: ServerPr,
  by: string | null,
  byName: string | null,
  at: number,
  rng: Rng,
): Quarter {
  const merged: ServerPr = {
    ...pr,
    status: 'merged',
    resolution: { kind: 'merged', by, byName, at },
  };
  const bug = pr.pr.bug;
  const incidents =
    bug === null
      ? quarter.incidents
      : [
          ...quarter.incidents,
          {
            prId: pr.pr.id,
            fireAt:
              at +
              randomInt(
                rng,
                quarter.timing.incidentDelayMs.min,
                quarter.timing.incidentDelayMs.max,
              ),
          },
        ];
  return withPr(quarter, merged, {
    metrics: { ...quarter.metrics, value: quarter.metrics.value + pr.pr.featureValue },
    incidents,
  });
}

export function applyIntent(
  state: GameState,
  playerId: string,
  intent: Intent,
  now: number,
  rng: Rng,
): ApplyResult {
  const player = state.players.find((p) => p.id === playerId);
  if (player === undefined) return reject('NOT_IN_ROOM', 'You are not in this room');

  const quarter = state.quarter;
  if (state.phase !== 'playing' || quarter === null || now >= quarter.endsAt) {
    return reject('WRONG_PHASE', 'The quarter is not running');
  }

  const pr = quarter.prs.get(intent.prId);
  if (pr === undefined) return reject('PR_NOT_FOUND', 'No such PR');

  if (intent.t === 'open') {
    // Presence only. Opening never locks the PR, and opening a resolved PR is not an error.
    // A player views one PR at a time, so opening this one moves their 👀 off any other.
    if (pr.status !== 'open') return { ok: true, state, events: [] };
    const prs = new Map(quarter.prs);
    for (const [id, other] of quarter.prs) {
      const viewers =
        id === pr.pr.id
          ? other.viewers.includes(playerId)
            ? other.viewers
            : [...other.viewers, playerId]
          : other.viewers.filter((v) => v !== playerId);
      if (viewers.length !== other.viewers.length) {
        prs.set(id, { ...other, viewers });
      }
    }
    return { ok: true, state: withQuarter(state, { ...quarter, prs }), events: [] };
  }

  if (intent.t === 'comment') {
    const result = addComment(quarter, pr, player, intent.line, intent.text, now);
    if (!result.ok) return result;
    return { ok: true, state: withQuarter(state, result.quarter), events: [] };
  }

  if (intent.t === 'ping') {
    const result = addPing(quarter, pr, player, now);
    if (!result.ok) return result;
    const event: GameEvent = {
      kind: 'ping',
      prId: pr.pr.id,
      prTitle: pr.pr.title,
      playerId,
      playerName: player.name,
      at: now,
    };
    return { ok: true, state: withQuarter(state, result.quarter), events: [event] };
  }

  if (pr.status !== 'open') {
    return reject('PR_NOT_OPEN', alreadyResolvedMessage(pr.resolution));
  }
  // The timer has run out but the tick has not auto-merged the PR yet: the auto-merge wins.
  if (now >= pr.expiresAt) return reject('PR_NOT_OPEN', 'Time ran out: this PR is auto-merging');
  if (intent.t === 'decline' && !BUG_TYPES.includes(intent.bugType)) {
    return reject('BAD_MESSAGE', 'Unknown bug type');
  }

  const { bug, title } = pr.pr;
  const base = { prId: pr.pr.id, prTitle: title, by: playerId, byName: player.name, at: now };

  if (intent.t === 'merge') {
    const next = mergePr(quarter, pr, playerId, player.name, now, rng);
    return { ok: true, state: withQuarter(state, next), events: [{ kind: 'merge', ...base }] };
  }

  // decline: a correct type on a buggy PR is a catch. Anything else changes no value.
  const declined: ServerPr = {
    ...pr,
    status: 'declined',
    resolution: {
      kind: 'declined',
      by: playerId,
      byName: player.name,
      at: now,
      bugType: intent.bugType,
    },
  };
  if (bug !== null && intent.bugType === bug.type) {
    const next = withPr(quarter, declined, {
      metrics: { ...quarter.metrics, value: quarter.metrics.value + config.catchBonus },
    });
    return {
      ok: true,
      state: withQuarter(state, next),
      events: [{ kind: 'catch', ...base, bugType: intent.bugType, bonus: config.catchBonus }],
    };
  }
  const next = withPr(quarter, declined);
  return {
    ok: true,
    state: withQuarter(state, next),
    events: [{ kind: 'decline', ...base, bugType: intent.bugType }],
  };
}
