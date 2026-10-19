// Pure helpers for the postmortem screen. No DOM, no store, so they are unit-tested in Vitest.
// The wording follows SPEC.md → Postmortem and → End-of-quarter grade.

import type { Badge, Bug, BugType, Comment, Ping } from '../../../../shared/types';

export const BADGE_LABEL: Record<Badge, string> = {
  'five-nines': '🏆 Five nines-ish',
  'three-nines': '🥇 Three nines',
  'business-as-usual': '🥈 Business as usual',
  'this-is-fine': '🔥 This is fine',
};

export const DECLINE_LABEL: Record<BugType, string> = {
  money: '💸 Money',
  security: '🔓 Security',
  outage: '🔥 Outage',
};

/** "Merged by Tom", or the auto-merge line when nobody reviewed the PR. */
export function mergedByLabel(entry: { autoMerged: boolean; mergedByName: string | null }): string {
  if (entry.autoMerged) return 'Auto-merged: nobody reviewed it';
  if (entry.mergedByName === null) return 'Merged by a player who left';
  return `Merged by ${entry.mergedByName}`;
}

/** "Whole PR" for a PR-level comment, "Line 42" for a diff line. */
export function lineLabel(line: number | null): string {
  return line === null ? 'Whole PR' : `Line ${line}`;
}

/** The set of diff line numbers that hold the bug, for O(1) checks while rendering. */
export function highlightedLines(bug: Bug): Set<number> {
  return new Set(bug.lines);
}

export type ThreadItem =
  { kind: 'comment'; at: number; comment: Comment } | { kind: 'ping'; at: number; ping: Ping };

/** Comments and pings on one PR as a single thread, oldest first. Ties keep comments before pings. */
export function threadItems(comments: Comment[], pings: Ping[]): ThreadItem[] {
  const items: ThreadItem[] = [
    ...comments.map((comment): ThreadItem => ({ kind: 'comment', at: comment.at, comment })),
    ...pings.map((p): ThreadItem => ({ kind: 'ping', at: p.at, ping: p })),
  ];
  return items.sort((a, b) => a.at - b.at);
}

export function pingText(ping: Ping): string {
  return `${ping.playerName} asked for a second opinion`;
}

/** "240 min of downtime", or "" when the PR caused none. */
export function downtimeLabel(minutes: number): string {
  return minutes > 0 ? `${minutes} min of downtime` : '';
}

/** What the player chose when declining: their bug type, or no reason. */
export function declineText(bugType: BugType | null): string {
  return bugType === null ? 'Declined with no reason' : `Declined as ${DECLINE_LABEL[bugType]}`;
}
