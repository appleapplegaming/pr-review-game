// Sessions over real sockets: a player who reconnects with their playerId keeps their seat, host
// passes to the longest-connected player when the host drops, and the per-connection rate limit
// holds end to end.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { config } from '../../shared/config';
import { TestClient, playQuarter, startTestServer, until, type TestServer } from './helpers';

let server: TestServer | undefined;
const clients: TestClient[] = [];

function track(client: TestClient): TestClient {
  clients.push(client);
  return client;
}

/** Creates a room with Ada (host), Bea and Cy, all connected. */
async function threePlayers(url: string) {
  const ada = track(await TestClient.connect(url));
  ada.send({ t: 'create', name: 'Ada' });
  const code = await until(() => ada.code, 5_000, 'room code');
  const bea = track(await TestClient.connect(url));
  bea.send({ t: 'join', code, name: 'Bea' });
  const cy = track(await TestClient.connect(url));
  cy.send({ t: 'join', code, name: 'Cy' });
  const all = [ada, bea, cy];
  await until(() => all.every((c) => c.latestState?.players.length === 3), 5_000, 'three players');
  return { ada, bea, cy, code };
}

beforeEach(async () => {
  server = await startTestServer(11);
});

afterEach(async () => {
  for (const client of clients.splice(0)) await client.close();
  await server?.close();
  server = undefined;
});

describe('reconnect', () => {
  it('a player who rejoins with their playerId gets the same seat back', async () => {
    const { ada, bea, cy, code } = await threePlayers(server!.url);
    const seatsBefore = ada.latestState!.players.map((p) => p.id);
    const beaId = bea.playerId!;

    await bea.close();
    await until(
      () => ada.latestState?.players.find((p) => p.id === beaId)?.connected === false,
      5_000,
      'Ada to see Bea drop',
    );

    const bea2 = track(await TestClient.connect(server!.url));
    bea2.send({ t: 'join', code, name: 'Bea', playerId: beaId });
    await until(() => bea2.playerId, 5_000, 'welcome');
    expect(bea2.playerId).toBe(beaId);
    await until(
      () => ada.latestState?.players.find((p) => p.id === beaId)?.connected === true,
      5_000,
      'Bea back online',
    );

    // Same seats, same order, nobody new: Bea did not become a fourth player.
    expect(ada.latestState!.players.map((p) => p.id)).toEqual(seatsBefore);
    expect(cy.latestState!.players).toHaveLength(3);
    expect(bea2.messages('error')).toEqual([]);
  });

  it('a join with an unknown playerId makes a new seat, not a takeover', async () => {
    const { ada, code } = await threePlayers(server!.url);
    const stranger = track(await TestClient.connect(server!.url));
    stranger.send({ t: 'join', code, name: 'Eve', playerId: 'not-a-real-seat' });
    await until(() => stranger.playerId, 5_000, 'welcome');
    expect(stranger.playerId).not.toBe('not-a-real-seat');
    await until(() => ada.latestState?.players.length === 4, 5_000, 'a fourth seat');
    expect(ada.latestState!.players.map((p) => p.name)).toEqual(['Ada', 'Bea', 'Cy', 'Eve']);
  });
});

describe('reconnect after the quarter', () => {
  it('a player who rejoins after the quarter ended is sent the same postmortem', async () => {
    const played = await playQuarter(server!.url);
    played.clients.forEach(track);
    const { bea, host } = played;
    const code = host.code!;
    const beaId = bea.playerId!;
    const original = bea.messages('postmortem')[0]!.report;

    await bea.close();
    await until(
      () => host.latestState?.players.find((p) => p.id === beaId)?.connected === false,
      5_000,
      'Ada to see Bea drop',
    );
    const bea2 = track(await TestClient.connect(server!.url));
    bea2.send({ t: 'join', code, name: 'Bea', playerId: beaId });
    const report = await until(() => bea2.messages('postmortem')[0]?.report, 5_000, 'postmortem');
    expect(report).toEqual(original);
    expect(bea2.latestState?.phase).toBe('ended');
  }, 40_000);
});

describe('host handover', () => {
  it('when the host drops, the longest-connected player takes over, and the old host is not host again on rejoin', async () => {
    const { ada, bea, cy, code } = await threePlayers(server!.url);
    const adaId = ada.playerId!;
    const beaId = bea.playerId!;
    expect(cy.latestState!.hostId).toBe(adaId);

    await ada.close();
    await until(() => cy.latestState?.hostId === beaId, 5_000, 'Bea to become host');
    await until(() => bea.latestState?.hostId === beaId, 5_000, 'Bea to see herself as host');

    // Only the new host can rename. Cy's attempt is refused with NOT_HOST.
    cy.send({ t: 'rename', companyName: 'Cy Corp' });
    await until(() => cy.errors().length > 0, 5_000, 'Cy to be refused');
    expect(cy.errors()[0]?.code).toBe('NOT_HOST');

    bea.send({ t: 'rename', companyName: 'Bea Corp' });
    await until(() => cy.latestState?.companyName === 'Bea Corp', 5_000, 'rename to reach Cy');

    // Ada comes back into her old seat, but the host seat stays with Bea.
    const ada2 = track(await TestClient.connect(server!.url));
    ada2.send({ t: 'join', code, name: 'Ada', playerId: adaId });
    await until(() => ada2.playerId === adaId, 5_000, 'Ada welcome');
    await until(
      () => cy.latestState?.players.find((p) => p.id === adaId)?.connected === true,
      5_000,
      'Ada back online',
    );
    expect(cy.latestState!.hostId).toBe(beaId);
    ada2.send({ t: 'start' });
    await until(() => ada2.errors().length > 0, 5_000, 'Ada to be refused');
    expect(ada2.errors()[0]?.code).toBe('NOT_HOST');
  });
});

describe('rate limit', () => {
  it(`refuses frames past ${config.rateLimit.messages} in ${config.rateLimit.windowMs} ms, and recovers`, async () => {
    const ada = track(await TestClient.connect(server!.url));
    ada.send({ t: 'create', name: 'Ada' });
    await until(() => ada.code, 5_000, 'room code');

    // The create was frame 1 of 10. Frames 11 and 12 must be refused.
    for (let i = 1; i <= 11; i++) ada.send({ t: 'rename', companyName: `Corp ${i}` });
    await until(() => ada.errors().length === 2, 5_000, 'two refusals');
    expect(ada.errors().map((e) => e.code)).toEqual(['RATE_LIMITED', 'RATE_LIMITED']);
    expect(ada.isOpen()).toBe(true);

    // Only accepted renames changed the company name, so the last accepted one is Corp 9.
    await until(() => ada.latestState?.companyName === 'Corp 9', 5_000, 'Corp 9');

    // Once the window has passed, the connection is served again.
    await new Promise((resolve) => setTimeout(resolve, config.rateLimit.windowMs + 100));
    ada.send({ t: 'rename', companyName: 'Corp after the window' });
    await until(() => ada.latestState?.companyName === 'Corp after the window', 5_000, 'recovery');
    expect(ada.errors()).toHaveLength(2);
  });

  it('a malformed frame gets BAD_MESSAGE and the socket stays open', async () => {
    const ada = track(await TestClient.connect(server!.url));
    ada.send({ t: 'create', name: 'Ada' });
    await until(() => ada.code, 5_000, 'room code');
    ada.sendRaw('{not json');
    await until(() => ada.errors().length === 1, 5_000, 'BAD_MESSAGE');
    expect(ada.errors()[0]?.code).toBe('BAD_MESSAGE');
    expect(ada.isOpen()).toBe(true);
  });
});
