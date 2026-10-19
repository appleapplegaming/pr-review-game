// Subscribes a component to a slice of the store. Views call this instead of touching the store.
//
// The selector must return a stable value: a primitive, or a reference that the reducer keeps
// between unrelated actions. A selector that builds a new object or array on every call would
// re-render forever. Derive such values in render, from the selected fields, instead.

import { useSyncExternalStore } from 'preact/compat';
import { store as defaultStore, type ClientState, type Store } from './store';

export function useStore<T>(select: (state: ClientState) => T, source: Store = defaultStore): T {
  return useSyncExternalStore(source.subscribe, () => select(source.getState()));
}
