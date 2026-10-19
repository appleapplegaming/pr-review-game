// Activity feed history. Pure step function plus a small store-backed log.
//
// The feed keeps its own history instead of reading store.events. Toasts dismiss events from that
// queue as they expire, so the queue cannot be the feed's source. The log lives outside any
// component, so switching phone tabs does not lose it.
//
// The log resets when the quarter changes (room.startedAt) or the session is lost. A new quarter
// starts with an empty feed, and its ids continue from the last one seen, so no old event repeats.

import { config } from '../../../../shared/config';
import { store as defaultStore, type ClientState, type Store } from '../../net/store';
import { eventText } from './event-text';

export interface FeedEntry {
  id: number;
  /** Server epoch ms of the event. */
  at: number;
  kind: string;
  text: string;
}

export interface FeedState {
  /** room.startedAt of the quarter the entries belong to, or null without a room. */
  quarter: number | null;
  /** Highest queue id already recorded. Ids only grow, so anything at or below it is old. */
  lastId: number;
  entries: FeedEntry[];
}

export const EMPTY_FEED: FeedState = { quarter: null, lastId: 0, entries: [] };

/** Folds the current store state into the feed. Returns the same object when nothing changed. */
export function feedStep(prev: FeedState, state: ClientState, max: number): FeedState {
  const quarter = state.session === null || state.room === null ? null : state.room.startedAt;
  const base: FeedState =
    quarter === prev.quarter ? prev : { quarter, lastId: prev.lastId, entries: [] };
  const fresh = state.events.filter((q) => q.id > base.lastId);
  if (fresh.length === 0) return base;

  const added: FeedEntry[] = fresh.map((q) => ({
    id: q.id,
    at: q.event.at,
    kind: q.event.kind,
    text: eventText(q.event),
  }));
  const lastId = Math.max(base.lastId, ...fresh.map((q) => q.id));
  return { quarter, lastId, entries: [...base.entries, ...added].slice(-max) };
}

export interface ActivityLog {
  getEntries(): FeedEntry[];
  subscribe(listener: () => void): () => void;
}

/** A feed log that follows `source` for as long as it lives. */
export function createActivityLog(source: Store = defaultStore): ActivityLog {
  let feed = feedStep(EMPTY_FEED, source.getState(), config.feedMax);
  const listeners = new Set<() => void>();
  source.subscribe(() => {
    const next = feedStep(feed, source.getState(), config.feedMax);
    if (next === feed) return;
    feed = next;
    for (const listener of listeners) listener();
  });
  return {
    getEntries: () => feed.entries,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** The app-wide feed. Created once, so it records from the moment the module loads. */
export const activityLog = createActivityLog();
