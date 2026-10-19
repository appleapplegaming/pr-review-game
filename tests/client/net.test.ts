import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServerMsg } from '../../shared/protocol';
import type { PublicRoomState, Postmortem, GameEvent } from '../../shared/types';
import { config } from '../../shared/config';
import { reconnectDelay } from '../../client/src/net/backoff';
import { offsetFromWelcome, serverTimeFrom } from '../../client/src/net/clock';
import {
  SESSION_KEY,
  clearSession,
  loadSession,
  saveSession,
  type KeyValueStorage,
} from '../../client/src/net/session';
import { createStore, reduce, serverTime, type Store } from '../../client/src/net/store';
import {
  createSocketClient,
  wsUrl,
  type SocketHandlers,
  type Transport,
} from '../../client/src/net/socket';

// ---- helpers -------------------------------------------------------------------------------

class FakeTransport implements Transport {
  readonly sent: string[] = [];
  closed = false;

  constructor(
    readonly url: string,
    readonly handlers: SocketHandlers,
  ) {}

  send(text: string): boolean {
    if (this.closed) return false;
    this.sent.push(text);
    return true;
  }

  close(): void {
    this.closed = true;
  }

  /** What the browser does when the connection opens. */
  open(): void {
    this.handlers.onOpen();
  }

  /** What the browser does when a frame arrives. */
  receive(msg: ServerMsg): void {
    this.handlers.onMessage(JSON.stringify(msg));
  }

  /** What the browser does when the connection drops. */
  drop(): void {
    this.handlers.onClose();
  }

  sentMessages(): unknown[] {
    return this.sent.map((text) => JSON.parse(text) as unknown);
  }
}

function memoryStorage(initial: Record<string, string> = {}): KeyValueStorage & {
  map: Map<string, string>;
} {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

const ROOM: PublicRoomState = {
  code: 'ABCD',
  companyName: 'Acme',
  phase: 'lobby',
  hostId: 'p1',
  players: [{ id: 'p1', name: 'Sara', isHost: true, connected: true, joinedAt: 0 }],
  startedAt: null,
  endsAt: null,
  totalPrs: 0,
  prs: [],
  metrics: { value: 10_000_000, downtimeMinutes: 0, uptime: 1, breaches: 0 },
  bankrupt: false,
};

const EVENT: GameEvent = { kind: 'incident', bugType: 'money', text: 'Oops', at: 1 };

const POSTMORTEM = { companyName: 'Acme' } as unknown as Postmortem;

interface Harness {
  store: Store;
  sockets: FakeTransport[];
  storage: ReturnType<typeof memoryStorage>;
  net: ReturnType<typeof createSocketClient>;
}

function setup(storageInitial: Record<string, string> = {}): Harness {
  const store = createStore();
  const sockets: FakeTransport[] = [];
  const storage = memoryStorage(storageInitial);
  const net = createSocketClient({
    url: 'ws://localhost:5173/ws',
    store,
    connect: (url, handlers) => {
      const socket = new FakeTransport(url, handlers);
      sockets.push(socket);
      return socket;
    },
    storage,
    now: () => Date.now(),
    random: () => 0,
  });
  return { store, sockets, storage, net };
}

const RECONNECT_FIRST = reconnectDelay(0, () => 0);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
});

afterEach(() => {
  vi.useRealTimers();
});

// ---- backoff -------------------------------------------------------------------------------

describe('reconnectDelay', () => {
  it('draws the first delay from the jitter band below the base ceiling', () => {
    expect(reconnectDelay(0, () => 0)).toBe(config.reconnectBaseMs);
    expect(reconnectDelay(0, () => 1)).toBe(config.reconnectBaseMs * (1 - config.reconnectJitter));
  });

  it('doubles the ceiling per attempt until the cap', () => {
    expect(reconnectDelay(1, () => 0)).toBe(1000);
    expect(reconnectDelay(2, () => 0)).toBe(2000);
    expect(reconnectDelay(3, () => 0)).toBe(4000);
  });

  it('never exceeds the cap, even after many attempts', () => {
    expect(reconnectDelay(50, () => 0)).toBe(config.reconnectMaxMs);
    expect(reconnectDelay(10_000, () => 0)).toBe(config.reconnectMaxMs);
    expect(Number.isFinite(reconnectDelay(10_000, () => 1))).toBe(true);
  });
});

// ---- clock ---------------------------------------------------------------------------------

describe('clock offset', () => {
  it('measures the offset at the midpoint of the join round trip', () => {
    // Sent at 1000, welcome back at 1100, so the server read its clock near 1050.
    expect(offsetFromWelcome({ serverNow: 5000, sentAt: 1000, receivedAt: 1100 })).toBe(3950);
  });

  it('equals serverNow minus local time when the round trip is instant', () => {
    expect(offsetFromWelcome({ serverNow: 4000, sentAt: 1000, receivedAt: 1000 })).toBe(3000);
  });

  it('is negative when the server clock is behind', () => {
    expect(offsetFromWelcome({ serverNow: 500, sentAt: 1000, receivedAt: 1000 })).toBe(-500);
  });

  it('returns a whole number of milliseconds', () => {
    expect(Number.isInteger(offsetFromWelcome({ serverNow: 10, sentAt: 1, receivedAt: 2 }))).toBe(
      true,
    );
  });

  it('serverTimeFrom adds the offset to the local time', () => {
    expect(serverTimeFrom(3000, 10_000)).toBe(13_000);
  });

  it('serverTime() is Date.now() plus the store offset, and is Date.now() before any welcome', () => {
    const store = createStore();
    expect(serverTime(store)).toBe(Date.now());
    store.dispatch({ type: 'welcome', playerId: 'p1', code: 'ABCD', clockOffset: 3000 });
    expect(serverTime(store)).toBe(Date.now() + 3000);
  });
});

// ---- session storage -----------------------------------------------------------------------

describe('session storage', () => {
  it('round-trips a session through the key', () => {
    const storage = memoryStorage();
    saveSession(storage, { playerId: 'p1', code: 'ABCD', name: 'Sara' });
    expect(storage.map.has(SESSION_KEY)).toBe(true);
    expect(loadSession(storage)).toEqual({ playerId: 'p1', code: 'ABCD', name: 'Sara' });
  });

  it('returns null for a missing, corrupt or wrongly shaped value', () => {
    expect(loadSession(memoryStorage())).toBeNull();
    expect(loadSession(memoryStorage({ [SESSION_KEY]: '{not json' }))).toBeNull();
    expect(loadSession(memoryStorage({ [SESSION_KEY]: '{"playerId":1}' }))).toBeNull();
  });

  it('clearSession removes the stored session', () => {
    const storage = memoryStorage();
    saveSession(storage, { playerId: 'p1', code: 'ABCD', name: 'Sara' });
    clearSession(storage);
    expect(loadSession(storage)).toBeNull();
  });

  it('never throws when the storage itself throws', () => {
    const broken: KeyValueStorage = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    };
    expect(loadSession(broken)).toBeNull();
    expect(() => saveSession(broken, { playerId: 'p1', code: 'ABCD', name: 'Sara' })).not.toThrow();
    expect(() => clearSession(broken)).not.toThrow();
  });
});

// ---- store reducer -------------------------------------------------------------------------

describe('store reducer', () => {
  const initial = createStore().getState();

  it('starts connecting, with no session, no room and an offset of zero', () => {
    expect(initial).toMatchObject({
      conn: 'connecting',
      session: null,
      clockOffset: 0,
      room: null,
      postmortem: null,
      events: [],
      error: null,
    });
  });

  it('welcome sets the session and the offset without touching the room', () => {
    const withRoom = reduce(initial, { type: 'server', msg: { t: 'state', state: ROOM } });
    const next = reduce(withRoom, {
      type: 'welcome',
      playerId: 'p1',
      code: 'ABCD',
      clockOffset: 42,
    });
    expect(next.session).toEqual({ playerId: 'p1', code: 'ABCD' });
    expect(next.clockOffset).toBe(42);
    expect(next.room).toBe(ROOM);
  });

  it('keeps the last room through a disconnect', () => {
    const withRoom = reduce(initial, { type: 'server', msg: { t: 'state', state: ROOM } });
    const dropped = reduce(withRoom, { type: 'conn', conn: 'reconnecting' });
    expect(dropped.conn).toBe('reconnecting');
    expect(dropped.room).toBe(ROOM);
  });

  it('a non-ended state clears a stale postmortem, so play again starts clean', () => {
    const ended = reduce(initial, { type: 'server', msg: { t: 'postmortem', report: POSTMORTEM } });
    expect(ended.postmortem).toBe(POSTMORTEM);
    const lobby = reduce(ended, { type: 'server', msg: { t: 'state', state: ROOM } });
    expect(lobby.postmortem).toBeNull();
  });

  it('an ended state keeps the postmortem that follows it', () => {
    const endedRoom: PublicRoomState = { ...ROOM, phase: 'ended' };
    const afterState = reduce(initial, { type: 'server', msg: { t: 'state', state: endedRoom } });
    const afterReport = reduce(afterState, {
      type: 'server',
      msg: { t: 'postmortem', report: POSTMORTEM },
    });
    expect(afterReport.postmortem).toBe(POSTMORTEM);
  });

  it('queues events with increasing ids', () => {
    let s = reduce(initial, { type: 'server', msg: { t: 'event', event: EVENT } });
    s = reduce(s, { type: 'server', msg: { t: 'event', event: EVENT } });
    expect(s.events.map((q) => q.id)).toEqual([1, 2]);
    expect(s.events[0]?.event).toEqual(EVENT);
  });

  it('caps the event queue by dropping the oldest entries', () => {
    let s = initial;
    for (let i = 0; i < config.eventQueueMax + 3; i++) {
      s = reduce(s, { type: 'server', msg: { t: 'event', event: EVENT } });
    }
    expect(s.events).toHaveLength(config.eventQueueMax);
    expect(s.events[0]?.id).toBe(4);
    expect(s.events.at(-1)?.id).toBe(config.eventQueueMax + 3);
  });

  it('dismissEvent removes only the named event', () => {
    let s = reduce(initial, { type: 'server', msg: { t: 'event', event: EVENT } });
    s = reduce(s, { type: 'server', msg: { t: 'event', event: EVENT } });
    s = reduce(s, { type: 'dismissEvent', id: 1 });
    expect(s.events.map((q) => q.id)).toEqual([2]);
  });

  it('gives each server error a new seq, and clearError removes it', () => {
    let s = reduce(initial, {
      type: 'server',
      msg: { t: 'error', code: 'NOT_HOST', message: 'Only the host can start' },
    });
    expect(s.error).toEqual({ seq: 1, code: 'NOT_HOST', message: 'Only the host can start' });
    s = reduce(s, {
      type: 'server',
      msg: { t: 'error', code: 'NOT_HOST', message: 'Only the host can start' },
    });
    expect(s.error?.seq).toBe(2);
    s = reduce(s, { type: 'clearError' });
    expect(s.error).toBeNull();
  });

  it('sessionLost forgets the seat, the room and the postmortem', () => {
    let s = reduce(initial, {
      type: 'welcome',
      playerId: 'p1',
      code: 'ABCD',
      clockOffset: 0,
    });
    s = reduce(s, { type: 'server', msg: { t: 'state', state: ROOM } });
    s = reduce(s, { type: 'sessionLost' });
    expect(s.session).toBeNull();
    expect(s.room).toBeNull();
    expect(s.postmortem).toBeNull();
  });
});

describe('store subscriptions', () => {
  it('notifies listeners on dispatch and stops after unsubscribe', () => {
    const store = createStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.dispatch({ type: 'conn', conn: 'open' });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getState().conn).toBe('open');
    unsubscribe();
    store.dispatch({ type: 'conn', conn: 'closed' });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

// ---- socket client -------------------------------------------------------------------------

describe('wsUrl', () => {
  it('uses ws for http pages and wss for https, on the page host, at /ws', () => {
    expect(wsUrl({ protocol: 'http:', host: 'localhost:5173' })).toBe('ws://localhost:5173/ws');
    expect(wsUrl({ protocol: 'https:', host: 'ship.example' })).toBe('wss://ship.example/ws');
  });
});

describe('socket client', () => {
  it('connects on start and reports open once the socket opens', () => {
    const { net, sockets, store } = setup();
    net.start();
    expect(sockets).toHaveLength(1);
    expect(store.getState().conn).toBe('connecting');
    sockets[0]?.open();
    expect(store.getState().conn).toBe('open');
  });

  it('sends nothing on open when there is no stored session', () => {
    const { net, sockets } = setup();
    net.start();
    sockets[0]?.open();
    expect(sockets[0]?.sent).toEqual([]);
  });

  it('send returns false and sends nothing while the socket is not open', () => {
    const { net, sockets } = setup();
    net.start();
    expect(net.send({ t: 'create', name: 'Sara' })).toBe(false);
    expect(sockets[0]?.sent).toEqual([]);
  });

  it('a welcome stores the seat and sets the clock offset from the join round trip', () => {
    const { net, sockets, store, storage } = setup();
    net.start();
    sockets[0]?.open();
    expect(net.send({ t: 'create', name: 'Sara' })).toBe(true);
    vi.setSystemTime(1_000_100); // the welcome arrives 100 ms after the create was sent
    sockets[0]?.receive({ t: 'welcome', playerId: 'p1', code: 'ABCD', serverNow: 1_000_050 });

    expect(store.getState().session).toEqual({ playerId: 'p1', code: 'ABCD' });
    expect(store.getState().clockOffset).toBe(0);
    expect(loadSession(storage)).toEqual({ playerId: 'p1', code: 'ABCD', name: 'Sara' });
  });

  it('after a drop, reconnects and sends join with the stored playerId, code and name', () => {
    const { net, sockets, store, storage } = setup();
    net.start();
    sockets[0]?.open();
    net.send({ t: 'join', code: 'ABCD', name: 'Sara' });
    sockets[0]?.receive({ t: 'welcome', playerId: 'p1', code: 'ABCD', serverNow: 1_000_000 });

    sockets[0]?.drop();
    expect(store.getState().conn).toBe('reconnecting');
    expect(loadSession(storage)).toEqual({ playerId: 'p1', code: 'ABCD', name: 'Sara' });

    vi.advanceTimersByTime(RECONNECT_FIRST);
    expect(sockets).toHaveLength(2);
    sockets[1]?.open();
    expect(store.getState().conn).toBe('open');
    expect(sockets[1]?.sentMessages()).toEqual([
      { t: 'join', code: 'ABCD', name: 'Sara', playerId: 'p1' },
    ]);
  });

  it('a page refresh rejoins the stored seat as soon as the socket opens', () => {
    const { net, sockets } = setup({
      [SESSION_KEY]: JSON.stringify({ playerId: 'p9', code: 'WXYZ', name: 'Joe' }),
    });
    net.start();
    sockets[0]?.open();
    expect(sockets[0]?.sentMessages()).toEqual([
      { t: 'join', code: 'WXYZ', name: 'Joe', playerId: 'p9' },
    ]);
  });

  it('a stale ROOM_NOT_FOUND during auto-rejoin clears the session so refreshes stop looping', () => {
    const { net, sockets, store, storage } = setup({
      [SESSION_KEY]: JSON.stringify({ playerId: 'p9', code: 'WXYZ', name: 'Joe' }),
    });
    net.start();
    sockets[0]?.open();
    sockets[0]?.receive({ t: 'error', code: 'ROOM_NOT_FOUND', message: 'No room has that code' });
    expect(loadSession(storage)).toBeNull();
    expect(store.getState().session).toBeNull();
    expect(store.getState().error?.code).toBe('ROOM_NOT_FOUND');
  });

  it('after a drop before welcome, does not resend create, so no second room is made', () => {
    const { net, sockets } = setup();
    net.start();
    sockets[0]?.open();
    net.send({ t: 'create', name: 'Sara' });
    sockets[0]?.drop();
    vi.advanceTimersByTime(RECONNECT_FIRST);
    sockets[1]?.open();
    expect(sockets[1]?.sent).toEqual([]);
  });

  it('retries with a longer delay until a welcome arrives, then resets the backoff', () => {
    const { net, sockets } = setup({
      [SESSION_KEY]: JSON.stringify({ playerId: 'p9', code: 'WXYZ', name: 'Joe' }),
    });
    net.start();
    sockets[0]?.open();
    sockets[0]?.drop(); // attempt 0: 500 ms
    vi.advanceTimersByTime(RECONNECT_FIRST);
    expect(sockets).toHaveLength(2);

    sockets[1]?.open(); // accepted but no welcome yet, so the backoff must not reset
    sockets[1]?.drop(); // attempt 1: 1000 ms
    vi.advanceTimersByTime(RECONNECT_FIRST);
    expect(sockets).toHaveLength(2);
    vi.advanceTimersByTime(reconnectDelay(1, () => 0) - RECONNECT_FIRST);
    expect(sockets).toHaveLength(3);

    sockets[2]?.open();
    sockets[2]?.receive({ t: 'welcome', playerId: 'p9', code: 'WXYZ', serverNow: 1_000_000 });
    sockets[2]?.drop(); // back to attempt 0
    vi.advanceTimersByTime(RECONNECT_FIRST);
    expect(sockets).toHaveLength(4);
  });

  it('a duplicate close from the same socket schedules only one reconnect', () => {
    const { net, sockets } = setup();
    net.start();
    sockets[0]?.open();
    sockets[0]?.drop();
    sockets[0]?.drop();
    vi.advanceTimersByTime(config.reconnectMaxMs * 2);
    expect(sockets).toHaveLength(2);
  });

  it('a late close from a replaced socket does not schedule another reconnect', () => {
    const { net, sockets } = setup();
    net.start();
    sockets[0]?.open();
    sockets[0]?.drop();
    vi.advanceTimersByTime(RECONNECT_FIRST);
    sockets[1]?.open();
    sockets[0]?.drop(); // stale: socket 0 was already replaced
    vi.advanceTimersByTime(config.reconnectMaxMs * 2);
    expect(sockets).toHaveLength(2);
  });

  it('stop() closes the socket and never reconnects', () => {
    const { net, sockets, store } = setup({
      [SESSION_KEY]: JSON.stringify({ playerId: 'p9', code: 'WXYZ', name: 'Joe' }),
    });
    net.start();
    sockets[0]?.open();
    net.stop();
    expect(sockets[0]?.closed).toBe(true);
    expect(store.getState().conn).toBe('closed');
    sockets[0]?.drop();
    vi.advanceTimersByTime(config.reconnectMaxMs * 2);
    expect(sockets).toHaveLength(1);
  });

  it('ignores frames that are not JSON or not a known message', () => {
    const { net, sockets, store } = setup();
    net.start();
    sockets[0]?.open();
    const before = store.getState();
    expect(() => sockets[0]?.handlers.onMessage('not json')).not.toThrow();
    expect(() => sockets[0]?.handlers.onMessage('{"t":"hax"}')).not.toThrow();
    expect(() => sockets[0]?.handlers.onMessage('null')).not.toThrow();
    expect(store.getState()).toBe(before);
  });

  it('forwards state, event, postmortem and error frames to the store', () => {
    const { net, sockets, store } = setup();
    net.start();
    sockets[0]?.open();
    sockets[0]?.receive({ t: 'state', state: ROOM });
    sockets[0]?.receive({ t: 'event', event: EVENT });
    sockets[0]?.receive({ t: 'postmortem', report: POSTMORTEM });
    sockets[0]?.receive({ t: 'error', code: 'PING_COOLDOWN', message: 'Wait a moment' });
    const s = store.getState();
    expect(s.room).toEqual(ROOM);
    expect(s.events).toHaveLength(1);
    expect(s.postmortem).toEqual(POSTMORTEM);
    expect(s.error?.code).toBe('PING_COOLDOWN');
  });

  it('keeps working when sessionStorage throws', () => {
    const broken: KeyValueStorage = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    };
    const store = createStore();
    const sockets: FakeTransport[] = [];
    const net = createSocketClient({
      url: 'ws://localhost:5173/ws',
      store,
      connect: (url, handlers) => {
        const socket = new FakeTransport(url, handlers);
        sockets.push(socket);
        return socket;
      },
      storage: broken,
      now: () => Date.now(),
      random: () => 0,
    });
    net.start();
    sockets[0]?.open();
    net.send({ t: 'create', name: 'Sara' });
    expect(() =>
      sockets[0]?.receive({ t: 'welcome', playerId: 'p1', code: 'ABCD', serverNow: 1_000_000 }),
    ).not.toThrow();
    expect(store.getState().session).toEqual({ playerId: 'p1', code: 'ABCD' });
  });
});
