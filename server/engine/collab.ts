// Comments and second-opinion pings. Pure: the caller passes the player, the clock and the PR.
//
// Neither action touches the PR's timer (expiresAt), its status or the company value. A comment
// is allowed on a resolved PR, because comments can still be read after it resolves. A ping
// highlights a PR only while it is open, so a ping on a resolved PR is rejected.

import type { ErrorCode } from '../../shared/types';
import { config } from '../../shared/config';
import { parseDiff } from '../../shared/diff';
import type { Quarter, ServerPr } from './state';

export type CollabResult =
  { ok: true; quarter: Quarter } | { ok: false; code: ErrorCode; message: string };

function reject(code: ErrorCode, message: string): CollabResult {
  return { ok: false, code, message };
}

/** A PR is highlighted while it has pings and is still open. Resolving it clears the highlight. */
export function isHighlighted(pr: ServerPr): boolean {
  return pr.status === 'open' && pr.pings.length > 0;
}

/** A copy of the quarter with one PR replaced. The input is never changed. */
function withPr(quarter: Quarter, next: ServerPr, changes: Partial<Quarter> = {}): Quarter {
  const prs = new Map(quarter.prs);
  prs.set(next.pr.id, next);
  return { ...quarter, prs, ...changes };
}

/**
 * Adds a comment to a PR. `line` is a 1-based index into the rendered diff, or null for the whole
 * PR. The text is trimmed first, then measured in characters (so an emoji counts as one).
 */
export function addComment(
  quarter: Quarter,
  pr: ServerPr,
  player: { id: string; name: string },
  line: number | null,
  text: string,
  at: number,
): CollabResult {
  const trimmed = text.trim();
  const length = Array.from(trimmed).length;
  const { min, max } = config.comment;
  if (length < min || length > max) {
    return reject('INVALID_COMMENT', `Comments must be ${min}-${max} characters`);
  }

  if (line !== null) {
    const lineCount = parseDiff(pr.pr.diff).length;
    if (!Number.isInteger(line) || line < 1 || line > lineCount) {
      return reject('INVALID_COMMENT', 'That line is not in the diff');
    }
  }

  const comment = {
    id: `c-${quarter.nextId}`,
    prId: pr.pr.id,
    playerId: player.id,
    playerName: player.name,
    line,
    text: trimmed,
    at,
  };
  const next: ServerPr = { ...pr, comments: [...pr.comments, comment] };
  return { ok: true, quarter: withPr(quarter, next, { nextId: quarter.nextId + 1 }) };
}

/**
 * Pings the team about an open PR. Each player can ping a given PR once per cooldown window.
 * Exactly `pingCooldownMs` after the last ping is allowed.
 */
export function addPing(
  quarter: Quarter,
  pr: ServerPr,
  player: { id: string; name: string },
  at: number,
): CollabResult {
  if (pr.status !== 'open') return reject('PR_NOT_OPEN', 'This PR is already resolved');

  const last = pr.pings.filter((p) => p.playerId === player.id).at(-1);
  if (last !== undefined && at - last.at < quarter.timing.pingCooldownMs) {
    return reject('PING_COOLDOWN', 'You already pinged this PR a moment ago');
  }

  const next: ServerPr = {
    ...pr,
    pings: [...pr.pings, { prId: pr.pr.id, playerId: player.id, playerName: player.name, at }],
  };
  return { ok: true, quarter: withPr(quarter, next) };
}
