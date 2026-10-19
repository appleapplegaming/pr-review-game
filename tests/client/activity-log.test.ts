import { describe, expect, it } from 'vitest';
import { createStore, initialState, type ClientState } from '../../client/src/net/store';
import type { PublicRoomState, GameEvent } from '../../shared/types';
import {
  createActivityLog,
  feedStep,
  type FeedState,
} from '../../client/src/views/game/activity-log';

const EMPTY: FeedState = { quarter: null, lastId: 0, entries: [] };

function room(startedAt: number | null): PublicRoomState {
  return {
    code: 'ABCD',
    companyName: 'Acme',
    phase: startedAt === null ? 'lobby' : 'playing',
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

function withEvents(room: PublicRoomState | null, events: [number, GameEvent][]): ClientState {
  return {
    ...initialState(),
    session: room === null ? null : { playerId: 'me', code: 'ABCD' },
    room,
    events: events.map(([id, event]) => ({ id, event })),
    nextEventId: events.length + 1,
  };
}

const incident = (text: string, at: number): GameEvent => ({
  kind: 'incident',
  bugType: 'outage',
  text,
  at,
});

describe('feedStep', () => {
  it('appends new queue entries in order, with their text', () => {
    const state = withEvents(room(1_000), [
      [1, incident('First', 1_100)],
      [2, incident('Second', 1_200)],
    ]);
    const next = feedStep(EMPTY, state, 50);
    expect(next.entries.map((e) => [e.id, e.text, e.at])).toEqual([
      [1, 'First', 1_100],
      [2, 'Second', 1_200],
    ]);
    expect(next.lastId).toBe(2);
  });

  it('returns the same object when there is nothing new', () => {
    const state = withEvents(room(1_000), [[1, incident('First', 1_100)]]);
    const once = feedStep(EMPTY, state, 50);
    expect(feedStep(once, state, 50)).toBe(once);
  });

  it('keeps entries after the toast queue has dismissed them', () => {
    const shown = withEvents(room(1_000), [[1, incident('First', 1_100)]]);
    const once = feedStep(EMPTY, shown, 50);
    const dismissed = withEvents(room(1_000), []);
    const next = feedStep(once, dismissed, 50);
    expect(next.entries.map((e) => e.id)).toEqual([1]);
  });

  it('caps the feed at max, dropping the oldest', () => {
    const state = withEvents(room(1_000), [
      [1, incident('a', 1)],
      [2, incident('b', 2)],
      [3, incident('c', 3)],
    ]);
    const next = feedStep(EMPTY, state, 2);
    expect(next.entries.map((e) => e.id)).toEqual([2, 3]);
  });

  it('clears the feed when a new quarter starts, without replaying old events', () => {
    const old = feedStep(EMPTY, withEvents(room(1_000), [[1, incident('old', 1_100)]]), 50);
    const newQuarter = feedStep(old, withEvents(room(9_000), [[1, incident('old', 1_100)]]), 50);
    expect(newQuarter.entries).toEqual([]);
    expect(newQuarter.lastId).toBe(1);
    const next = feedStep(
      newQuarter,
      withEvents(room(9_000), [
        [1, incident('old', 1_100)],
        [2, incident('new', 9_500)],
      ]),
      50,
    );
    expect(next.entries.map((e) => e.text)).toEqual(['new']);
  });

  it('clears the feed when the session is lost', () => {
    const old = feedStep(EMPTY, withEvents(room(1_000), [[1, incident('a', 1_100)]]), 50);
    const lost = feedStep(old, withEvents(null, [[1, incident('a', 1_100)]]), 50);
    expect(lost.entries).toEqual([]);
  });
});

describe('createActivityLog', () => {
  it('records events from a store as they arrive', () => {
    const store = createStore();
    const log = createActivityLog(store);
    store.dispatch({ type: 'server', msg: { t: 'state', state: room(1_000) } });
    store.dispatch({ type: 'server', msg: { t: 'event', event: incident('Down', 1_500) } });
    expect(log.getEntries().map((e) => e.text)).toEqual(['Down']);
  });

  it('notifies subscribers only when the feed changes', () => {
    const store = createStore();
    const log = createActivityLog(store);
    let calls = 0;
    const off = log.subscribe(() => {
      calls += 1;
    });
    store.dispatch({ type: 'conn', conn: 'open' });
    expect(calls).toBe(0);
    store.dispatch({ type: 'server', msg: { t: 'state', state: room(1_000) } });
    store.dispatch({ type: 'server', msg: { t: 'event', event: incident('Down', 1_500) } });
    expect(calls).toBe(1);
    off();
  });
});
