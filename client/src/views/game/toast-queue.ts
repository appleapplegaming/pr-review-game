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

/** Adds the events that are not queued yet. An id already present is ignored. */
export function addToasts(
  toasts: readonly Toast[],
  incoming: readonly QueuedEvent[],
  now: number,
  ttlMs: number,
): Toast[] {
  const seen = new Set(toasts.map((t) => t.id));
  const added: Toast[] = [];
  for (const { id, event } of incoming) {
    if (seen.has(id)) continue;
    seen.add(id);
    added.push({ id, kind: event.kind, text: eventText(event), dueAt: now + ttlMs });
  }
  return added.length === 0 ? [...toasts] : [...toasts, ...added];
}

/** The toasts still within their lifetime at `now`. A toast is gone at the moment it is due. */
export function liveToasts(toasts: readonly Toast[], now: number): Toast[] {
  return toasts.filter((t) => t.dueAt > now);
}
