import { describe, expect, it } from 'vitest';
import type { QueuedEvent } from '../../client/src/net/store';
import {
  addToasts,
  isOwnCommentEvent,
  withoutOwnComments,
  holdToasts,
  liveToasts,
  visibleToasts,
} from '../../client/src/views/game/toast-queue';

const incident = (id: number, text: string): QueuedEvent => ({
  id,
  event: { kind: 'incident', bugType: 'money', text, at: 0 },
});

describe('addToasts', () => {
  it('adds each incoming event with an expiry ttl after now', () => {
    const toasts = addToasts([], [incident(1, 'A'), incident(2, 'B')], 1_000, 4_000);
    expect(toasts.map((t) => [t.id, t.text, t.dueAt])).toEqual([
      [1, 'A', 5_000],
      [2, 'B', 5_000],
    ]);
  });

  it('does not add an event twice when the same id arrives again', () => {
    const first = addToasts([], [incident(1, 'A')], 1_000, 4_000);
    const second = addToasts(first, [incident(1, 'A')], 2_000, 4_000);
    expect(second).toHaveLength(1);
    expect(second[0]?.dueAt).toBe(5_000);
  });

  it('keeps the existing toasts when new ones arrive', () => {
    const first = addToasts([], [incident(1, 'A')], 1_000, 4_000);
    const second = addToasts(first, [incident(2, 'B')], 2_000, 4_000);
    expect(second.map((t) => t.id)).toEqual([1, 2]);
  });
});

describe('liveToasts', () => {
  it('keeps a toast for its whole 4 s lifetime', () => {
    const toasts = addToasts([], [incident(1, 'A')], 1_000, 4_000);
    expect(liveToasts(toasts, 1_000)).toHaveLength(1);
    expect(liveToasts(toasts, 4_999)).toHaveLength(1);
  });

  it('drops a toast exactly when its time is up', () => {
    const toasts = addToasts([], [incident(1, 'A')], 1_000, 4_000);
    expect(liveToasts(toasts, 5_000)).toEqual([]);
  });

  it('expires toasts independently of each other', () => {
    const early = addToasts([], [incident(1, 'A')], 0, 4_000);
    const both = addToasts(early, [incident(2, 'B')], 3_000, 4_000);
    expect(liveToasts(both, 4_500).map((t) => t.id)).toEqual([2]);
  });
});

describe('incident lifetime', () => {
  it('keeps incident toasts longer than the rest', () => {
    const merge: QueuedEvent = {
      id: 2,
      event: { kind: 'decline', prId: 'p', title: 'T', by: 'x', at: 0 } as never,
    };
    const toasts = addToasts([], [incident(1, 'A'), merge], 0, 4_000, 8_000);
    expect(toasts.map((t) => t.dueAt)).toEqual([8_000, 4_000]);
  });
});

describe('holdToasts', () => {
  it('pushes every due time back', () => {
    const toasts = addToasts([], [incident(1, 'A')], 0, 4_000);
    expect(holdToasts(toasts, 250)[0]?.dueAt).toBe(4_250);
  });
});

describe('visibleToasts', () => {
  const many = addToasts(
    [],
    [1, 2, 3, 4, 5].map((n) => incident(n, String(n))),
    0,
    4_000,
  );
  it('shows at most max and counts the rest', () => {
    const { shown, hidden } = visibleToasts(many, 3);
    expect(shown.map((t) => t.id)).toEqual([1, 2, 3]);
    expect(hidden).toBe(2);
  });
  it('shows everything when it fits', () => {
    expect(visibleToasts(many.slice(0, 2), 3).hidden).toBe(0);
  });
});

const comment = (id: number, by: string): QueuedEvent => ({
  id,
  event: { kind: 'comment', prId: 'pr1', prTitle: 'T', by, byName: by, onLine: false, at: 0 },
});
const decline = (id: number, by: string): QueuedEvent => ({
  id,
  event: {
    kind: 'decline',
    prId: 'pr1',
    prTitle: 'T',
    by,
    byName: by,
    bugType: 'money',
    verdict: 'clean',
    at: 0,
  },
});

describe('own-action toasts', () => {
  it('flags only comment events by the local player', () => {
    expect(isOwnCommentEvent(comment(1, 'me').event, 'me')).toBe(true);
    expect(isOwnCommentEvent(comment(1, 'you').event, 'me')).toBe(false);
    expect(isOwnCommentEvent(decline(1, 'me').event, 'me')).toBe(false);
    expect(isOwnCommentEvent(comment(1, 'me').event, undefined)).toBe(false);
  });

  it('drops own comments but keeps own declines and others events', () => {
    const kept = withoutOwnComments(
      [comment(1, 'me'), comment(2, 'you'), decline(3, 'me'), incident(4, 'X')],
      'me',
    );
    expect(kept.map((q) => q.id)).toEqual([2, 3, 4]);
  });

  it('keeps everything when there is no local player', () => {
    expect(withoutOwnComments([comment(1, 'me')], undefined)).toHaveLength(1);
  });
});
