// The seat this tab holds, kept in sessionStorage so a refresh rejoins the same seat.
//
// Stored as one JSON value under SESSION_KEY: { playerId, code, name }. `join` needs the code and
// the name as well as the playerId, so all three are kept. Every read and write is guarded, because
// sessionStorage can throw (private windows, blocked storage) and the game must still work without it.

export const SESSION_KEY = 'shipit.session';

export interface StoredSession {
  playerId: string;
  code: string;
  name: string;
}

/** The part of Storage this module uses. sessionStorage satisfies it; tests pass a Map-backed fake. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function isStoredSession(value: unknown): value is StoredSession {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.playerId === 'string' && typeof v.code === 'string' && typeof v.name === 'string';
}

export function loadSession(storage: KeyValueStorage): StoredSession | null {
  try {
    const raw = storage.getItem(SESSION_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    return isStoredSession(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveSession(storage: KeyValueStorage, session: StoredSession): void {
  try {
    storage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // Storage is unavailable. The game still works, but a refresh will not rejoin the seat.
  }
}

export function clearSession(storage: KeyValueStorage): void {
  try {
    storage.removeItem(SESSION_KEY);
  } catch {
    // Nothing stored, or storage is unavailable. Either way there is nothing to clear.
  }
}

/** sessionStorage when it can be used, otherwise an in-memory stand-in for this page load. */
export function browserStorage(): KeyValueStorage {
  try {
    const probe = sessionStorage;
    probe.getItem(SESSION_KEY);
    return probe;
  } catch {
    const memory = new Map<string, string>();
    return {
      getItem: (key) => memory.get(key) ?? null,
      setItem: (key, value) => {
        memory.set(key, value);
      },
      removeItem: (key) => {
        memory.delete(key);
      },
    };
  }
}
