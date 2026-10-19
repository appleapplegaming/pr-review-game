// Client store: everything the UI reads about the server connection and the room.
//
// Shape (ClientState):
//   conn        'connecting' | 'open' | 'reconnecting' | 'closed'. The socket's status. Read this to
//               disable actions while not open. Sending while not open is refused (see socket.ts).
//   session     { playerId, code } | null. Set on welcome. This is "who am I, where am I seated".
//               Cleared by sessionLost when the room no longer exists.
//   clockOffset server time minus local time, in ms. Set on every welcome. Use serverTime().
//   room        the latest PublicRoomState snapshot, or null before the first one. Kept through a
//               disconnect, so the UI can keep showing the room while it reconnects.
//   postmortem  the end-of-quarter report, or null. Cleared by any state that is not 'ended', so
//               "play again" starts clean.
//   events      a queue of { id, event } toasts, capped at config.eventQueueMax (oldest dropped).
//               Consumers show each entry and then dispatch dismissEvent(id).
//   error       the latest server error as { seq, code, message }, or null. Errors carry no request
//               id, so a consumer that acts on one matches by `seq` (new value = new error) and code.
//
// Everything is plain data. `reduce` is pure; the socket client is the only writer.
// Selectors used by several views live here (selectMe, selectIsHost) so views do not re-derive them.

import type {
  ErrorCode,
  GameEvent,
  Postmortem,
  PublicPlayer,
  PublicRoomState,
} from '../../../shared/types';
import type { ServerMsg } from '../../../shared/protocol';
import { config } from '../../../shared/config';
import { serverTimeFrom } from './clock';

export type ConnState = 'connecting' | 'open' | 'reconnecting' | 'closed';

export interface Session {
  playerId: string;
  code: string;
}

export interface QueuedEvent {
  id: number;
  event: GameEvent;
}

export interface ServerError {
  seq: number;
  code: ErrorCode;
  message: string;
}

export interface ClientState {
  conn: ConnState;
  session: Session | null;
  clockOffset: number;
  room: PublicRoomState | null;
  postmortem: Postmortem | null;
  events: QueuedEvent[];
  nextEventId: number;
  error: ServerError | null;
  errorSeq: number;
}

export type Action =
  | { type: 'conn'; conn: ConnState }
  | { type: 'welcome'; playerId: string; code: string; clockOffset: number }
  | { type: 'sessionLost' }
  | { type: 'server'; msg: Exclude<ServerMsg, { t: 'welcome' }> }
  | { type: 'dismissEvent'; id: number }
  | { type: 'clearError' };

export function initialState(): ClientState {
  return {
    conn: 'connecting',
    session: null,
    clockOffset: 0,
    room: null,
    postmortem: null,
    events: [],
    nextEventId: 1,
    error: null,
    errorSeq: 0,
  };
}

/** Applies one action. Pure: returns a new state and never mutates the old one. */
export function reduce(state: ClientState, action: Action): ClientState {
  switch (action.type) {
    case 'conn':
      return { ...state, conn: action.conn };

    case 'welcome':
      return {
        ...state,
        session: { playerId: action.playerId, code: action.code },
        clockOffset: action.clockOffset,
      };

    case 'sessionLost':
      return { ...state, session: null, room: null, postmortem: null };

    case 'dismissEvent':
      return { ...state, events: state.events.filter((q) => q.id !== action.id) };

    case 'clearError':
      return { ...state, error: null };

    case 'server':
      return reduceServer(state, action.msg);
  }
}

function reduceServer(state: ClientState, msg: Exclude<ServerMsg, { t: 'welcome' }>): ClientState {
  switch (msg.t) {
    case 'state':
      return {
        ...state,
        room: msg.state,
        postmortem: msg.state.phase === 'ended' ? state.postmortem : null,
      };

    case 'event': {
      const queued: QueuedEvent = { id: state.nextEventId, event: msg.event };
      const events = [...state.events, queued].slice(-config.eventQueueMax);
      return { ...state, events, nextEventId: state.nextEventId + 1 };
    }

    case 'postmortem':
      return { ...state, postmortem: msg.report };

    case 'error':
      return {
        ...state,
        error: { seq: state.errorSeq + 1, code: msg.code, message: msg.message },
        errorSeq: state.errorSeq + 1,
      };
  }
}

// ---- selectors -----------------------------------------------------------------------------

/** This tab's player in the room's player list, or null when not seated or no snapshot yet. */
export function selectMe(state: ClientState): PublicPlayer | null {
  const playerId = state.session?.playerId;
  if (playerId === undefined || state.room === null) return null;
  return state.room.players.find((p) => p.id === playerId) ?? null;
}

export function selectIsHost(state: ClientState): boolean {
  const playerId = state.session?.playerId;
  return playerId !== undefined && state.room !== null && state.room.hostId === playerId;
}

// ---- store ---------------------------------------------------------------------------------

export interface Store {
  getState(): ClientState;
  dispatch(action: Action): void;
  subscribe(listener: () => void): () => void;
}

export function createStore(initial: ClientState = initialState()): Store {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    getState: () => state,
    dispatch(action) {
      state = reduce(state, action);
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** The app-wide store. The socket client writes to it; views read it through useStore(). */
export const store = createStore();

/** The server's current time, from the local clock and the offset measured on the last welcome. */
export function serverTime(s: Store = store): number {
  return serverTimeFrom(s.getState().clockOffset, Date.now());
}
