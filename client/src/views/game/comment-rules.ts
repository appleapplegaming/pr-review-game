// Pure rules for comments and second-opinion pings. No DOM, no store: the components and the
// game screen call these, and the tests check them directly.
//
// The limits come from shared/config.ts, the same numbers the server enforces. The server still
// has the final say (it rejects with INVALID_COMMENT or PING_COOLDOWN), so these checks only keep
// the UI from sending what the server would refuse.

import type { Comment } from '../../../../shared/types';
import { config } from '../../../../shared/config';

export type CommentCheck = { ok: true; text: string } | { ok: false; reason: 'empty' | 'too-long' };

/** Characters after trimming. Counted by code point, so an emoji is one character, as on the server. */
export function commentLength(text: string): number {
  return Array.from(text.trim()).length;
}

export function checkComment(text: string): CommentCheck {
  const trimmed = text.trim();
  const length = Array.from(trimmed).length;
  if (length < config.comment.min) return { ok: false, reason: 'empty' };
  if (length > config.comment.max) return { ok: false, reason: 'too-long' };
  return { ok: true, text: trimmed };
}

/** Characters left before the limit. Negative when the text is over it. */
export function charsLeft(text: string): number {
  return config.comment.max - commentLength(text);
}

/** The comments on one diff line, or the whole-PR comments for null. */
export function commentsOn(comments: readonly Comment[], line: number | null): Comment[] {
  return comments.filter((c) => c.line === line);
}

/**
 * Milliseconds until this tab may ping the PR again. `lastPingAt` is the server time of this
 * tab's last successful ping on it, or undefined when there was none. Capped at the full cooldown,
 * since the render clock can lag the moment of the ping by one tick.
 */
export function pingCooldownLeft(lastPingAt: number | undefined, now: number): number {
  if (lastPingAt === undefined) return 0;
  return Math.min(config.pingCooldownMs, Math.max(0, lastPingAt + config.pingCooldownMs - now));
}

/** Whole seconds to show, rounded up so a running cooldown never reads 0 s. */
export function cooldownSeconds(ms: number): number {
  return Math.ceil(ms / 1000);
}

/** Which diff line is open for a comment. One line at a time, scoped to the PR it belongs to. */
export interface LineSelection {
  prId: string;
  line: number;
}

/** Tapping the open line closes it. Tapping any other line opens that one. */
export function toggleLine(
  current: LineSelection | null,
  prId: string,
  line: number,
): LineSelection | null {
  if (current !== null && current.prId === prId && current.line === line) return null;
  return { prId, line };
}

/** The selected line for this PR, or null when the selection belongs to another PR. */
export function selectedLineFor(current: LineSelection | null, prId: string | null): number | null {
  if (current === null || prId === null || current.prId !== prId) return null;
  return current.line;
}
