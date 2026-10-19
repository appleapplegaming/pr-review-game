import { describe, expect, it } from 'vitest';
import { createStore, initialState, type ClientState } from '../../client/src/net/store';
import type { GameEvent, PublicRoomState } from '../../shared/types';
import {
  clearedPings,
  createPingTracker,
  pingStep,
  type PingState,
} from '../../client/src/views/game/ping-dot';

const EMPTY: PingState = { quarter: null, lastId: 0, unseen: [] };

function ping(prId: string, at = 1000): GameEvent {
  return { kind: 'ping', prId, prTitle: 'Title', playerId: 'p2', playerName: 'Sam', at };
}

function merge(prId: string): GameEvent {
  return { kind: 'merge', prId, prTitle: 'Title', by: null, byName: null, at: 1000 };
}

function room(startedAt: number | null): PublicRoomState {
  return {
    code: 'ABCD',
    companyName: 'Acme',
    phase: 'playing',
    hostId: null,
    players: [],
    startedAt,
    endsAt: null,
    totalPrs: 0,
    prs: [],
    metrics: { value: 0, downtimeMinutes: 0, uptime: 1, breaches: 0 },
    bankrupt: false,
  };
}

function withEvents(startedAt: number, events: [number, GameEvent][]): ClientState {
  return {
    ...initialState(),
    room: room(startedAt),
    session: { playerId: 'p1', code: 'ABCD' },
    events: events.map(([id, event]) => ({ id, event })),
  };
}

describe('pingStep', () => {
  it('collects the PR of each new ping', () => {
    const next = pingStep(
      EMPTY,
      withEvents(5, [
        [1, ping('pay-001')],
        [2, ping('auth-001')],
      ]),
    );
    expect(next.unseen).toEqual(['pay-001', 'auth-001']);
    expect(next.lastId).toBe(2);
  });

  it('ignores events that are not pings', () => {
    const next = pingStep(EMPTY, withEvents(5, [[1, merge('pay-001')]]));
    expect(next.unseen).toEqual([]);
    expect(next.lastId).toBe(1);
  });

  it('does not count the same ping twice, or a PR that already has one unseen', () => {
    const state = withEvents(5, [
      [1, ping('pay-001')],
      [2, ping('pay-001')],
    ]);
    const first = pingStep(EMPTY, state);
    expect(first.unseen).toEqual(['pay-001']);
    expect(pingStep(first, state)).toBe(first);
  });

  it('forgets unseen pings when a new quarter starts', () => {
    const old = pingStep(EMPTY, withEvents(5, [[1, ping('pay-001')]]));
    const next = pingStep(
      old,
      withEvents(9, [
        [1, ping('pay-001')],
        [2, ping('auth-001')],
      ]),
    );
    expect(next.unseen).toEqual(['auth-001']);
  });
});

describe('clearedPings', () => {
  it('empties the unseen list and keeps the id it has read up to', () => {
    const before: PingState = { quarter: 5, lastId: 3, unseen: ['pay-001'] };
    expect(clearedPings(before)).toEqual({ quarter: 5, lastId: 3, unseen: [] });
  });

  it('returns the same object when nothing is unseen', () => {
    const before: PingState = { quarter: 5, lastId: 3, unseen: [] };
    expect(clearedPings(before)).toBe(before);
  });
});

describe('createPingTracker', () => {
  it('records pings from the store as they arrive, without waiting for the toast queue', () => {
    const store = createStore({
      ...initialState(),
      room: room(5),
      session: { playerId: 'p1', code: 'ABCD' },
    });
    const tracker = createPingTracker(store);
    store.dispatch({ type: 'server', msg: { t: 'event', event: ping('pay-001') } });
    expect(tracker.getState().unseen).toEqual(['pay-001']);
    store.dispatch({ type: 'dismissEvent', id: 1 });
    expect(tracker.getState().unseen).toEqual(['pay-001']);
  });

  it('clear() empties the list and notifies subscribers', () => {
    const store = createStore({
      ...initialState(),
      room: room(5),
      session: { playerId: 'p1', code: 'ABCD' },
    });
    const tracker = createPingTracker(store);
    store.dispatch({ type: 'server', msg: { t: 'event', event: ping('pay-001') } });
    let calls = 0;
    tracker.subscribe(() => calls++);
    tracker.clear();
    expect(tracker.getState().unseen).toEqual([]);
    expect(calls).toBe(1);
  });
});
