// Pure helpers for the postmortem screen. No DOM, no store, so they are unit-tested in Vitest.
// The wording follows SPEC.md → Postmortem and → End-of-quarter grade.

import { config } from '../../../../shared/config';
import type { Badge, Bug, BugType, Comment, DecisionEntry, Ping } from '../../../../shared/types';

// Labels are plain text because they are interpolated into sentences and accessible names. The
// emoji live in separate maps and are rendered inside aria-hidden spans.
export const BADGE_LABEL: Record<Badge, string> = {
  'five-nines': 'Five nines-ish',
  'three-nines': 'Three nines',
  'business-as-usual': 'Business as usual',
  'this-is-fine': 'This is fine',
};

export const BADGE_EMOJI: Record<Badge, string> = {
  'five-nines': '🏆',
  'three-nines': '🥇',
  'business-as-usual': '🥈',
  'this-is-fine': '🔥',
};

export const DECLINE_LABEL: Record<BugType, string> = {
  money: 'Money',
  security: 'Security',
  outage: 'Outage',
};

export const DECLINE_EMOJI: Record<BugType, string> = {
  money: '💸',
  security: '🔓',
  outage: '🔥',
};

/** A fraction as a percent without trailing zeros: 0.9999 -> "99.99", 0.99 -> "99". */
function percent(fraction: number): string {
  return String(parseFloat((fraction * 100).toFixed(3)));
}

function breachText(max: number): string {
  return max === 1 ? '1 breach' : `${max} breaches`;
}

/** The SPEC.md badge table, in order, built from the tunable config so the two cannot drift. */
export const BADGE_RULES: ReadonlyArray<{ badge: Badge; requirement: string }> = [
  {
    badge: 'five-nines',
    requirement: `Uptime ≥ ${percent(config.badges.fiveNines.uptime)}% and ${breachText(config.badges.fiveNines.maxBreaches)}`,
  },
  {
    badge: 'three-nines',
    requirement: `Uptime ≥ ${percent(config.badges.threeNines.uptime)}% and at most ${breachText(config.badges.threeNines.maxBreaches)}`,
  },
  {
    badge: 'business-as-usual',
    requirement: `Uptime ≥ ${percent(config.badges.businessAsUsual.uptime)}%`,
  },
  { badge: 'this-is-fine', requirement: 'Everything else' },
];

/** "Earned with: Uptime ≥ 99.99% and 0 breaches". */
export function badgeCaption(badge: Badge): string {
  const rule = BADGE_RULES.find((r) => r.badge === badge);
  return `Badge rule: ${rule?.requirement ?? ''}`;
}

/** One celebratory or consoling line for the quarter's outcome. Bankruptcy wins over the badge. */
export function outcomeLine(badge: Badge, bankrupt: boolean): string {
  if (bankrupt)
    return 'The company ran out of money. Rough quarter: the review below shows where it went.';
  switch (badge) {
    case 'five-nines':
      return 'Spotless. Customers barely noticed you were there.';
    case 'three-nines':
      return 'Solid quarter. One more careful review and it would have been flawless.';
    case 'business-as-usual':
      return 'The lights stayed on, mostly. Nice recovery work.';
    case 'this-is-fine':
      return 'It was a fire drill, but everyone made it out. Learn from the list below.';
  }
}

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

export type Outcome = 'merged' | 'declined';

/** Whether the PR was merged or declined after the ping. Pings are blocked once a PR resolves. */
export function pingOutcomeText(outcome: Outcome): string {
  return outcome === 'merged' ? 'Merged afterwards.' : 'Declined afterwards.';
}

/** True when a comment points at one of the bug's diff lines. */
export function flaggedBugLine(comment: Comment, bugLines: ReadonlySet<number>): boolean {
  return comment.line !== null && bugLines.has(comment.line);
}

/** How many diff lines the bug spans, e.g. "2 bug lines". */
export function bugLineCount(count: number): string {
  return `${count} bug ${count === 1 ? 'line' : 'lines'}`;
}

/** The <details> summary for a diff: "Diff, 14 lines, 2 bug lines". */
export function diffSummary(lineCount: number, bugCount: number): string {
  const lines = `${lineCount} ${lineCount === 1 ? 'line' : 'lines'}`;
  return bugCount > 0 ? `Diff, ${lines}, ${bugLineCount(bugCount)}` : `Diff, ${lines}`;
}

export const SHORT_DIFF_LINES = 16;
export const BUG_CONTEXT = 3;

/** Line numbers to show for a long diff: each bug line plus BUG_CONTEXT lines either side. */
export function visibleLineNumbers(
  total: number,
  bugLines: ReadonlySet<number>,
  context = BUG_CONTEXT,
): Set<number> {
  const keep = new Set<number>();
  for (const line of bugLines) {
    for (let i = Math.max(1, line - context); i <= Math.min(total, line + context); i++)
      keep.add(i);
  }
  return keep;
}

/** "240 min of downtime", or "" when the PR caused none. */
export function downtimeLabel(minutes: number): string {
  return minutes > 0 ? `${minutes} min of downtime` : '';
}

/** What the player chose when declining: their bug type, or no reason. */
export function declineText(bugType: BugType | null): string {
  return bugType === null ? 'Declined with no reason' : `Declined as ${DECLINE_LABEL[bugType]}`;
}

/** What the PR's bug was, for the wrong-reason card. Safe when the PR had no bug. */
export function actualBugText(entry: DecisionEntry): string {
  return entry.pr.bug === null
    ? 'This PR had no bug.'
    : `The actual bug was ${DECLINE_LABEL[entry.pr.bug.type]}.`;
}

/** "Declined by Tom as Security. The actual bug was Money." */
export function wrongReasonText(entry: DecisionEntry): string {
  const chosen = entry.bugType === null ? 'no type' : DECLINE_LABEL[entry.bugType];
  return `Declined by ${entry.byName} as ${chosen}. ${actualBugText(entry)}`;
}

/** Why a correct decline was right, using the bug the player spotted. */
export function whyDeclineRight(bug: Bug, byName: string): string {
  return `Declining was right: this PR carried a ${bug.severity} ${DECLINE_LABEL[bug.type]} bug, and ${byName} named the type correctly.`;
}
