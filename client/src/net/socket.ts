// Socket client: connects to /ws, reconnects with backoff, rejoins the stored seat, and feeds the
// store. The socket itself is injected (`connect`), so the logic runs in tests without a browser.
//
// Rules this file keeps:
//  - A frame or event from a socket that is no longer current is ignored. A late close from an old
//    socket never schedules a second reconnect, and only one reconnect timer can be pending.
//  - The backoff resets on welcome, not on open. A server that accepts and then drops is not
//    hammered at the base rate.
//  - Nothing is queued. send() returns false while not open, and the UI disables actions based on
//    store.conn. A dropped create or join is never resent, because that could make a second room.
//    Only the automatic rejoin of a stored seat is sent on reconnect.
//  - The clock offset is measured from the join that produced the welcome, on every reconnect.

import type { ClientMsg, ServerMsg } from '../../../shared/protocol';
import type { ErrorCode } from '../../../shared/types';
import { reconnectDelay } from './backoff';
import { offsetFromWelcome } from './clock';
import { clearSession, loadSession, saveSession, type KeyValueStorage } from './session';
import type { Action, Store } from './store';

/** Path the server accepts WebSocket upgrades on. */
const WS_PATH = '/ws';

/** The WebSocket URL for a page at `location`. Built from the page host, so it works through the dev proxy. */
export function wsUrl(location: { protocol: string; host: string }): string {
  const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${scheme}//${location.host}${WS_PATH}`;
}

/** What the socket client needs from a connection. */
export interface Transport {
  /** Returns false when the frame could not be sent. */
  send(text: string): boolean;
  close(): void;
}

export interface SocketHandlers {
  onOpen(): void;
  onMessage(text: string): void;
  onClose(): void;
}

/** Opens a connection and wires its events to `handlers`. */
export type Connect = (url: string, handlers: SocketHandlers) => Transport;

export interface SocketClientOptions {
  url: string;
  store: Store;
  connect: Connect;
  storage: KeyValueStorage;
  now: () => number;
  /** Uniform numbers in [0, 1). Drives reconnect jitter. */
  random: () => number;
}

export interface SocketClient {
  /** Opens the connection and keeps it open, reconnecting after drops. */
  start(): void;
  /** Closes for good. No reconnect follows. */
  stop(): void;
  /** Tries to connect now instead of waiting for the backoff timer. Also revives a stopped client. */
  retry(): void;
  /** Sends a message. Returns false, and sends nothing, when the socket is not open. */
  send(msg: ClientMsg): boolean;
}

/** The browser implementation of Connect. */
export function browserConnect(url: string, handlers: SocketHandlers): Transport {
  const socket = new WebSocket(url);
  socket.onopen = () => handlers.onOpen();
  socket.onmessage = (event: MessageEvent<unknown>) => {
    if (typeof event.data === 'string') handlers.onMessage(event.data);
  };
  socket.onclose = () => handlers.onClose();
  return {
    send(text) {
      if (socket.readyState !== WebSocket.OPEN) return false;
      socket.send(text);
      return true;
    },
    close() {
      socket.close();
    },
  };
}

/** Errors that say "try again later", not "this seat is invalid". They keep the stored session. */
export function isTransientError(code: ErrorCode): boolean {
  return code === 'RATE_LIMITED' || code === 'SERVER_ERROR';
}

export function createSocketClient(options: SocketClientOptions): SocketClient {
  const { url, store, connect, storage, now, random } = options;

  let started = false;
  let stopped = false;
  let generation = 0;
  /** The connection that is currently allowed to act, or null between connections. */
  let current: { id: number; transport: Transport; open: boolean } | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  /** Consecutive drops since the last welcome. Drives the backoff. */
  let failures = 0;
  /** The last create or join this tab sent, waiting for its welcome. */
  let pending: { sentAt: number; name: string } | null = null;
  /** True while the current connection's join came from the stored session, not from the user. */
  let rejoining = false;

  function dispatch(action: Action): void {
    store.dispatch(action);
  }

  function sendRaw(msg: ClientMsg): boolean {
    if (current === null || !current.open) return false;
    return current.transport.send(JSON.stringify(msg));
  }

  function open(): void {
    const id = ++generation;
    const transport = connect(url, {
      onOpen: () => handleOpen(id),
      onMessage: (text) => handleMessage(id, text),
      onClose: () => handleClose(id),
    });
    current = { id, transport, open: false };
  }

  function handleOpen(id: number): void {
    if (current === null || current.id !== id) return;
    current.open = true;
    dispatch({ type: 'conn', conn: 'open' });

    const session = loadSession(storage);
    if (session === null) return;
    const join: ClientMsg = {
      t: 'join',
      code: session.code,
      name: session.name,
      playerId: session.playerId,
    };
    pending = { sentAt: now(), name: session.name };
    rejoining = true;
    sendRaw(join);
  }

  function handleMessage(id: number, text: string): void {
    if (current === null || current.id !== id) return;
    const msg = parseServerMsg(text);
    if (msg === null) return;

    if (msg.t === 'welcome') {
      const receivedAt = now();
      const clockOffset = offsetFromWelcome({
        serverNow: msg.serverNow,
        sentAt: pending?.sentAt ?? receivedAt,
        receivedAt,
      });
      const name = pending?.name ?? loadSession(storage)?.name ?? '';
      saveSession(storage, { playerId: msg.playerId, code: msg.code, name });
      pending = null;
      rejoining = false;
      failures = 0;
      dispatch({ type: 'welcome', playerId: msg.playerId, code: msg.code, clockOffset });
      return;
    }

    if (msg.t === 'error') {
      if (rejoining && !isTransientError(msg.code)) {
        // The seat can never be valid (room gone, name or seat refused). Stop retrying it on every
        // reload. Transient errors keep the seat so a later reload can still rejoin.
        clearSession(storage);
        dispatch({ type: 'sessionLost' });
      }
      rejoining = false;
      pending = null;
    }

    dispatch({ type: 'server', msg });
  }

  function handleClose(id: number): void {
    if (current === null || current.id !== id) return;
    current = null;
    pending = null;
    rejoining = false;
    if (stopped) {
      dispatch({ type: 'conn', conn: 'closed' });
      return;
    }
    dispatch({ type: 'conn', conn: 'reconnecting' });
    scheduleReconnect();
  }

  function scheduleReconnect(): void {
    if (reconnectTimer !== null) return;
    const delay = reconnectDelay(failures, random);
    failures += 1;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      if (!stopped) open();
    }, delay);
  }

  return {
    start() {
      if (started) return;
      started = true;
      stopped = false;
      dispatch({ type: 'conn', conn: 'connecting' });
      open();
    },

    stop() {
      stopped = true;
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      const socket = current;
      current = null;
      pending = null;
      rejoining = false;
      socket?.transport.close();
      dispatch({ type: 'conn', conn: 'closed' });
    },

    retry() {
      if (!started || current !== null) return;
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      stopped = false;
      failures = 0;
      dispatch({ type: 'conn', conn: 'connecting' });
      open();
    },

    send(msg) {
      if (current === null || !current.open) return false;
      if (msg.t === 'create') pending = { sentAt: now(), name: msg.name };
      if (msg.t === 'join') pending = { sentAt: now(), name: msg.name };
      rejoining = false;
      return sendRaw(msg);
    },
  };
}

const SERVER_TYPES: ReadonlySet<string> = new Set([
  'welcome',
  'state',
  'event',
  'postmortem',
  'error',
]);

/** Parses one frame. Returns null for anything that is not a known server message. */
function parseServerMsg(text: string): ServerMsg | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const t = (value as { t?: unknown }).t;
  if (typeof t !== 'string' || !SERVER_TYPES.has(t)) return null;
  // The server validates what it sends. This check only stops a stray frame from reaching the store.
  return value as ServerMsg;
}
