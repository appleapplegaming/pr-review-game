// WebSocket layer: parses and rate-limits every client frame, runs the commands against the room
// registry, and broadcasts. It is a thin adapter: it owns sockets, the per-connection rate limit
// and the tick loop, and nothing else.
//
// Trust: a frame is untrusted until validate.ts accepts it. A connection's room and playerId come
// only from its own join or create, never from a frame, so a client cannot act as another player.
// Everything broadcast is a PublicRoomState snapshot, never raw engine state.

import { WebSocket, type RawData } from 'ws';
import type { ClientMsg, Intent, ServerMsg } from '../shared/protocol';
import type { ErrorCode, GameEvent, Phase, PublicRoomState } from '../shared/types';
import { config } from '../shared/config';
import type { Acted, JoinResult, Rooms, RoomClock } from './rooms';
import { parseClientMessage } from './validate';

/** What the hub needs from a socket. fromWebSocket() adapts a ws WebSocket to it. */
export interface Peer {
  send(text: string): void;
  close(): void;
  onMessage(handler: (data: Buffer) => void): void;
  onClose(handler: () => void): void;
}

export interface WsHubOptions {
  rooms: Rooms;
  clock: RoomClock;
  /** Tick loop period. Defaults to shared/config.ts. */
  tickMs?: number;
  /** Per-connection limit. Defaults to shared/config.ts. */
  rateLimit?: { messages: number; windowMs: number };
  /** Largest frame accepted, in bytes. Defaults to shared/config.ts. */
  maxMessageBytes?: number;
  /** Called when a command throws unexpectedly. The client gets SERVER_ERROR either way. */
  onError?: (error: unknown) => void;
}

export interface WsHub {
  /** Starts handling a new socket. Call once per connection. */
  attach(peer: Peer): void;
  /** Stops every tick loop and closes every socket. */
  close(): void;
}

interface Conn {
  peer: Peer;
  open: boolean;
  /** Timestamps of the frames this connection sent in the current window. */
  hits: number[];
  room: string | null;
  playerId: string | null;
}

/** The sockets in one room, plus the room's tick loop and the phase last sent to clients. */
interface RoomLink {
  code: string;
  conns: Set<Conn>;
  lastPhase: Phase;
  /** The pending tick timer, or null when no game is running. */
  timer: number | null;
}

function assertNever(value: never): never {
  throw new Error(`unhandled client message: ${JSON.stringify(value)}`);
}

/** Adapts a ws WebSocket to the Peer the hub uses. */
export function fromWebSocket(socket: WebSocket): Peer {
  // A ws error is always followed by 'close', which the hub handles. Without a listener Node would
  // treat the error as uncaught and crash the server.
  socket.on('error', () => {});
  return {
    send(text) {
      if (socket.readyState === WebSocket.OPEN) socket.send(text);
    },
    close() {
      socket.close();
    },
    onMessage(handler) {
      socket.on('message', (data: RawData) => handler(toBuffer(data)));
    },
    onClose(handler) {
      socket.on('close', () => handler());
    },
  };
}

function toBuffer(data: RawData): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (Array.isArray(data)) return Buffer.concat(data);
  return Buffer.from(data);
}

export function createWsHub(options: WsHubOptions): WsHub {
  const { rooms, clock } = options;
  const tickMs = options.tickMs ?? config.tickMs;
  const rateLimit = options.rateLimit ?? config.rateLimit;
  const maxMessageBytes = options.maxMessageBytes ?? config.maxMessageBytes;
  const onError = options.onError ?? ((error: unknown) => console.error(error));

  const attached = new Set<Conn>();
  const links = new Map<string, RoomLink>();

  // ---- sending -----------------------------------------------------------------------------

  function sendTo(conn: Conn, msg: ServerMsg): void {
    if (conn.open) conn.peer.send(JSON.stringify(msg));
  }

  function sendError(conn: Conn, code: ErrorCode, message: string): void {
    sendTo(conn, { t: 'error', code, message });
  }

  /** Sends one message to every socket in the room. Serialised once, so the room gets the same bytes. */
  function broadcast(link: RoomLink, msg: ServerMsg): void {
    const text = JSON.stringify(msg);
    for (const conn of link.conns) {
      if (conn.open) conn.peer.send(text);
    }
  }

  function sendPostmortem(conn: Conn, code: string): void {
    const report = rooms.postmortem(code);
    if (report !== null) sendTo(conn, { t: 'postmortem', report });
  }

  /** Broadcasts the state, then the events, then the postmortem if the quarter has just ended. */
  function publish(link: RoomLink, state: PublicRoomState, events: GameEvent[]): void {
    broadcast(link, { t: 'state', state });
    for (const event of events) broadcast(link, { t: 'event', event });
    if (state.phase === 'ended' && link.lastPhase !== 'ended') {
      const report = rooms.postmortem(link.code);
      if (report !== null) broadcast(link, { t: 'postmortem', report });
    }
    link.lastPhase = state.phase;
  }

  // ---- rooms and seats -----------------------------------------------------------------------

  function newLink(code: string): RoomLink {
    const link: RoomLink = {
      code,
      conns: new Set(),
      lastPhase: rooms.view(code)?.phase ?? 'lobby',
      timer: null,
    };
    links.set(code, link);
    return link;
  }

  /** Forgets a room's link once nobody is connected and no tick loop is running. */
  function dropIfIdle(link: RoomLink): void {
    if (link.conns.size === 0 && link.timer === null) links.delete(link.code);
  }

  /** Puts the socket into a seat. Any seat it held before is released first. */
  function bind(conn: Conn, code: string, playerId: string): RoomLink {
    const sameSeat = conn.room === code && conn.playerId === playerId;
    if (!sameSeat) leave(conn);
    conn.room = code;
    conn.playerId = playerId;
    const link = links.get(code) ?? newLink(code);
    link.conns.add(conn);
    return link;
  }

  /**
   * Takes the socket out of its seat. The player is marked disconnected only when this was their
   * last open socket, so a second tab does not drop a player who is still connected.
   */
  function leave(conn: Conn): void {
    const { room: code, playerId } = conn;
    if (code === null || playerId === null) return;
    conn.room = null;
    conn.playerId = null;
    const link = links.get(code);
    if (link === undefined) return;
    link.conns.delete(conn);
    const seatStillOpen = [...link.conns].some((other) => other.playerId === playerId);
    if (!seatStillOpen) rooms.disconnect(code, playerId);
    const view = rooms.view(code);
    if (view !== null) publish(link, view, []);
    dropIfIdle(link);
  }

  // ---- tick loop -----------------------------------------------------------------------------

  /** Starts the tick loop if a game is running and no loop is already scheduled. */
  function ensureTicking(link: RoomLink): void {
    if (link.timer !== null) return;
    if (rooms.view(link.code)?.phase !== 'playing') return;
    scheduleTick(link);
  }

  function scheduleTick(link: RoomLink): void {
    link.timer = clock.setTimer(() => {
      link.timer = null;
      runTick(link);
    }, tickMs);
  }

  /** Runs the clock forward. Broadcasts only when the tick changed something, then re-arms unless the game is over. */
  function runTick(link: RoomLink): void {
    const result = rooms.tick(link.code);
    if (!result.ok) {
      // The room is gone (cleaned up), so there is nothing left to tick.
      dropIfIdle(link);
      return;
    }
    if (result.changed) publish(link, result.state, result.events);
    if (result.state.phase === 'playing') {
      scheduleTick(link);
    } else {
      dropIfIdle(link);
    }
  }

  // ---- commands ------------------------------------------------------------------------------

  function joined(conn: Conn, result: JoinResult): void {
    if (!result.ok) {
      sendError(conn, result.code, result.message);
      return;
    }
    // undefined when the room had no link yet, which means nobody has been told the phase.
    const priorPhase = links.get(result.code)?.lastPhase;
    const link = bind(conn, result.code, result.playerId);
    sendTo(conn, {
      t: 'welcome',
      playerId: result.playerId,
      code: result.code,
      serverNow: clock.now(),
    });
    publish(link, result.state, []);
    // A player who arrives after the quarter ended has missed the broadcast, so send it to them.
    // (If the end was seen while others were connected, publish already broadcast it.)
    if (result.state.phase === 'ended' && (priorPhase === undefined || priorPhase === 'ended')) {
      sendPostmortem(conn, result.code);
    }
    ensureTicking(link);
  }

  /** Runs a command for the socket's own seat, then broadcasts the room's state and events. */
  function act(conn: Conn, run: (code: string, playerId: string) => Acted): void {
    const { room: code, playerId } = conn;
    const link = code === null ? undefined : links.get(code);
    if (code === null || playerId === null || link === undefined) {
      sendError(conn, 'NOT_IN_ROOM', 'Join a room first');
      return;
    }

    let result: Acted;
    try {
      result = run(code, playerId);
    } catch (error) {
      // The engine throws when it cannot set up a quarter, for example with a short pool. The room
      // state is unchanged in that case, so reply and carry on.
      onError(error);
      sendError(conn, 'SERVER_ERROR', 'Something went wrong. Try again.');
      return;
    }

    // Broadcast even after a rejection: the clock may have run forward and produced events.
    const view = rooms.view(code);
    if (view !== null) publish(link, result.ok ? result.state : view, result.events);
    if (result.ok) {
      ensureTicking(link);
    } else {
      sendError(conn, result.code, result.message);
    }
  }

  function dispatch(conn: Conn, msg: ClientMsg): void {
    switch (msg.t) {
      case 'create': {
        joined(conn, rooms.create(msg.name));
        return;
      }
      case 'join': {
        joined(conn, rooms.join(msg.code, msg.name, msg.playerId));
        return;
      }
      case 'start': {
        const { minutes } = msg;
        act(conn, (code, playerId) => rooms.start(code, playerId, minutes));
        return;
      }
      case 'rename': {
        const { companyName } = msg;
        act(conn, (code, playerId) => rooms.rename(code, playerId, companyName));
        return;
      }
      case 'playAgain':
        act(conn, (code, playerId) => rooms.playAgain(code, playerId));
        return;
      case 'open':
      case 'merge':
      case 'decline':
      case 'comment':
      case 'ping': {
        const intent: Intent = msg;
        act(conn, (code, playerId) => rooms.intent(code, playerId, intent));
        return;
      }
      default:
        return assertNever(msg);
    }
  }

  // ---- frames --------------------------------------------------------------------------------

  /** Sliding window: true if the frame may go through. Refused frames are not counted. */
  function admit(conn: Conn, now: number): boolean {
    conn.hits = conn.hits.filter((at) => now - at < rateLimit.windowMs);
    if (conn.hits.length >= rateLimit.messages) return false;
    conn.hits.push(now);
    return true;
  }

  function onFrame(conn: Conn, data: Buffer): void {
    if (!conn.open) return;
    if (!admit(conn, clock.now())) {
      sendError(conn, 'RATE_LIMITED', 'Too many messages. Slow down.');
      return;
    }
    if (data.byteLength > maxMessageBytes) {
      sendError(conn, 'BAD_MESSAGE', 'That message is too large.');
      return;
    }
    const msg = parseClientMessage(data.toString('utf8'));
    if (msg === null) {
      sendError(conn, 'BAD_MESSAGE', 'That message is not a valid command.');
      return;
    }
    dispatch(conn, msg);
  }

  // ---- public --------------------------------------------------------------------------------

  return {
    attach(peer) {
      const conn: Conn = { peer, open: true, hits: [], room: null, playerId: null };
      attached.add(conn);
      peer.onMessage((data) => onFrame(conn, data));
      peer.onClose(() => {
        conn.open = false;
        attached.delete(conn);
        leave(conn);
      });
    },
    close() {
      for (const link of links.values()) {
        if (link.timer !== null) clock.clearTimer(link.timer);
        link.timer = null;
      }
      links.clear();
      for (const conn of attached) {
        conn.open = false;
        conn.peer.close();
      }
      attached.clear();
    },
  };
}
