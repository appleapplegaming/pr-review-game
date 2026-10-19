// Shared plumbing for the protocol integration tests: a real `ws` client that records every frame
// it receives, a seeded random source, and a server started in-process on an ephemeral port with
// the quarter scaled down by SHIP_IT_TIME_SCALE (only honoured because NODE_ENV=test).

import { WebSocket } from 'ws';
import type { ClientMsg, ServerMsg } from '../../shared/protocol';
import type { BugType, PublicRoomState, PullRequest } from '../../shared/types';
import { pool } from '../../content/prs';
import { startServer, type RunningServer } from '../../server/app';

/** Quarter = 600 s * scale = 12 s; PR timer 1.8 s; incident delay 80-240 ms; ping cooldown 400 ms. */
export const TIME_SCALE = '0.02';

/** A frame as the client received it: the exact text, plus its parsed form. */
export interface Frame {
  raw: string;
  msg: ServerMsg;
}

/** Deterministic uniform numbers in [0, 1). The same seed always gives the same game. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface TestServer {
  port: number;
  url: string;
  close(): Promise<void>;
}

export async function startTestServer(seed = 1): Promise<TestServer> {
  const running: RunningServer = await startServer({
    port: 0,
    host: '127.0.0.1',
    random: seededRandom(seed),
    env: { NODE_ENV: 'test', SHIP_IT_TIME_SCALE: TIME_SCALE },
  });
  return {
    port: running.port,
    url: `ws://127.0.0.1:${running.port}/ws`,
    close: () => running.close(),
  };
}

/** Polls `check` until it returns a value, or rejects after `timeoutMs`. */
export function until<T>(
  check: () => T | undefined | null | false,
  timeoutMs = 10_000,
  label = 'condition',
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  return new Promise<T>((resolve, reject) => {
    const tick = () => {
      const value = check();
      if (value !== undefined && value !== null && value !== false) {
        resolve(value);
      } else if (Date.now() > deadline) {
        reject(new Error(`timed out waiting for ${label}`));
      } else {
        setTimeout(tick, 10);
      }
    };
    tick();
  });
}

/**
 * A player's socket. It records every frame in `frames`, in arrival order, and keeps the latest
 * state it was sent. Handlers passed to `onState` run after the state is recorded.
 */
export class TestClient {
  readonly frames: Frame[] = [];
  latestState: PublicRoomState | null = null;
  playerId: string | null = null;
  code: string | null = null;
  private stateHandler: ((state: PublicRoomState) => void) | null = null;
  private closed = false;

  private constructor(private readonly socket: WebSocket) {
    socket.on('message', (data) => this.receive(data.toString('utf8')));
  }

  static connect(url: string, origin?: string): Promise<TestClient> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url, origin === undefined ? undefined : { origin });
      socket.once('open', () => resolve(new TestClient(socket)));
      socket.once('error', reject);
    });
  }

  private receive(raw: string): void {
    const msg = JSON.parse(raw) as ServerMsg;
    this.frames.push({ raw, msg });
    if (msg.t === 'welcome') {
      this.playerId = msg.playerId;
      this.code = msg.code;
    }
    if (msg.t === 'state') {
      this.latestState = msg.state;
      this.stateHandler?.(msg.state);
    }
  }

  onState(handler: (state: PublicRoomState) => void): void {
    this.stateHandler = handler;
  }

  send(msg: ClientMsg): void {
    this.socket.send(JSON.stringify(msg));
  }

  /** Sends text exactly as given, for testing frames that are not valid commands. */
  sendRaw(text: string): void {
    this.socket.send(text);
  }

  /** Every frame of one type, in arrival order. */
  messages<T extends ServerMsg['t']>(t: T): Extract<ServerMsg, { t: T }>[] {
    return this.frames
      .map((f) => f.msg)
      .filter((m): m is Extract<ServerMsg, { t: T }> => m.t === t);
  }

  errors(): Extract<ServerMsg, { t: 'error' }>[] {
    return this.messages('error');
  }

  isOpen(): boolean {
    return this.socket.readyState === WebSocket.OPEN;
  }

  /** Resolves once the socket is closed by either side. */
  close(): Promise<void> {
    if (this.closed || this.socket.readyState === WebSocket.CLOSED) return Promise.resolve();
    this.closed = true;
    return new Promise((resolve) => {
      this.socket.once('close', () => resolve());
      this.socket.close();
    });
  }
}

/** Resolves with the first postmortem frame this client received, or undefined if none yet. */
export function postmortemOf(client: TestClient) {
  return client.messages('postmortem')[0]?.report;
}

// ---- a full quarter, played over the wire ----------------------------------------------------

/** The answer key, read from the real pool, for the player simulation only. */
const truthById = new Map<string, PullRequest>(pool.map((pr) => [pr.id, pr]));
const WRONG_TYPE: Record<BugType, BugType> = {
  money: 'security',
  security: 'outage',
  outage: 'money',
};

export interface PlayedQuarter {
  host: TestClient;
  bea: TestClient;
  cy: TestClient;
  clients: TestClient[];
  /** The buggy PR that Bea waved through (merged) after Cy pinged it. */
  missedPrId: string;
  /** The buggy PR the host declined with the correct type (a catch). */
  caughtPrId: string;
  /** Every PR id the host decided, with the action it took. */
  decisions: { by: 'Ada' | 'Bea'; prId: string; action: 'merge' | 'decline'; bugType?: BugType }[];
}

/**
 * Creates a room with three players, starts it and plays the whole quarter as a simulated team:
 *   - Ada (host) merges clean PRs and declines buggy ones with the right type (catches), except
 *     one buggy PR she declines with the wrong type and one clean PR she declines as a false alarm;
 *   - Bea opens and comments on the first buggy PR, then merges it (a miss, which fires an incident);
 *   - Cy pings that same PR before Bea merges it.
 * Whatever nobody decides auto-merges. Resolves once every client has the postmortem.
 */
export async function playQuarter(url: string): Promise<PlayedQuarter> {
  const host = await TestClient.connect(url);
  host.send({ t: 'create', name: 'Ada' });
  const code = await until(() => host.code, 5_000, 'room code');
  const bea = await TestClient.connect(url);
  bea.send({ t: 'join', code, name: 'Bea' });
  const cy = await TestClient.connect(url);
  cy.send({ t: 'join', code, name: 'Cy' });
  const clients = [host, bea, cy];
  await until(
    () => clients.every((c) => c.latestState?.players.length === 3),
    5_000,
    'three players',
  );

  const decisions: PlayedQuarter['decisions'] = [];
  const decided = new Set<string>();
  let missedPrId: string | null = null;
  let caughtPrId: string | null = null;
  let buggySeen = 0;
  let falseAlarmSent = false;

  host.onState((state) => {
    for (const pr of state.prs) {
      if (pr.status !== 'open' || decided.has(pr.id)) continue;
      const truth = truthById.get(pr.id);
      if (truth === undefined) throw new Error(`PR ${pr.id} is not in the pool`);
      decided.add(pr.id);
      if (truth.bug === null) {
        if (!falseAlarmSent) {
          falseAlarmSent = true;
          host.send({ t: 'decline', prId: pr.id, bugType: 'money' });
          decisions.push({ by: 'Ada', prId: pr.id, action: 'decline', bugType: 'money' });
        } else {
          host.send({ t: 'merge', prId: pr.id });
          decisions.push({ by: 'Ada', prId: pr.id, action: 'merge' });
        }
        continue;
      }
      buggySeen += 1;
      if (missedPrId === null) {
        missedPrId = pr.id;
        void missBuggyPr(pr.id);
      } else if (buggySeen === 3) {
        host.send({ t: 'decline', prId: pr.id, bugType: WRONG_TYPE[truth.bug.type] });
        decisions.push({
          by: 'Ada',
          prId: pr.id,
          action: 'decline',
          bugType: WRONG_TYPE[truth.bug.type],
        });
      } else {
        caughtPrId ??= pr.id;
        host.send({ t: 'decline', prId: pr.id, bugType: truth.bug.type });
        decisions.push({ by: 'Ada', prId: pr.id, action: 'decline', bugType: truth.bug.type });
      }
    }
  });

  /** Bea reads and comments, Cy pings, and only then does Bea merge the bug. */
  async function missBuggyPr(prId: string): Promise<void> {
    bea.send({ t: 'open', prId });
    bea.send({ t: 'comment', prId, line: null, text: 'Looks fine to me' });
    cy.send({ t: 'ping', prId });
    await until(
      () => host.latestState?.prs.find((p) => p.id === prId)?.highlighted === true,
      5_000,
      'the ping to reach the host',
    );
    bea.send({ t: 'merge', prId });
    decisions.push({ by: 'Bea', prId, action: 'merge' });
  }

  host.send({ t: 'start' });
  await until(() => clients.every((c) => c.latestState?.phase === 'playing'), 5_000, 'start');

  await until(
    () => clients.every((c) => c.messages('postmortem').length === 1),
    30_000,
    'every client to receive the postmortem',
  );

  return {
    host,
    bea,
    cy,
    clients,
    missedPrId: missedPrId ?? fail('no buggy PR spawned'),
    caughtPrId: caughtPrId ?? fail('no second buggy PR spawned'),
    decisions,
  };
}

function fail(message: string): never {
  throw new Error(message);
}
