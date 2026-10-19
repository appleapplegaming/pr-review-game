import { describe, expect, it } from 'vitest';
import type { QueuedEvent } from '../../client/src/net/store';
import { addToasts, liveToasts } from '../../client/src/views/game/toast-queue';

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
