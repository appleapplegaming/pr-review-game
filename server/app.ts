// The HTTP and WebSocket server as a factory, so tests can start it in-process on port 0.
// server/index.ts only reads PORT and calls startServer().
//
// Trust: the request path, the Origin header and every frame are untrusted. Static files are
// confined to the client directory (static.ts). The WebSocket upgrade is accepted only on /ws and
// only from a browser Origin that matches the Host header; a request with no Origin (a non-browser
// client) is allowed, because the game's secrets are per-player ids, not cookies.

import { createServer, type Server } from 'node:http';
import type { Duplex } from 'node:stream';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { pool as defaultPool } from '../content/prs';
import type { PullRequest } from '../shared/types';
import { config } from '../shared/config';
import { defaultTiming, type Timing } from './engine/state';
import { systemClock } from './clock';
import { createRooms, type RoomClock } from './rooms';
import { createWsHub, fromWebSocket } from './ws';
import { createStaticHandler } from './static';

const WS_PATH = '/ws';
/** Built client, next to the bundled server: dist/server/index.js -> dist/client. */
const DEFAULT_CLIENT_DIR = fileURLToPath(new URL('../client', import.meta.url));

export interface ServerOptions {
  /** TCP port to bind. 0 asks the OS for a free one; read the real port from the result. */
  port: number;
  /** Interface to bind. Defaults to all interfaces. */
  host?: string;
  /** Directory of the built client. Defaults to dist/client next to the bundle. */
  clientDir?: string;
  /** Clock for rooms and the tick loop. Defaults to the real clock. */
  clock?: RoomClock;
  /** Uniform numbers in [0, 1). Defaults to Math.random. */
  random?: () => number;
  /** The PR pool. Defaults to content/prs. */
  pool?: readonly PullRequest[];
  /** Environment read for SHIP_IT_TIME_SCALE and SHIP_IT_SEED. Defaults to process.env. */
  env?: NodeJS.ProcessEnv;
}

export interface RunningServer {
  /** The port actually bound. */
  port: number;
  /** Closes every socket and stops listening. Resolves once the HTTP server has closed. */
  close(): Promise<void>;
}

/** Scales every quarter duration by `scale`. Balance numbers still come from shared/config.ts. */
export function scaleTiming(timing: Timing, scale: number): Timing {
  const ms = (value: number) => Math.round(value * scale);
  return {
    quarterMs: ms(timing.quarterMs),
    spawnWindowMs: ms(timing.spawnWindowMs),
    prTimerMs: ms(timing.prTimerMs),
    incidentDelayMs: { min: ms(timing.incidentDelayMs.min), max: ms(timing.incidentDelayMs.max) },
    pingCooldownMs: ms(timing.pingCooldownMs),
  };
}

/**
 * The quarter timing for this process. SHIP_IT_TIME_SCALE (for example 0.1) shortens a quarter for
 * the e2e tests, but only when NODE_ENV=test. In any other environment it is ignored.
 */
export function timingFromEnv(env: NodeJS.ProcessEnv): Timing {
  const base = defaultTiming();
  if (env.NODE_ENV !== 'test' || env.SHIP_IT_TIME_SCALE === undefined) return base;
  const raw = env.SHIP_IT_TIME_SCALE;
  const scale = Number(raw);
  if (raw.trim() === '' || !Number.isFinite(scale) || scale <= 0) {
    throw new Error(`SHIP_IT_TIME_SCALE must be a positive number, got "${raw}"`);
  }
  return scaleTiming(base, scale);
}

/**
 * A fixed seed for every room's PR draw, from SHIP_IT_SEED. Like SHIP_IT_TIME_SCALE it applies only
 * when NODE_ENV=test, so the e2e tests can pick a quarter that is safe to merge through blindly.
 */
export function roomSeedFromEnv(env: NodeJS.ProcessEnv): number | undefined {
  if (env.NODE_ENV !== 'test' || env.SHIP_IT_SEED === undefined) return undefined;
  const raw = env.SHIP_IT_SEED;
  if (!/^\d+$/.test(raw)) throw new Error(`SHIP_IT_SEED must be a whole number, got "${raw}"`);
  return Number(raw);
}

/** The port from PORT, or 3000 when PORT is unset or empty. */
export function portFromEnv(env: NodeJS.ProcessEnv): number {
  const raw = env.PORT;
  if (raw === undefined || raw === '') return config.defaultPort;
  if (!/^\d+$/.test(raw)) throw new Error(`PORT must be a whole number, got "${raw}"`);
  const port = Number(raw);
  if (port > 65_535) throw new Error(`PORT must be at most 65535, got "${raw}"`);
  return port;
}

/** Answers a refused upgrade with a bare status line and drops the socket. */
function refuse(socket: Duplex, status: number, reason: string): void {
  socket.write(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}

/** True when there is no Origin (a non-browser client) or the Origin's host is the Host header. */
function originAllowed(origin: string | undefined, host: string | undefined): boolean {
  if (origin === undefined) return true;
  try {
    return host !== undefined && new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function startServer(options: ServerOptions): Promise<RunningServer> {
  const clock = options.clock ?? systemClock();
  const rooms = createRooms({
    clock,
    random: options.random ?? Math.random,
    pool: options.pool ?? defaultPool,
    timing: timingFromEnv(options.env ?? process.env),
    roomSeed: roomSeedFromEnv(options.env ?? process.env),
  });
  const hub = createWsHub({ rooms, clock });
  const serveStatic = createStaticHandler(options.clientDir ?? DEFAULT_CLIENT_DIR);

  const http: Server = createServer(serveStatic);
  // ws enforces its own ceiling, so an oversized frame is closed by the transport. The hub checks
  // maxMessageBytes first and replies BAD_MESSAGE, so the ceiling is only a memory guard.
  const wss = new WebSocketServer({ noServer: true, maxPayload: config.wsMaxPayloadBytes });

  http.on('upgrade', (req, socket, head) => {
    // An unparseable target would throw here and take the whole process down, so refuse it.
    let pathname: string;
    try {
      pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
    } catch {
      refuse(socket, 400, 'Bad Request');
      return;
    }
    if (pathname !== WS_PATH) {
      refuse(socket, 404, 'Not Found');
      return;
    }
    if (!originAllowed(req.headers.origin, req.headers.host)) {
      refuse(socket, 403, 'Forbidden');
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      hub.attach(fromWebSocket(ws));
    });
  });

  return new Promise((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    http.once('error', onError);
    http.listen(options.port, options.host, () => {
      http.off('error', onError);
      const { port } = http.address() as AddressInfo;
      resolve({
        port,
        close: () =>
          new Promise<void>((done) => {
            hub.close();
            wss.close();
            http.close(() => done());
            http.closeAllConnections();
          }),
      });
    });
  });
}
