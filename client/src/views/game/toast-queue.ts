// Toast queue. Pure: every function returns new arrays and never mutates its input.
//
// A toast is shown for config.toastMs from the moment it arrives on this tab. The clock is the
// local one, because a toast's lifetime is about how long a person can read it, not game time.

import type { GameEvent } from '../../../../shared/types';
import type { QueuedEvent } from '../../net/store';
import { eventText } from './event-text';

export interface Toast {
  id: number;
  kind: GameEvent['kind'];
  text: string;
  /** Local epoch ms at which the toast stops being shown. */
  dueAt: number;
}

/** True for a comment the local player wrote. They know; only others' comments earn a toast. */
export function isOwnCommentEvent(event: GameEvent, playerId: string | undefined): boolean {
  return playerId !== undefined && event.kind === 'comment' && event.by === playerId;
}

/**
 * Drops the events that should not toast for the local player. Own declines stay, because the
 * toast carries the verdict. The activity feed is unaffected: it reads the full event stream.
 */
export function withoutOwnComments(
  incoming: readonly QueuedEvent[],
  playerId: string | undefined,
): QueuedEvent[] {
  return incoming.filter((q) => !isOwnCommentEvent(q.event, playerId));
}

/** Adds the events that are not queued yet. An id already present is ignored. */
export function addToasts(
  toasts: readonly Toast[],
  incoming: readonly QueuedEvent[],
  now: number,
  ttlMs: number,
  incidentTtlMs: number = ttlMs,
): Toast[] {
  const seen = new Set(toasts.map((t) => t.id));
  const added: Toast[] = [];
  for (const { id, event } of incoming) {
    if (seen.has(id)) continue;
    seen.add(id);
    added.push({
      id,
      kind: event.kind,
      text: eventText(event),
      dueAt: now + (event.kind === 'incident' ? incidentTtlMs : ttlMs),
    });
  }
  return added.length === 0 ? [...toasts] : [...toasts, ...added];
}

/** The toasts still within their lifetime at `now`. A toast is gone at the moment it is due. */
export function liveToasts(toasts: readonly Toast[], now: number): Toast[] {
  return toasts.filter((t) => t.dueAt > now);
}

/** Pushes every due time back by `ms`. Used while the stack is hovered or focused, so it holds still. */
export function holdToasts(toasts: readonly Toast[], ms: number): Toast[] {
  return ms <= 0 ? [...toasts] : toasts.map((t) => ({ ...t, dueAt: t.dueAt + ms }));
}

/**
 * Splits live toasts into the ones to show (at most `max`) and a count of the rest. Incidents take
 * the slots first so a flood of merges cannot hide one. Shown toasts keep their arrival order.
 */
export function visibleToasts(
  live: readonly Toast[],
  max: number,
): { shown: Toast[]; hidden: number } {
  if (live.length <= max) return { shown: [...live], hidden: 0 };
  const ranked = [...live].sort(
    (a, b) => Number(b.kind === 'incident') - Number(a.kind === 'incident') || a.id - b.id,
  );
  const chosen = new Set(ranked.slice(0, max).map((t) => t.id));
  return { shown: live.filter((t) => chosen.has(t.id)), hidden: live.length - max };
}
