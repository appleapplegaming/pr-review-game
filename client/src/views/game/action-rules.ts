// Pure rules for the action bar: who may act, what a key means, and which rejection to show.
// No DOM and no store, so they are unit-tested in Vitest. Components pass in what they read.

import type { ConnState, ServerError } from '../../net/store';
import type { BugType, PublicPr } from '../../../../shared/types';

export const DECLINE_OPTIONS: ReadonlyArray<{ bugType: BugType; icon: string; label: string }> = [
  { bugType: 'money', icon: '💸', label: 'Money' },
  { bugType: 'security', icon: '🔓', label: 'Security' },
  { bugType: 'outage', icon: '🔥', label: 'Outage' },
];

/** True when this player may send a merge or decline for the PR now. */
export function canAct(pr: Pick<PublicPr, 'status'> | null, conn: ConnState): boolean {
  return pr !== null && pr.status === 'open' && conn === 'open';
}

export type ShortcutAction =
  { kind: 'next' } | { kind: 'prev' } | { kind: 'merge' } | { kind: 'decline' } | { kind: 'close' };

/** The action a key stands for, or null. Letters are lower-case only, so Shift+J does nothing. */
export function shortcutFor(key: string): ShortcutAction | null {
  switch (key) {
    case 'j':
      return { kind: 'next' };
    case 'k':
      return { kind: 'prev' };
    case 'm':
      return { kind: 'merge' };
    case 'd':
      return { kind: 'decline' };
    case 'Escape':
      return { kind: 'close' };
    default:
      return null;
  }
}

/** The shape a keydown target needs for this check. A DOM element fits it. */
export interface KeyTarget {
  tagName?: string;
  isContentEditable?: boolean;
}

/** True when the key is typed into a field, so shortcuts must not fire. */
export function isTypingTarget(target: KeyTarget | null): boolean {
  if (target === null) return false;
  if (target.isContentEditable === true) return true;
  const tag = target.tagName?.toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/**
 * The PR one step along the queue from `currentId`. Clamps at both ends. When the current PR is not
 * in the queue (it resolved, or nothing is selected), a step forward lands on the top of the queue.
 */
export function neighbourPrId(
  queue: readonly { id: string }[],
  currentId: string | null,
  delta: 1 | -1,
): string | null {
  if (queue.length === 0) return null;
  const index = currentId === null ? -1 : queue.findIndex((p) => p.id === currentId);
  if (index === -1) return queue[0]?.id ?? null;
  const next = Math.min(queue.length - 1, Math.max(0, index + delta));
  return queue[next]?.id ?? null;
}

/**
 * A point in the error history for one PR: the store's error seq when the player selected the PR
 * or last acted on it. Only errors newer than this are shown.
 */
export interface Baseline {
  prId: string;
  seq: number;
}

/**
 * The newest server error for this PR, as a message, or null. Errors from any action (merge,
 * decline, ping, comment) count, because the server replies to the sender only. An error at or
 * before the baseline never shows.
 */
export function errorNotice(
  error: ServerError | null,
  baseline: Baseline | null,
  prId: string,
): string | null {
  if (error === null || baseline === null) return null;
  if (baseline.prId !== prId) return null;
  return error.seq > baseline.seq ? error.message : null;
}
