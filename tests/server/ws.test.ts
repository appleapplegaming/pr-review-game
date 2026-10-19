import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket, WebSocketServer } from 'ws';
import type { AddressInfo } from 'node:net';
import type { ServerMsg } from '../../shared/protocol';
import type { ErrorCode, GameEvent, PublicRoomState } from '../../shared/types';
import { config } from '../../shared/config';
import { pool } from '../../content/prs';
import { createRooms, type Rooms, type RoomClock, type TickResult } from '../../server/rooms';
import { createWsHub, fromWebSocket, type Peer, type WsHub } from '../../server/ws';

const T0 = 1_700_000_000_000;
const TEN_MIN = config.quarterMs;

/** A fake clock. Timers fire only when a test advances time, so every test is deterministic. */
class FakeClock implements RoomClock {
  private t = T0;
  private nextId = 1;
  private timers = new Map<number, { at: number; fn: () => void }>();

  now(): number {
    return this.t;
  }

  setTimer(fn: () => void, ms: number): number {
    const id = this.nextId++;
    this.timers.set(id, { at: this.t + ms, fn });
    return id;
  }

  clearTimer(id: number): void {
    this.timers.delete(id);
  }

  pendingTimers(): number {
    return this.timers.size;
  }

  /** Moves the clock forward and runs every timer that comes due on the way, in order. */
  advance(ms: number): void {
    const target = this.t + ms;
    for (;;) {
      let next: [number, { at: number; fn: () => void }] | undefined;
      for (const entry of this.timers) {
        if (entry[1].at <= target && (next === undefined || entry[1].at < next[1].at)) next = entry;
      }
      if (next === undefined) break;
      this.timers.delete(next[0]);
      this.t = next[1].at;
      next[1].fn();
    }
    this.t = target;
  }

  /** Moves the clock forward without running any timers. */
  jump(ms: number): void {
    this.t += ms;
  }
}

/** A deterministic random source, so the same seed always draws the same quarter. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

/** A peer that records what the server sent and lets a test play the client. */
class FakePeer implements Peer {
  private sent: ServerMsg[] = [];
  closed = false;
  private onMessageHandler: ((data: Buffer) => void) | null = null;
  private onCloseHandler: (() => void) | null = null;

  send(text: string): void {
    this.sent.push(JSON.parse(text) as ServerMsg);
  }

  close(): void {
    this.closed = true;
  }

  onMessage(handler: (data: Buffer) => void): void {
    this.onMessageHandler = handler;
  }

  onClose(handler: () => void): void {
    this.onCloseHandler = handler;
  }

  /** The client sends a frame. */
  receive(raw: string): void {
    this.onMessageHandler?.(Buffer.from(raw, 'utf8'));
  }

  /** The socket closes. */
  disconnect(): void {
    this.onCloseHandler?.();
  }

  /** Returns everything sent since the last call, and clears the record. */
  take(): ServerMsg[] {
    const out = this.sent;
    this.sent = [];
    return out;
  }
}

function errorsIn(msgs: ServerMsg[]): ErrorCode[] {
  return msgs.flatMap((m) => (m.t === 'error' ? [m.code] : []));
}

function statesIn(msgs: ServerMsg[]): PublicRoomState[] {
  return msgs.flatMap((m) => (m.t === 'state' ? [m.state] : []));
}

function eventsIn(msgs: ServerMsg[]): GameEvent[] {
  return msgs.flatMap((m) => (m.t === 'event' ? [m.event] : []));
}

function send(peer: FakePeer, msg: unknown): void {
  peer.receive(JSON.stringify(msg));
}

interface Harness {
  clock: FakeClock;
  rooms: Rooms;
  hub: WsHub;
  peers: FakePeer[];
  connect(): FakePeer;
  /** Ticks logged by the wrapped rooms.tick, in order. */
  tickLog: TickResult['changed'][];
}

function harness(
  options: { pool?: typeof pool; tickMs?: number; maxMessageBytes?: number } = {},
): Harness {
  const clock = new FakeClock();
  const random = seeded(7);
  let nextId = 0;
  const real = createRooms({
    clock,
    random,
    pool: options.pool ?? pool,
    newPlayerId: () => `p${++nextId}`,
  });
  const tickLog: TickResult['changed'][] = [];
  const rooms: Rooms = {
    ...real,
    tick(code) {
      const result = real.tick(code);
      if ('changed' in result) tickLog.push(result.changed);
      return result;
    },
  };
  const hub = createWsHub({
    rooms,
    clock,
    tickMs: options.tickMs ?? config.tickMs,
    maxMessageBytes: options.maxMessageBytes ?? config.maxMessageBytes,
  });
  const peers: FakePeer[] = [];
  return {
    clock,
    rooms,
    hub,
    peers,
    tickLog,
    connect() {
      const peer = new FakePeer();
      peers.push(peer);
      hub.attach(peer);
      return peer;
    },
  };
}

describe('welcome and broadcast', () => {
  it('create replies with welcome carrying serverNow, then broadcasts state to the room', () => {
    const h = harness();
    const host = h.connect();
    send(host, { t: 'create', name: 'Sara' });
    const msgs = host.take();

    const welcome = msgs.find((m) => m.t === 'welcome');
    expect(welcome).toEqual({
      t: 'welcome',
      playerId: 'p1',
      code: expect.stringMatching(/^[A-HJ-NP-Z]{4}$/),
      serverNow: T0,
    });
    const states = statesIn(msgs);
    expect(states).toHaveLength(1);
    expect(states[0]?.players.map((p) => p.name)).toEqual(['Sara']);
  });

  it('join broadcasts the new state to everyone already in the room', () => {
    const h = harness();
    const host = h.connect();
    send(host, { t: 'create', name: 'Sara' });
    const code = host.take().find((m) => m.t === 'welcome');
    if (code?.t !== 'welcome') throw new Error('no welcome');

    const guest = h.connect();
    send(guest, { t: 'join', code: code.code, name: 'Dana' });
    expect(guest.take().some((m) => m.t === 'welcome')).toBe(true);

    const hostStates = statesIn(host.take());
    expect(hostStates.at(-1)?.players.map((p) => p.name)).toEqual(['Sara', 'Dana']);
  });

  it('never sends the raw engine state, only PublicRoomState snapshots', () => {
    const h = harness();
    const host = h.connect();
    send(host, { t: 'create', name: 'Sara' });
    for (const msg of host.take()) {
      if (msg.t === 'state') {
        expect(JSON.stringify(msg)).not.toMatch(/"bug"|"upcoming"|"incidents"|"rng"/);
      }
    }
  });
});

describe('validation', () => {
  it('replies BAD_MESSAGE to malformed JSON and keeps the socket open', () => {
    const h = harness();
    const peer = h.connect();
    send(peer, { t: 'create', name: 'Sara' });
    peer.take();

    peer.receive('{"t":"start"');
    expect(errorsIn(peer.take())).toEqual(['BAD_MESSAGE']);
    expect(peer.closed).toBe(false);

    send(peer, { t: 'create', name: 'Dana' });
    expect(peer.take().some((m) => m.t === 'welcome')).toBe(true);
  });

  it('replies BAD_MESSAGE to an unknown type, wrong field types and over-long strings', () => {
    const h = harness();
    const peer = h.connect();
    const bad = [
      { t: 'explode' },
      { t: 'create', name: 7 },
      { t: 'create', name: 'x'.repeat(config.name.max + 1) },
      { t: 'comment', prId: 'pay-001', line: 1, text: 'x'.repeat(config.comment.max + 1) },
    ];
    for (const msg of bad) {
      send(peer, msg);
      expect(errorsIn(peer.take()), JSON.stringify(msg)).toEqual(['BAD_MESSAGE']);
    }
    expect(peer.closed).toBe(false);
  });

  it('replies BAD_MESSAGE to a frame over the size limit without parsing it', () => {
    const h = harness({ maxMessageBytes: 64 });
    const peer = h.connect();
    peer.receive(JSON.stringify({ t: 'create', name: 'x'.repeat(200) }));
    expect(errorsIn(peer.take())).toEqual(['BAD_MESSAGE']);
    expect(peer.closed).toBe(false);
  });

  it('replies NOT_IN_ROOM to a game action from a socket that has not joined', () => {
    const h = harness();
    const peer = h.connect();
    send(peer, { t: 'start' });
    expect(errorsIn(peer.take())).toEqual(['NOT_IN_ROOM']);
  });
});

describe('rate limit', () => {
  it('drops the 11th message within one second with RATE_LIMITED, and the socket stays open', () => {
    const h = harness();
    const peer = h.connect();
    for (let i = 0; i < config.rateLimit.messages; i++) send(peer, { t: 'start' });
    expect(errorsIn(peer.take())).toEqual(Array(config.rateLimit.messages).fill('NOT_IN_ROOM'));

    send(peer, { t: 'start' });
    expect(errorsIn(peer.take())).toEqual(['RATE_LIMITED']);
    expect(peer.closed).toBe(false);
  });

  it('counts invalid frames too, so garbage cannot bypass the limit', () => {
    const h = harness();
    const peer = h.connect();
    for (let i = 0; i < config.rateLimit.messages; i++) peer.receive('garbage');
    peer.take();
    peer.receive('garbage');
    expect(errorsIn(peer.take())).toEqual(['RATE_LIMITED']);
  });

  it('accepts messages again once the window has passed', () => {
    const h = harness();
    const peer = h.connect();
    for (let i = 0; i < config.rateLimit.messages + 1; i++) send(peer, { t: 'start' });
    peer.take();

    h.clock.advance(config.rateLimit.windowMs);
    send(peer, { t: 'start' });
    expect(errorsIn(peer.take())).toEqual(['NOT_IN_ROOM']);
  });

  it('limits each connection separately', () => {
    const h = harness();
    const a = h.connect();
    const b = h.connect();
    for (let i = 0; i < config.rateLimit.messages + 1; i++) send(a, { t: 'start' });
    send(b, { t: 'start' });
    expect(errorsIn(b.take())).toEqual(['NOT_IN_ROOM']);
  });
});

describe('tick loop', () => {
  it('broadcasts state only on ticks that changed something', () => {
    const h = harness();
    const host = h.connect();
    send(host, { t: 'create', name: 'Sara' });
    host.take();
    send(host, { t: 'start' });
    host.take();
    h.tickLog.length = 0;

    h.clock.advance(60_000);

    const changedTicks = h.tickLog.filter(Boolean).length;
    expect(h.tickLog.length).toBeGreaterThan(200);
    expect(changedTicks).toBeGreaterThan(0);
    expect(changedTicks).toBeLessThan(h.tickLog.length);
    expect(statesIn(host.take())).toHaveLength(changedTicks);
  });

  it('stops after the quarter ends, sends one postmortem and leaves no timers behind', () => {
    const h = harness();
    const host = h.connect();
    send(host, { t: 'create', name: 'Sara' });
    host.take();
    send(host, { t: 'start' });
    host.take();

    h.clock.advance(TEN_MIN + config.tickMs * 2);
    const msgs = host.take();
    const postmortems = msgs.filter((m) => m.t === 'postmortem');
    expect(postmortems).toHaveLength(1);
    expect(statesIn(msgs).at(-1)?.phase).toBe('ended');

    const ticksAtEnd = h.tickLog.length;
    h.clock.advance(60_000);
    expect(h.tickLog.length).toBe(ticksAtEnd);
    expect(h.clock.pendingTimers()).toBe(0);
  });

  it('sends the postmortem to a player who joins after the quarter has ended', () => {
    const h = harness();
    const host = h.connect();
    send(host, { t: 'create', name: 'Sara' });
    const welcome = host.take().find((m) => m.t === 'welcome');
    if (welcome?.t !== 'welcome') throw new Error('no welcome');
    send(host, { t: 'start' });
    host.take();
    h.clock.advance(TEN_MIN + config.tickMs * 2);
    host.disconnect();

    const late = h.connect();
    send(late, { t: 'join', code: welcome.code, name: 'Dana' });
    expect(late.take().some((m) => m.t === 'postmortem')).toBe(true);
  });

  it('starts no tick loop for a lobby room', () => {
    const h = harness();
    const host = h.connect();
    send(host, { t: 'create', name: 'Sara' });
    host.take();
    expect(h.clock.pendingTimers()).toBe(0);
  });
});

describe('start', () => {
  it('replies SERVER_ERROR when the pool is too short, and leaves the room in the lobby', () => {
    const h = harness({ pool: pool.slice(0, 2) });
    const host = h.connect();
    send(host, { t: 'create', name: 'Sara' });
    const welcome = host.take().find((m) => m.t === 'welcome');
    if (welcome?.t !== 'welcome') throw new Error('no welcome');

    send(host, { t: 'start' });
    expect(errorsIn(host.take())).toEqual(['SERVER_ERROR']);
    expect(h.rooms.view(welcome.code)?.phase).toBe('lobby');
    expect(h.clock.pendingTimers()).toBe(0);
  });

  it('replies NOT_HOST when a guest tries to start', () => {
    const h = harness();
    const host = h.connect();
    send(host, { t: 'create', name: 'Sara' });
    const welcome = host.take().find((m) => m.t === 'welcome');
    if (welcome?.t !== 'welcome') throw new Error('no welcome');
    const guest = h.connect();
    send(guest, { t: 'join', code: welcome.code, name: 'Dana' });
    guest.take();

    send(guest, { t: 'start' });
    expect(errorsIn(guest.take())).toEqual(['NOT_HOST']);
  });
});

describe('intents', () => {
  it('broadcasts the events from catching up the clock even when the intent is rejected', () => {
    const h = harness();
    const host = h.connect();
    send(host, { t: 'create', name: 'Sara' });
    host.take();
    send(host, { t: 'start' });
    host.take();

    // Jump without running timers, so the next intent has to catch the clock up itself.
    h.clock.jump(5 * 60_000);
    send(host, { t: 'merge', prId: 'no-such-pr' });
    const msgs = host.take();

    expect(errorsIn(msgs)).toEqual(['PR_NOT_FOUND']);
    expect(eventsIn(msgs).length).toBeGreaterThan(0);
    expect(msgs.findIndex((m) => m.t === 'event')).toBeLessThan(
      msgs.findIndex((m) => m.t === 'error'),
    );
  });
});

describe('presence', () => {
  it('marks a player disconnected only when their last socket closes', () => {
    const h = harness();
    const host = h.connect();
    send(host, { t: 'create', name: 'Sara' });
    const welcome = host.take().find((m) => m.t === 'welcome');
    if (welcome?.t !== 'welcome') throw new Error('no welcome');

    const watcher = h.connect();
    send(watcher, { t: 'join', code: welcome.code, name: 'Dana' });
    const watcherWelcome = watcher.take().find((m) => m.t === 'welcome');
    if (watcherWelcome?.t !== 'welcome') throw new Error('no welcome');

    const hostTab2 = h.connect();
    send(hostTab2, { t: 'join', code: welcome.code, name: 'Sara', playerId: welcome.playerId });
    hostTab2.take();

    host.disconnect();
    expect(
      statesIn(watcher.take())
        .at(-1)
        ?.players.find((p) => p.id === 'p1')?.connected,
    ).toBe(true);

    hostTab2.disconnect();
    expect(
      statesIn(watcher.take())
        .at(-1)
        ?.players.find((p) => p.id === 'p1')?.connected,
    ).toBe(false);
  });

  it('hands host to the next connected player when the host leaves', () => {
    const h = harness();
    const host = h.connect();
    send(host, { t: 'create', name: 'Sara' });
    const welcome = host.take().find((m) => m.t === 'welcome');
    if (welcome?.t !== 'welcome') throw new Error('no welcome');
    const guest = h.connect();
    send(guest, { t: 'join', code: welcome.code, name: 'Dana' });
    guest.take();

    host.disconnect();
    expect(statesIn(guest.take()).at(-1)?.hostId).toBe('p2');
  });

  it('stops the cleanup timer and removes the room after 30 minutes with nobody left', () => {
    const h = harness();
    const host = h.connect();
    send(host, { t: 'create', name: 'Sara' });
    const welcome = host.take().find((m) => m.t === 'welcome');
    if (welcome?.t !== 'welcome') throw new Error('no welcome');

    host.disconnect();
    expect(h.rooms.view(welcome.code)).not.toBeNull();
    h.clock.advance(config.roomCleanupMs);
    expect(h.rooms.view(welcome.code)).toBeNull();
    expect(h.clock.pendingTimers()).toBe(0);
  });
});

describe('close', () => {
  it('closes every socket and clears every timer', () => {
    const h = harness();
    const host = h.connect();
    send(host, { t: 'create', name: 'Sara' });
    host.take();
    send(host, { t: 'start' });
    host.take();

    h.hub.close();
    expect(host.closed).toBe(true);
    expect(h.clock.pendingTimers()).toBe(0);
  });
});

describe('over a real socket', () => {
  let server: WebSocketServer | undefined;
  let client: WebSocket | undefined;

  afterEach(async () => {
    client?.close();
    await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
    server = undefined;
    client = undefined;
  });

  it('keeps the socket open through a malformed frame and answers the next command', async () => {
    const clock = new FakeClock();
    const rooms = createRooms({ clock, random: seeded(3), pool });
    const hub = createWsHub({
      rooms,
      clock,
      tickMs: config.tickMs,
      maxMessageBytes: config.maxMessageBytes,
    });
    server = new WebSocketServer({ port: 0 });
    server.on('connection', (socket) => hub.attach(fromWebSocket(socket)));
    await new Promise<void>((resolve) => server?.once('listening', () => resolve()));
    const port = (server.address() as AddressInfo).port;

    client = new WebSocket(`ws://127.0.0.1:${port}`);
    const inbox: ServerMsg[] = [];
    client.on('message', (data) => inbox.push(JSON.parse(data.toString()) as ServerMsg));
    await new Promise<void>((resolve) => client?.once('open', () => resolve()));

    const waitFor = async (predicate: (m: ServerMsg) => boolean): Promise<ServerMsg> => {
      for (let i = 0; i < 200; i++) {
        const hit = inbox.find(predicate);
        if (hit) return hit;
        await new Promise((r) => setTimeout(r, 5));
      }
      throw new Error('timed out waiting for a message');
    };

    client.send('{"t":');
    const error = await waitFor((m) => m.t === 'error');
    expect(error).toEqual({ t: 'error', code: 'BAD_MESSAGE', message: expect.any(String) });
    expect(client.readyState).toBe(WebSocket.OPEN);

    client.send(JSON.stringify({ t: 'create', name: 'Sara' }));
    const welcome = await waitFor((m) => m.t === 'welcome');
    expect(welcome).toMatchObject({ t: 'welcome', playerId: expect.any(String) });
  });
});
