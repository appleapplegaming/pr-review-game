// Pings the player has not looked at yet, for the dot on the PR tab. Pure fold plus a small tracker.
//
// Like the activity log, this follows the store directly and not the toast queue: Toasts dismisses
// each event as soon as it shows, so the queue cannot be the source. A ping counts from the moment
// it arrives, even when its toast has already gone. The tracker is cleared by GameScreen when the
// player is on the PR tab (or on a wide screen, where the PR is always in view).

import type { ClientState, Store } from '../../net/store';
import { store as defaultStore } from '../../net/store';

export interface PingState {
  /** room.startedAt of the quarter the list belongs to, or null without a room. */
  quarter: number | null;
  /** Highest queue id already read. Ids only grow, so anything at or below it is old. */
  lastId: number;
  /** PR ids with a ping the player has not seen, each listed once, oldest first. */
  unseen: string[];
}

export const NO_PINGS: PingState = { quarter: null, lastId: 0, unseen: [] };

/** Folds the store state into the ping list. Returns the same object when nothing changed. */
export function pingStep(prev: PingState, state: ClientState): PingState {
  const quarter = state.session === null || state.room === null ? null : state.room.startedAt;
  const base: PingState =
    quarter === prev.quarter ? prev : { quarter, lastId: prev.lastId, unseen: [] };
  const fresh = state.events.filter((q) => q.id > base.lastId);
  if (fresh.length === 0) return base;

  let unseen = base.unseen;
  for (const { event } of fresh) {
    if (event.kind === 'ping' && !unseen.includes(event.prId)) {
      unseen = [...unseen, event.prId];
    }
  }
  const lastId = Math.max(base.lastId, ...fresh.map((q) => q.id));
  return { quarter, lastId, unseen };
}

/** The same state with nothing unseen. Returns the input when there is nothing to clear. */
export function clearedPings(state: PingState): PingState {
  if (state.unseen.length === 0) return state;
  return { ...state, unseen: [] };
}

export interface PingTracker {
  getState(): PingState;
  subscribe(listener: () => void): () => void;
  clear(): void;
}

/** A tracker that follows `source` for as long as it lives. */
export function createPingTracker(source: Store = defaultStore): PingTracker {
  let pings = pingStep(NO_PINGS, source.getState());
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) listener();
  };
  source.subscribe(() => {
    const next = pingStep(pings, source.getState());
    if (next === pings) return;
    pings = next;
    notify();
  });
  return {
    getState: () => pings,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    clear() {
      const next = clearedPings(pings);
      if (next === pings) return;
      pings = next;
      notify();
    },
  };
}

/** The app-wide tracker. Created once, so it records from the moment the module loads. */
export const pingTracker = createPingTracker();
