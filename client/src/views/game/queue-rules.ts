// Pure rules for the queue and countdowns. No DOM and no store, so they are unit-tested in Vitest.
// Components receive `now` as a prop and never read the clock themselves.

import { config } from '../../../../shared/config';
import type { PublicPlayer, PublicPr } from '../../../../shared/types';

export interface Countdown {
  remainingMs: number;
  /** m:ss, rounded up so 0:00 only shows at expiry. */
  label: string;
  /** Share of the PR's window that is left, 0..1. Drives the ring. */
  fraction: number;
  /** True strictly under config.countdownUrgentMs. */
  urgent: boolean;
}

/** Countdown for a PR. All times are server timestamps, so `now` must be serverTime(). */
export function countdown(input: { expiresAt: number; spawnAt: number; now: number }): Countdown {
  const remainingMs = Math.max(0, input.expiresAt - input.now);
  const windowMs = Math.max(1, input.expiresAt - input.spawnAt);
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return {
    remainingMs,
    label: `${minutes}:${seconds}`,
    fraction: Math.min(1, remainingMs / windowMs),
    urgent: remainingMs < config.countdownUrgentMs,
  };
}

/** Open PRs only, soonest expiry first. Ties break on id so the order never shuffles. */
export function openQueue(prs: readonly PublicPr[]): PublicPr[] {
  return prs
    .filter((p) => p.status === 'open')
    .sort((a, b) => a.expiresAt - b.expiresAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Names of the other players viewing a PR. Unknown ids are skipped. */
export function viewerNames(
  viewerIds: readonly string[],
  players: readonly PublicPlayer[],
  myId: string | null,
): string[] {
  const names: string[] = [];
  for (const id of viewerIds) {
    if (id === myId) continue;
    const player = players.find((p) => p.id === id);
    if (player !== undefined) names.push(player.name);
  }
  return names;
}

/** Visible comment count: "No comments", "1 comment", "2 comments". */
export function commentLabel(count: number): string {
  if (count === 0) return 'No comments';
  return count === 1 ? '1 comment' : `${count} comments`;
}
