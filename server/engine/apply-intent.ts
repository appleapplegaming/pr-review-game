// Player decisions on a PR: open (presence), merge and decline. Pure: the caller passes the
// player, the clock and the RNG. The first decision the engine receives wins. Later ones are
// rejected with PR_NOT_OPEN, naming whoever resolved the PR.
//
// comment and ping are handled by Task 7, so they are not part of this type.

import type { ErrorCode, GameEvent, Resolution } from '../../shared/types';
import type { Intent } from '../../shared/protocol';
import { config } from '../../shared/config';
import { randomInt, type Rng } from './rng';
import type { GameState, Quarter, ServerPr } from './state';

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

export function applyIntent(
  state: GameState,
  playerId: string,
  intent: DecisionIntent,
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
    if (pr.status !== 'open' || pr.viewers.includes(playerId))
      return { ok: true, state, events: [] };
    const viewed = { ...pr, viewers: [...pr.viewers, playerId] };
    return { ok: true, state: withQuarter(state, withPr(quarter, viewed)), events: [] };
  }

  if (pr.status !== 'open') {
    return reject('PR_NOT_OPEN', alreadyResolvedMessage(pr.resolution));
  }

  const { bug, featureValue, title } = pr.pr;
  const base = { prId: pr.pr.id, prTitle: title, by: playerId, byName: player.name, at: now };

  if (intent.t === 'merge') {
    const merged: ServerPr = {
      ...pr,
      status: 'merged',
      resolution: { kind: 'merged', by: playerId, byName: player.name, at: now },
    };
    // A buggy merge schedules one incident. The tick (Task 6) fires it.
    const incidents =
      bug === null
        ? quarter.incidents
        : [
            ...quarter.incidents,
            {
              prId: pr.pr.id,
              fireAt:
                now +
                randomInt(
                  rng,
                  quarter.timing.incidentDelayMs.min,
                  quarter.timing.incidentDelayMs.max,
                ),
            },
          ];
    const next = withPr(quarter, merged, {
      metrics: { ...quarter.metrics, value: quarter.metrics.value + featureValue },
      incidents,
    });
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
