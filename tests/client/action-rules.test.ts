import { describe, expect, it } from 'vitest';
import type { PublicPr } from '../../shared/types';
import {
  DECLINE_OPTIONS,
  canAct,
  errorNotice,
  isTypingTarget,
  neighbourPrId,
  shortcutFor,
  nextSheetChoice,
  pausedReason,
} from '../../client/src/views/game/action-rules';

function pr(id: string, status: PublicPr['status'] = 'open'): Pick<PublicPr, 'id' | 'status'> {
  return { id, status };
}

describe('canAct', () => {
  it('allows acting on an open PR while the socket is open', () => {
    expect(canAct(pr('a'), 'open')).toBe(true);
  });

  it('refuses while the socket is not open', () => {
    expect(canAct(pr('a'), 'reconnecting')).toBe(false);
    expect(canAct(pr('a'), 'connecting')).toBe(false);
    expect(canAct(pr('a'), 'closed')).toBe(false);
  });

  it('refuses on a resolved PR, even with the socket open', () => {
    expect(canAct(pr('a', 'merged'), 'open')).toBe(false);
    expect(canAct(pr('a', 'declined'), 'open')).toBe(false);
  });

  it('refuses when no PR is shown', () => {
    expect(canAct(null, 'open')).toBe(false);
  });
});

describe('shortcutFor', () => {
  it('maps j and k to queue movement, m to merge and d to decline', () => {
    expect(shortcutFor('j')).toEqual({ kind: 'next' });
    expect(shortcutFor('k')).toEqual({ kind: 'prev' });
    expect(shortcutFor('m')).toEqual({ kind: 'merge' });
    expect(shortcutFor('d')).toEqual({ kind: 'decline' });
  });

  it('maps Escape to closing the decline sheet', () => {
    expect(shortcutFor('Escape')).toEqual({ kind: 'close' });
  });

  it('ignores other keys and upper-case letters', () => {
    expect(shortcutFor('x')).toBeNull();
    expect(shortcutFor('Enter')).toBeNull();
    expect(shortcutFor('M')).toBeNull();
  });
});

describe('isTypingTarget', () => {
  it('is true for input, textarea and select elements', () => {
    expect(isTypingTarget({ tagName: 'INPUT' })).toBe(true);
    expect(isTypingTarget({ tagName: 'TEXTAREA' })).toBe(true);
    expect(isTypingTarget({ tagName: 'SELECT' })).toBe(true);
  });

  it('is true for contenteditable elements', () => {
    expect(isTypingTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true);
  });

  it('is false for buttons, the page body and no target', () => {
    expect(isTypingTarget({ tagName: 'BUTTON' })).toBe(false);
    expect(isTypingTarget({ tagName: 'BODY' })).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe('neighbourPrId', () => {
  const queue = [pr('a'), pr('b'), pr('c')];

  it('moves to the next and previous PR in the queue', () => {
    expect(neighbourPrId(queue, 'a', 1)).toBe('b');
    expect(neighbourPrId(queue, 'b', 1)).toBe('c');
    expect(neighbourPrId(queue, 'c', -1)).toBe('b');
  });

  it('stops at the ends of the queue instead of wrapping', () => {
    expect(neighbourPrId(queue, 'c', 1)).toBe('c');
    expect(neighbourPrId(queue, 'a', -1)).toBe('a');
  });

  it('starts at the top when the current PR is not in the queue', () => {
    expect(neighbourPrId(queue, 'gone', 1)).toBe('a');
    expect(neighbourPrId(queue, null, 1)).toBe('a');
  });

  it('returns null for an empty queue', () => {
    expect(neighbourPrId([], 'a', 1)).toBeNull();
  });
});

describe('errorNotice', () => {
  const baseline = { prId: 'a', seq: 3 };

  it('returns the server message for an error newer than the baseline', () => {
    const error = { seq: 4, code: 'PR_NOT_OPEN' as const, message: 'Already merged by Sara' };
    expect(errorNotice(error, baseline, 'a')).toBe('Already merged by Sara');
  });

  it('shows any error code, such as a ping cooldown', () => {
    const error = { seq: 4, code: 'PING_COOLDOWN' as const, message: 'Wait 12 s' };
    expect(errorNotice(error, baseline, 'a')).toBe('Wait 12 s');
  });

  it('ignores an error that was already there at the baseline', () => {
    const error = { seq: 3, code: 'PR_NOT_OPEN' as const, message: 'old' };
    expect(errorNotice(error, baseline, 'a')).toBeNull();
  });

  it('shows nothing for a different PR than the baseline is for', () => {
    const error = { seq: 4, code: 'PR_NOT_OPEN' as const, message: 'Already merged by Sara' };
    expect(errorNotice(error, baseline, 'b')).toBeNull();
  });

  it('shows nothing without a baseline or an error', () => {
    expect(errorNotice(null, baseline, 'a')).toBeNull();
    expect(errorNotice({ seq: 4, code: 'PR_NOT_OPEN', message: 'x' }, null, 'a')).toBeNull();
  });
});

describe('DECLINE_OPTIONS', () => {
  it('lists the three bug types in spec order with their icons', () => {
    expect(DECLINE_OPTIONS.map((o) => [o.bugType, o.icon, o.label])).toEqual([
      ['money', '💸', 'Money'],
      ['security', '🔓', 'Security'],
      ['outage', '🔥', 'Outage'],
    ]);
  });
});

describe('nextSheetChoice', () => {
  it('moves forward through the choices and wraps from the last to the first', () => {
    expect(nextSheetChoice(0, 3, false)).toBe(1);
    expect(nextSheetChoice(1, 3, false)).toBe(2);
    expect(nextSheetChoice(2, 3, false)).toBe(0);
  });

  it('moves back and wraps from the first to the last with shift', () => {
    expect(nextSheetChoice(1, 3, true)).toBe(0);
    expect(nextSheetChoice(0, 3, true)).toBe(2);
  });

  it('starts at the first choice when focus is outside the sheet', () => {
    expect(nextSheetChoice(-1, 3, false)).toBe(0);
    expect(nextSheetChoice(-1, 3, true)).toBe(2);
  });

  it('returns -1 when the sheet has no choices', () => {
    expect(nextSheetChoice(0, 0, false)).toBe(-1);
  });
});

describe('pausedReason', () => {
  it('is empty while connected and explains the pause otherwise', () => {
    expect(pausedReason('open')).toBe('');
    expect(pausedReason('reconnecting')).toBe('Reconnecting: merge and decline are paused');
    expect(pausedReason('closed')).toMatch(/Disconnected/);
  });
});
