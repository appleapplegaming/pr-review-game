import { describe, expect, it } from 'vitest';
import { keysActive, pingDotVisible, queueBadge } from '../../client/src/views/game/tab-rules';

describe('queueBadge', () => {
  it('shows nothing when no PR is open', () => {
    expect(queueBadge(0)).toBeNull();
  });

  it('shows the open PR count', () => {
    expect(queueBadge(1)).toBe('1');
    expect(queueBadge(12)).toBe('12');
  });

  it('caps the badge at 99+', () => {
    expect(queueBadge(99)).toBe('99');
    expect(queueBadge(100)).toBe('99+');
  });
});

describe('pingDotVisible', () => {
  it('is hidden when nobody has pinged', () => {
    expect(pingDotVisible([], 'queue')).toBe(false);
  });

  it('shows on the queue or dashboard tab while a ping is unseen', () => {
    expect(pingDotVisible(['pay-001'], 'queue')).toBe(true);
    expect(pingDotVisible(['pay-001'], 'dashboard')).toBe(true);
  });

  it('is hidden on the PR tab, where the ping is already in view', () => {
    expect(pingDotVisible(['pay-001'], 'pr')).toBe(false);
  });
});

describe('keysActive', () => {
  it('is always on at 900 px and wider, where every column is visible', () => {
    expect(keysActive(true, 'queue')).toBe(true);
    expect(keysActive(true, 'dashboard')).toBe(true);
  });

  it('is on for a phone only on the PR tab, so m and d never act on a hidden PR', () => {
    expect(keysActive(false, 'pr')).toBe(true);
    expect(keysActive(false, 'queue')).toBe(false);
    expect(keysActive(false, 'dashboard')).toBe(false);
  });
});
