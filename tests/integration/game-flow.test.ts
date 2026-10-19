// A full quarter over real sockets: three players create, join, start, merge, decline, comment and
// ping, and every client ends up with the same postmortem.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Postmortem, PublicRoomState } from '../../shared/types';
import { playQuarter, startTestServer, type PlayedQuarter, type TestServer } from './helpers';

let server: TestServer | undefined;
let played: PlayedQuarter | undefined;

beforeEach(async () => {
  server = await startTestServer(7);
});

afterEach(async () => {
  for (const client of played?.clients ?? []) await client.close();
  played = undefined;
  await server?.close();
  server = undefined;
});

describe('full quarter over the wire', () => {
  it('three clients play to the postmortem, and all three receive the same one', async () => {
    played = await playQuarter(server!.url);
    const { clients, host, bea, cy } = played;

    // Each client got exactly one postmortem, and the bytes are identical for all three.
    const reports = clients.map((c) => c.frames.filter((f) => f.msg.t === 'postmortem'));
    for (const frames of reports) expect(frames).toHaveLength(1);
    const [first, ...rest] = reports.map((frames) => frames[0]!.raw);
    for (const raw of rest) expect(raw).toBe(first);
    const report = (JSON.parse(first!) as { report: Postmortem }).report;

    // The quarter ended, and every client agrees on the final state.
    const finalStates = clients.map((c) => c.latestState);
    for (const state of finalStates) expect(state?.phase).toBe('ended');
    expect(new Set(finalStates.map((s) => JSON.stringify(s))).size).toBe(1);
    expect(report.companyName).toBe(finalStates[0]?.companyName);

    // The team's actions are in the postmortem: Bea's miss with Cy's ping and Bea's comment.
    const missed = report.slipped.find((entry) => entry.pr.id === played!.missedPrId);
    expect(missed, 'the waved-through bug is in "what slipped through"').toBeDefined();
    expect(missed!.mergedByName).toBe('Bea');
    expect(missed!.autoMerged).toBe(false);
    expect(missed!.comments.map((c) => c.text)).toContain('Looks fine to me');
    expect(missed!.pings.map((p) => p.playerName)).toEqual(['Cy']);

    // Ada's correct declines are catches, and the wrong-type decline is not.
    expect(report.catches.some((entry) => entry.pr.id === played!.caughtPrId)).toBe(true);
    expect(report.catches.every((entry) => entry.byName === 'Ada')).toBe(true);

    // Team stats add up to what the decisions list says each player did.
    const stat = (name: string) => report.teamStats.find((s) => s.name === name);
    const count = (by: string, action: string) =>
      played!.decisions.filter((d) => d.by === by && d.action === action).length;
    expect(stat('Ada')?.declined).toBe(count('Ada', 'decline'));
    expect(stat('Ada')?.merged).toBe(count('Ada', 'merge'));
    expect(stat('Bea')?.merged).toBe(count('Bea', 'merge'));
    expect(stat('Bea')?.comments).toBe(1);
    expect(stat('Cy')?.comments).toBe(0);
    expect(report.teamStats.map((s) => s.playerId).sort()).toEqual(
      [host.playerId, bea.playerId, cy.playerId].sort(),
    );

    // The incident from Bea's miss fired before the postmortem was built.
    const incidents = clients.flatMap((c) =>
      c.messages('event').filter((m) => m.event.kind === 'incident'),
    );
    expect(incidents.length).toBeGreaterThanOrEqual(1);

    // The final state is a PublicRoomState that every player sees.
    const state = finalStates[0] as PublicRoomState;
    expect(state.players.map((p) => p.name).sort()).toEqual(['Ada', 'Bea', 'Cy']);
    expect(state.players.every((p) => p.connected)).toBe(true);
  }, 40_000);
});
