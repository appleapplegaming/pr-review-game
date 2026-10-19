import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';
import { connect as netConnect } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { config } from '../shared/config';
import { defaultTiming } from '../server/engine/state';
import {
  portFromEnv,
  roomSeedFromEnv,
  startServer,
  timingFromEnv,
  type RunningServer,
} from '../server/app';

// Fixture layout:
//   <root>/secret.txt        outside the client directory, must never be served
//   <root>/client/index.html the built app shell
//   <root>/client/assets/app.js
//   <root>/client/.env       a dotfile inside the client directory, must not be served
let root: string;
let clientDir: string;
let running: RunningServer | undefined;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'ship-it-http-'));
  clientDir = join(root, 'client');
  mkdirSync(join(clientDir, 'assets'), { recursive: true });
  writeFileSync(join(clientDir, 'index.html'), '<!doctype html><title>Ship It</title>APP-SHELL');
  writeFileSync(join(clientDir, 'assets', 'app.js'), 'console.log("app");');
  writeFileSync(join(clientDir, '.env'), 'API_KEY=dotfile-secret');
  writeFileSync(join(root, 'secret.txt'), 'OUTSIDE-SECRET');
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

afterEach(async () => {
  await running?.close();
  running = undefined;
});

async function start(): Promise<number> {
  running = await startServer({ port: 0, clientDir, env: {} });
  return running.port;
}

interface Raw {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

/** Sends the path exactly as written. Node's URL parser is bypassed, so `..` and `%2e` stay raw. */
function rawRequest(port: number, path: string, method = 'GET'): Promise<Raw> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => (body += chunk));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

describe('static client', () => {
  it('serves index.html for /', async () => {
    const port = await start();
    const res = await rawRequest(port, '/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(res.body).toContain('APP-SHELL');
  });

  it('serves index.html for /r/:code so deep links load the app', async () => {
    const port = await start();
    const res = await rawRequest(port, '/r/KZQX');
    expect(res.status).toBe(200);
    expect(res.body).toContain('APP-SHELL');
  });

  it('serves a built asset with its JavaScript content type', async () => {
    const port = await start();
    const res = await rawRequest(port, '/assets/app.js');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/javascript; charset=utf-8');
    expect(res.body).toBe('console.log("app");');
  });

  it('answers 404 for an unknown static file', async () => {
    const port = await start();
    const res = await rawRequest(port, '/missing.js');
    expect(res.status).toBe(404);
  });

  it('answers 404 for a directory', async () => {
    const port = await start();
    const res = await rawRequest(port, '/assets');
    expect(res.status).toBe(404);
  });

  it('blocks ../ traversal to a file outside the client directory', async () => {
    const port = await start();
    for (const path of ['/../secret.txt', '/%2e%2e/secret.txt', '/assets/../../secret.txt']) {
      const res = await rawRequest(port, path);
      expect(res.status, path).toBe(404);
      expect(res.body, path).not.toContain('OUTSIDE-SECRET');
    }
  });

  it('blocks encoded separators and null bytes', async () => {
    const port = await start();
    for (const path of ['/..%2fsecret.txt', '/%2e%2e%5csecret.txt', '/app.js%00.html']) {
      const res = await rawRequest(port, path);
      expect(res.status, path).toBe(404);
      expect(res.body, path).not.toContain('OUTSIDE-SECRET');
    }
  });

  it('does not serve dotfiles', async () => {
    const port = await start();
    const res = await rawRequest(port, '/.env');
    expect(res.status).toBe(404);
    expect(res.body).not.toContain('dotfile-secret');
  });

  it('answers 400 for a malformed percent-encoding', async () => {
    const port = await start();
    const res = await rawRequest(port, '/%E0%A4%A');
    expect(res.status).toBe(400);
  });

  it('rejects methods other than GET and HEAD', async () => {
    const port = await start();
    const res = await rawRequest(port, '/', 'POST');
    expect(res.status).toBe(405);
  });

  it('sends security headers on every response', async () => {
    const port = await start();
    for (const path of ['/', '/assets/app.js', '/missing.js']) {
      const res = await rawRequest(port, path);
      expect(res.headers['x-content-type-options'], path).toBe('nosniff');
      expect(res.headers['x-frame-options'], path).toBe('DENY');
      expect(String(res.headers['content-security-policy']), path).toContain("default-src 'self'");
      expect(String(res.headers['content-security-policy']), path).toContain(
        "frame-ancestors 'none'",
      );
      expect(res.headers['referrer-policy'], path).toBe('no-referrer');
    }
  });
});

describe('startServer', () => {
  it('binds the port it was given, or a free one when given 0', async () => {
    const port = await start();
    expect(port).toBeGreaterThan(0);
    expect(running?.port).toBe(port);
  });

  it('close() stops the server so the port refuses connections', async () => {
    const port = await start();
    await running?.close();
    running = undefined;
    await expect(rawRequest(port, '/')).rejects.toThrow();
  });
});

describe('WebSocket upgrade on /ws', () => {
  function connect(port: number, path: string, origin?: string): WebSocket {
    return new WebSocket(`ws://127.0.0.1:${port}${path}`, origin ? { headers: { origin } } : {});
  }

  function nextMessage(socket: WebSocket): Promise<unknown> {
    return new Promise((resolve) => {
      socket.once('message', (data) => resolve(JSON.parse(data.toString('utf8'))));
    });
  }

  it('upgrades /ws and runs the protocol over it', async () => {
    const port = await start();
    const socket = connect(port, '/ws');
    await new Promise<void>((resolve, reject) => {
      socket.once('open', () => resolve());
      socket.once('error', reject);
    });
    const reply = nextMessage(socket);
    socket.send(JSON.stringify({ t: 'create', name: 'Ana' }));
    const msg = (await reply) as { t: string; code: string; playerId: string };
    expect(msg.t).toBe('welcome');
    expect(msg.code).toMatch(/^[A-HJ-NP-Z]{4}$/);
    expect(msg.playerId.length).toBeGreaterThan(0);
    socket.close();
  });

  it('refuses an upgrade on any other path', async () => {
    const port = await start();
    const socket = connect(port, '/nope');
    const error = await new Promise<Error>((resolve) => socket.once('error', resolve));
    expect(error.message).toMatch(/404/);
  });

  it('refuses a browser upgrade whose Origin is another host', async () => {
    const port = await start();
    const socket = connect(port, '/ws', 'https://evil.example');
    const error = await new Promise<Error>((resolve) => socket.once('error', resolve));
    expect(error.message).toMatch(/403/);
  });

  it('survives an upgrade request whose target cannot be parsed', async () => {
    const port = await start();
    const raw = await new Promise<string>((resolve) => {
      const socket = netConnect(port, '127.0.0.1');
      let data = '';
      socket.setEncoding('utf8');
      socket.on('data', (chunk: string) => (data += chunk));
      socket.on('error', () => resolve(data));
      socket.on('close', () => resolve(data));
      socket.on('connect', () =>
        socket.write(
          'GET http://[ HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n',
        ),
      );
      setTimeout(() => {
        socket.destroy();
        resolve(data);
      }, 1000).unref();
    });
    expect(raw === '' || raw.startsWith('HTTP/1.1 4')).toBe(true);
    const res = await rawRequest(port, '/');
    expect(res.status).toBe(200);
  });

  it('accepts a browser upgrade whose Origin matches the Host', async () => {
    const port = await start();
    const socket = connect(port, '/ws', `http://127.0.0.1:${port}`);
    await new Promise<void>((resolve, reject) => {
      socket.once('open', () => resolve());
      socket.once('error', reject);
    });
    socket.close();
  });
});

describe('SHIP_IT_TIME_SCALE', () => {
  it('scales every quarter duration when NODE_ENV=test', () => {
    const timing = timingFromEnv({ NODE_ENV: 'test', SHIP_IT_TIME_SCALE: '0.1' });
    const base = defaultTiming();
    expect(timing.quarterMs).toBe(Math.round(base.quarterMs * 0.1));
    expect(timing.spawnWindowMs).toBe(Math.round(base.spawnWindowMs * 0.1));
    expect(timing.prTimerMs).toBe(Math.round(base.prTimerMs * 0.1));
    expect(timing.incidentDelayMs.min).toBe(Math.round(base.incidentDelayMs.min * 0.1));
    expect(timing.incidentDelayMs.max).toBe(Math.round(base.incidentDelayMs.max * 0.1));
    expect(timing.pingCooldownMs).toBe(Math.round(base.pingCooldownMs * 0.1));
  });

  it('has no effect unless NODE_ENV=test', () => {
    expect(timingFromEnv({ NODE_ENV: 'production', SHIP_IT_TIME_SCALE: '0.1' })).toEqual(
      defaultTiming(),
    );
    expect(timingFromEnv({ SHIP_IT_TIME_SCALE: '0.1' })).toEqual(defaultTiming());
  });

  it('uses the balance numbers from config when unset', () => {
    expect(timingFromEnv({ NODE_ENV: 'test' }).quarterMs).toBe(config.quarterMs);
  });

  it('rejects a non-positive or non-numeric scale in test mode', () => {
    expect(() => timingFromEnv({ NODE_ENV: 'test', SHIP_IT_TIME_SCALE: '0' })).toThrow();
    expect(() => timingFromEnv({ NODE_ENV: 'test', SHIP_IT_TIME_SCALE: 'fast' })).toThrow();
  });
});

describe('SHIP_IT_SEED', () => {
  it('reads a whole-number seed when NODE_ENV=test', () => {
    expect(roomSeedFromEnv({ NODE_ENV: 'test', SHIP_IT_SEED: '7' })).toBe(7);
  });

  it('has no effect unless NODE_ENV=test, or when unset', () => {
    expect(roomSeedFromEnv({ NODE_ENV: 'production', SHIP_IT_SEED: '7' })).toBeUndefined();
    expect(roomSeedFromEnv({ SHIP_IT_SEED: '7' })).toBeUndefined();
    expect(roomSeedFromEnv({ NODE_ENV: 'test' })).toBeUndefined();
  });

  it('rejects anything that is not a whole number in test mode', () => {
    expect(() => roomSeedFromEnv({ NODE_ENV: 'test', SHIP_IT_SEED: 'abc' })).toThrow();
    expect(() => roomSeedFromEnv({ NODE_ENV: 'test', SHIP_IT_SEED: '-1' })).toThrow();
  });
});

describe('PORT', () => {
  it('defaults to 3000', () => {
    expect(portFromEnv({})).toBe(3000);
    expect(portFromEnv({ PORT: '' })).toBe(3000);
  });

  it('reads a numeric PORT', () => {
    expect(portFromEnv({ PORT: '8080' })).toBe(8080);
  });

  it('rejects anything that is not a port number', () => {
    expect(() => portFromEnv({ PORT: 'abc' })).toThrow();
    expect(() => portFromEnv({ PORT: '70000' })).toThrow();
    expect(() => portFromEnv({ PORT: '-1' })).toThrow();
  });
});
