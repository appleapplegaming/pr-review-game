import { describe, expect, it } from 'vitest';
import type { Bug, Comment, Ping } from '../../shared/types';
import {
  BADGE_EMOJI,
  BADGE_LABEL,
  BADGE_RULES,
  badgeCaption,
  bugLineCount,
  diffSummary,
  flaggedBugLine,
  outcomeLine,
  pingOutcomeText,
  visibleLineNumbers,
  wrongReasonText,
  whyDeclineRight,
  DECLINE_EMOJI,
  DECLINE_LABEL,
  declineText,
  highlightedLines,
  lineLabel,
  mergedByLabel,
  pingText,
  threadItems,
  downtimeLabel,
} from '../../client/src/views/postmortem/postmortem-rules';

function comment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 'c-1',
    prId: 'pr-1',
    playerId: 'p-sara',
    playerName: 'Sara',
    line: null,
    text: 'Looks fine',
    at: 1_000,
    ...overrides,
  };
}

function ping(overrides: Partial<Ping> = {}): Ping {
  return { prId: 'pr-1', playerId: 'p-tom', playerName: 'Tom', at: 2_000, ...overrides };
}

describe('BADGE_LABEL', () => {
  it('names every badge with its SPEC wording, plain text only', () => {
    expect(BADGE_LABEL).toEqual({
      'five-nines': 'Five nines-ish',
      'three-nines': 'Three nines',
      'business-as-usual': 'Business as usual',
      'this-is-fine': 'This is fine',
    });
  });

  it('keeps the SPEC emoji separate', () => {
    expect(BADGE_EMOJI).toEqual({
      'five-nines': '🏆',
      'three-nines': '🥇',
      'business-as-usual': '🥈',
      'this-is-fine': '🔥',
    });
  });

  it('lists the SPEC thresholds in order', () => {
    expect(BADGE_RULES.map((r) => r.requirement)).toEqual([
      'Uptime ≥ 99.99% and 0 breaches',
      'Uptime ≥ 99.9% and at most 1 breach',
      'Uptime ≥ 99%',
      'Everything else',
    ]);
    expect(badgeCaption('three-nines')).toBe('Badge rule: Uptime ≥ 99.9% and at most 1 breach');
  });

  it('has an outcome line for every badge and for bankruptcy', () => {
    for (const badge of Object.keys(BADGE_LABEL) as (keyof typeof BADGE_LABEL)[]) {
      expect(outcomeLine(badge, false).length).toBeGreaterThan(0);
    }
    expect(outcomeLine('five-nines', true)).toMatch(/ran out of money/);
  });
});

describe('mergedByLabel', () => {
  it('says who merged a bug', () => {
    expect(mergedByLabel({ autoMerged: false, mergedByName: 'Tom' })).toBe('Merged by Tom');
  });

  it('says nobody reviewed an auto-merged bug', () => {
    expect(mergedByLabel({ autoMerged: true, mergedByName: null })).toBe(
      'Auto-merged: nobody reviewed it',
    );
  });

  it('does not invent a name for a manual merge whose player left', () => {
    expect(mergedByLabel({ autoMerged: false, mergedByName: null })).toBe(
      'Merged by a player who left',
    );
  });
});

describe('lineLabel', () => {
  it('labels a whole-PR comment', () => {
    expect(lineLabel(null)).toBe('Whole PR');
  });

  it('labels a diff line by its 1-based number', () => {
    expect(lineLabel(42)).toBe('Line 42');
  });
});

describe('highlightedLines', () => {
  it('returns the bug line numbers as a set for O(1) lookup', () => {
    const bug = { lines: [3, 7] } as Bug;
    const set = highlightedLines(bug);
    expect(set.has(3)).toBe(true);
    expect(set.has(7)).toBe(true);
    expect(set.has(4)).toBe(false);
  });
});

describe('threadItems', () => {
  it('merges comments and pings into one thread in time order', () => {
    const items = threadItems(
      [comment({ at: 5_000, text: 'late' }), comment({ at: 1_000, text: 'early' })],
      [ping({ at: 3_000 })],
    );
    expect(items.map((item) => item.at)).toEqual([1_000, 3_000, 5_000]);
    expect(items.map((item) => item.kind)).toEqual(['comment', 'ping', 'comment']);
  });

  it('keeps comment order for comments with the same timestamp', () => {
    const items = threadItems(
      [comment({ id: 'a', at: 1_000 }), comment({ id: 'b', at: 1_000 })],
      [],
    );
    expect(items.map((item) => (item.kind === 'comment' ? item.comment.id : ''))).toEqual([
      'a',
      'b',
    ]);
  });

  it('is empty when nobody commented or pinged', () => {
    expect(threadItems([], [])).toEqual([]);
  });
});

describe('pingText', () => {
  it('describes a second-opinion ping', () => {
    expect(pingText(ping({ playerName: 'Sara' }))).toBe('Sara asked for a second opinion');
  });
});

describe('downtimeLabel', () => {
  it('is empty when the PR caused no downtime', () => {
    expect(downtimeLabel(0)).toBe('');
  });

  it('shows minutes of downtime', () => {
    expect(downtimeLabel(240)).toBe('240 min of downtime');
  });
});

describe('declineText', () => {
  it('has a label for each bug type', () => {
    expect(DECLINE_LABEL).toEqual({ money: 'Money', security: 'Security', outage: 'Outage' });
    expect(DECLINE_EMOJI).toEqual({ money: '💸', security: '🔓', outage: '🔥' });
  });

  it('says what the player chose', () => {
    expect(declineText('money')).toBe('Declined as Money');
  });

  it('says the reason is unknown when no type was chosen', () => {
    expect(declineText(null)).toBe('Declined with no reason');
  });
});

describe('diff helpers', () => {
  it('summarises a diff', () => {
    expect(diffSummary(14, 2)).toBe('Diff, 14 lines, 2 bug lines');
    expect(diffSummary(10, 1)).toBe('Diff, 10 lines, 1 bug line');
    expect(diffSummary(10, 0)).toBe('Diff, 10 lines');
    expect(diffSummary(40, 2, true)).toBe('Diff, 40 lines, 2 bug lines, showing excerpt');
    expect(bugLineCount(0)).toBe('0 bug lines');
  });

  it('keeps bug lines with 3 lines of context, clamped to the diff', () => {
    const keep = visibleLineNumbers(30, new Set([2, 20]));
    expect([...keep].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 17, 18, 19, 20, 21, 22, 23]);
  });
});

describe('thread helpers', () => {
  it('flags comments on bug lines only', () => {
    const bugLines = new Set([3]);
    expect(flaggedBugLine(comment({ line: 3 }), bugLines)).toBe(true);
    expect(flaggedBugLine(comment({ line: 4 }), bugLines)).toBe(false);
    expect(flaggedBugLine(comment({ line: null }), bugLines)).toBe(false);
  });

  it('says what followed a ping', () => {
    expect(pingOutcomeText('merged', 100, 200)).toBe('Merged afterwards.');
    expect(pingOutcomeText('declined', 100, 200)).toBe('Declined afterwards.');
  });

  it('says nothing when the decision was not after the ping', () => {
    expect(pingOutcomeText('merged', 200, 200)).toBe('');
    expect(pingOutcomeText('declined', 300, 200)).toBe('');
  });
});

describe('decision copy', () => {
  const bug = { type: 'money', severity: 'major' } as Bug;
  const entry = (b: Bug | null, bugType: 'security' | null) =>
    ({ byName: 'Tom', bugType, pr: { bug: b } }) as unknown as Parameters<
      typeof wrongReasonText
    >[0];

  it('names the chosen and the actual type', () => {
    expect(wrongReasonText(entry(bug, 'security'))).toBe(
      'Declined by Tom as Security. The actual bug was Money.',
    );
    expect(wrongReasonText(entry(bug, null))).toBe(
      'Declined by Tom as no type. The actual bug was Money.',
    );
  });

  it('never says the bug was "none"', () => {
    expect(wrongReasonText(entry(null, 'security'))).toBe(
      'Declined by Tom as Security. This PR had no bug.',
    );
  });

  it('explains why a catch was right', () => {
    expect(whyDeclineRight(bug, 'Sara')).toBe(
      'Declining was right: this PR carried a major Money bug, and Sara named the type correctly.',
    );
  });
});
