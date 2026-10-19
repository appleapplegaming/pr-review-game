import { describe, expect, it } from 'vitest';
import type { Bug, Comment, Ping } from '../../shared/types';
import {
  BADGE_LABEL,
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
  it('names every badge with its SPEC emoji and wording', () => {
    expect(BADGE_LABEL).toEqual({
      'five-nines': '🏆 Five nines-ish',
      'three-nines': '🥇 Three nines',
      'business-as-usual': '🥈 Business as usual',
      'this-is-fine': '🔥 This is fine',
    });
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
    expect(DECLINE_LABEL).toEqual({
      money: '💸 Money',
      security: '🔓 Security',
      outage: '🔥 Outage',
    });
  });

  it('says what the player chose', () => {
    expect(declineText('money')).toBe('Declined as 💸 Money');
  });

  it('says the reason is unknown when no type was chosen', () => {
    expect(declineText(null)).toBe('Declined with no reason');
  });
});
