import { describe, expect, it } from 'vitest';
import type { Bug, BugType, PullRequest } from '../../shared/types';
import { config } from '../../shared/config';
import { createRng } from '../../server/engine/rng';
import { createRooms, type RoomClock, type Rooms } from '../../server/rooms';
import { COMPANY_NAMES } from '../../server/company-names';

const T0 = 1_700_000_000_000;
const CODE_PATTERN = /^[A-HJ-NP-Z]{4}$/;
const THIRTY_MIN = config.roomCleanupMs;

/** A fake clock. Timers fire only when a test advances time, so cleanup is fully deterministic. */
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

  advance(ms: number): void {
    const target = this.t + ms;
    for (;;) {
      let next: [number, { at: number; fn: () => void }] | undefined;
      for (const entry of this.timers) {
        if (entry[1].at <= target && (next === undefined || entry[1].at < next[1].at)) {
          next = entry;
        }
      }
      if (next === undefined) break;
      this.timers.delete(next[0]);
      this.t = next[1].at;
      next[1].fn();
    }
    this.t = target;
  }
}

function makePr(id: string, bugType: BugType | null): PullRequest {
  const bug: Bug | null =
    bugType === null
      ? null
      : {
          type: bugType,
          severity: 'major',
          lines: [6],
          explanation: `Explanation for ${id}.`,
          incident: `Incident for ${id}.`,
        };
  return {
    id,
    title: `PR ${id}`,
    author: 'test.user',
    area: 'payments',
    description: `Description for ${id}.`,
    language: 'ts',
    diff: '@@ a.ts @@\n const a = 1;',
    featureValue: 800_000,
    bug,
  };
}

/** A pool with the SPEC's target mix: 9 clean, 7 money, 7 security, 7 outage. */
function fullPool(): PullRequest[] {
  const mix: [BugType | null, number][] = [
    [null, 9],
    ['money', 7],
    ['security', 7],
    ['outage', 7],
  ];
  return mix.flatMap(([type, count], group) =>
    Array.from({ length: count }, (_, i) =>
      makePr(`t-${group}-${String(i + 1).padStart(2, '0')}`, type),
    ),
  );
}

function setup(
  options: { random?: () => number; codes?: () => string; playerIds?: () => string } = {},
) {
  const clock = new FakeClock();
  const rooms: Rooms = createRooms({
    clock,
    random: options.random ?? createRng(7).next,
    newCode: options.codes,
    newPlayerId: options.playerIds,
    pool: fullPool(),
  });
  return { clock, rooms };
}

/** A code source that returns the scripted codes in order, then 'ZZZZ' forever. */
function scriptedStrings(codes: string[]): () => string {
  const queue = [...codes];
  return () => queue.shift() ?? 'ZZZZ';
}

describe('room codes', () => {
  it('generates codes that match the unambiguous 4-letter pattern', () => {
    const { rooms } = setup();
    for (let i = 0; i < 50; i++) {
      const created = rooms.create('Sara');
      expect(created.ok).toBe(true);
      if (created.ok) expect(created.code).toMatch(CODE_PATTERN);
    }
  });

  it('never hands out a code that a live room already uses', () => {
    // The first two rooms draw the same code. The registry must retry for a fresh one.
    const { rooms } = setup({ codes: scriptedStrings(['AAAA', 'AAAA', 'BBBB']) });
    const first = rooms.create('Sara');
    const second = rooms.create('Tom');
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(first.code).toBe('AAAA');
      expect(second.code).toBe('BBBB');
    }
  });

  it('frees a code once its room is deleted', () => {
    const { rooms, clock } = setup({ codes: scriptedStrings(['AAAA', 'AAAA']) });
    const first = rooms.create('Sara');
    if (!first.ok) throw new Error('create failed');
    rooms.disconnect(first.code, first.playerId);
    clock.advance(THIRTY_MIN);
    expect(rooms.view(first.code)).toBeNull();

    // The same draw now yields AAAA again, because nothing live holds it.
    const reused = rooms.create('Tom');
    expect(reused.ok && reused.code).toBe('AAAA');
  });
});

describe('create and join', () => {
  it('creates a lobby with the creator as connected host', () => {
    const { rooms } = setup();
    const created = rooms.create('  Sara  ');
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.state.phase).toBe('lobby');
    expect(created.state.hostId).toBe(created.playerId);
    expect(created.state.players).toEqual([
      expect.objectContaining({
        id: created.playerId,
        name: 'Sara',
        isHost: true,
        connected: true,
      }),
    ]);
  });

  it('gives a new room a company name from the funny-name list', () => {
    const { rooms } = setup();
    const created = rooms.create('Sara');
    if (!created.ok) throw new Error('create failed');
    expect(COMPANY_NAMES).toContain(created.state.companyName);
  });

  it.each([
    ['empty', ''],
    ['only spaces', '     '],
    ['21 characters', 'a'.repeat(21)],
    ['21 characters after trimming', ` ${'a'.repeat(21)} `],
    ['a control character', 'Sa\nra'],
  ])('rejects a player name that is %s', (_label, name) => {
    const { rooms } = setup();
    const result = rooms.create(name);
    expect(result).toMatchObject({ ok: false, code: 'INVALID_NAME' });
  });

  it('accepts a name of exactly 20 characters', () => {
    const { rooms } = setup();
    const result = rooms.create('a'.repeat(20));
    expect(result.ok).toBe(true);
  });

  it('joins a room by code, case-insensitively, and lists the new player', () => {
    const { rooms } = setup();
    const created = rooms.create('Sara');
    if (!created.ok) throw new Error('create failed');
    const joined = rooms.join(created.code.toLowerCase(), 'Tom');
    expect(joined.ok).toBe(true);
    if (!joined.ok) return;
    expect(joined.code).toBe(created.code);
    expect(joined.state.players.map((p) => p.name)).toEqual(['Sara', 'Tom']);
    expect(joined.state.players[1]?.connected).toBe(true);
  });

  it('rejects an unknown code with ROOM_NOT_FOUND', () => {
    const { rooms } = setup();
    expect(rooms.join('ZZZZ', 'Tom')).toMatchObject({ ok: false, code: 'ROOM_NOT_FOUND' });
  });

  it.each([
    ['I-containing', 'AIBC'],
    ['O-containing', 'AOBC'],
    ['too short', 'ABC'],
    ['junk', '<AB>'],
  ])('rejects a malformed %s code with ROOM_NOT_FOUND', (_label, code) => {
    const { rooms } = setup();
    rooms.create('Sara');
    expect(rooms.join(code, 'Tom')).toMatchObject({ ok: false, code: 'ROOM_NOT_FOUND' });
  });

  it.each([
    ['empty', ''],
    ['21 characters', 'b'.repeat(21)],
  ])('rejects a join with a %s name', (_label, name) => {
    const { rooms } = setup();
    const created = rooms.create('Sara');
    if (!created.ok) throw new Error('create failed');
    expect(rooms.join(created.code, name)).toMatchObject({ ok: false, code: 'INVALID_NAME' });
  });

  it('lets a player join mid-quarter', () => {
    const { rooms, clock } = setup();
    const created = rooms.create('Sara');
    if (!created.ok) throw new Error('create failed');
    expect(rooms.start(created.code, created.playerId).ok).toBe(true);
    clock.advance(30_000);
    const late = rooms.join(created.code, 'Tom');
    expect(late.ok).toBe(true);
    if (late.ok) expect(late.state.phase).toBe('playing');
  });
});

describe('rejoin by playerId', () => {
  it('restores the same seat after a disconnect', () => {
    const { rooms } = setup();
    const created = rooms.create('Sara');
    if (!created.ok) throw new Error('create failed');
    rooms.disconnect(created.code, created.playerId);

    const back = rooms.join(created.code, 'Sara', created.playerId);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.playerId).toBe(created.playerId);
    expect(back.state.players).toHaveLength(1);
    expect(back.state.players[0]).toMatchObject({ connected: true, isHost: true });
  });

  it('keeps the original joinedAt when a player rejoins', () => {
    const { rooms, clock } = setup();
    const created = rooms.create('Sara');
    if (!created.ok) throw new Error('create failed');
    const other = rooms.join(created.code, 'Tom');
    if (!other.ok) throw new Error('join failed');
    const tomJoinedAt = other.state.players[1]?.joinedAt;
    rooms.disconnect(created.code, other.playerId);
    clock.advance(60_000);
    const back = rooms.join(created.code, 'Tom', other.playerId);
    if (!back.ok) throw new Error('rejoin failed');
    expect(back.state.players[1]?.joinedAt).toBe(tomJoinedAt);
  });

  it('treats an unknown playerId as a new player', () => {
    const { rooms } = setup();
    const created = rooms.create('Sara');
    if (!created.ok) throw new Error('create failed');
    const joined = rooms.join(created.code, 'Tom', 'not-a-real-id');
    expect(joined.ok).toBe(true);
    if (joined.ok) {
      expect(joined.playerId).not.toBe('not-a-real-id');
      expect(joined.state.players).toHaveLength(2);
    }
  });

  it('does not let a playerId from one room open a seat in another', () => {
    const { rooms } = setup({ codes: scriptedStrings(['AAAA', 'BBBB']) });
    const a = rooms.create('Sara');
    const b = rooms.create('Tom');
    if (!a.ok || !b.ok) throw new Error('create failed');
    const cross = rooms.join(b.code, 'Sara', a.playerId);
    if (!cross.ok) throw new Error('join failed');
    expect(cross.playerId).not.toBe(a.playerId);
    expect(cross.state.players).toHaveLength(2);
  });
});

describe('host-only actions and handover', () => {
  it('rejects start, rename and playAgain from a guest with NOT_HOST', () => {
    const { rooms } = setup();
    const host = rooms.create('Sara');
    if (!host.ok) throw new Error('create failed');
    const guest = rooms.join(host.code, 'Tom');
    if (!guest.ok) throw new Error('join failed');

    expect(rooms.start(host.code, guest.playerId)).toMatchObject({ ok: false, code: 'NOT_HOST' });
    expect(rooms.rename(host.code, guest.playerId, 'Pwned Inc')).toMatchObject({
      ok: false,
      code: 'NOT_HOST',
    });
    expect(rooms.playAgain(host.code, guest.playerId)).toMatchObject({
      ok: false,
      code: 'NOT_HOST',
    });
  });

  it('starts the quarter for the host and rejects a second start', () => {
    const { rooms, clock } = setup();
    const host = rooms.create('Sara');
    if (!host.ok) throw new Error('create failed');
    const started = rooms.start(host.code, host.playerId);
    expect(started.ok).toBe(true);
    if (started.ok) {
      expect(started.state.phase).toBe('playing');
      expect(started.state.startedAt).toBe(clock.now());
      expect(started.state.endsAt).toBe(clock.now() + config.quarterMs);
    }
    expect(rooms.start(host.code, host.playerId)).toMatchObject({
      ok: false,
      code: 'WRONG_PHASE',
    });
  });

  it('hands host to the player who has been in the room longest when the host leaves', () => {
    const { rooms, clock } = setup();
    const host = rooms.create('Sara');
    if (!host.ok) throw new Error('create failed');
    clock.advance(1_000);
    const tom = rooms.join(host.code, 'Tom');
    clock.advance(1_000);
    const ann = rooms.join(host.code, 'Ann');
    if (!tom.ok || !ann.ok) throw new Error('join failed');

    rooms.disconnect(host.code, host.playerId);
    const view = rooms.view(host.code);
    expect(view?.hostId).toBe(tom.playerId);
    expect(view?.players.find((p) => p.id === tom.playerId)?.isHost).toBe(true);
    expect(view?.players.find((p) => p.id === ann.playerId)?.isHost).toBe(false);
  });

  it('skips disconnected players when choosing the new host', () => {
    const { rooms, clock } = setup();
    const host = rooms.create('Sara');
    if (!host.ok) throw new Error('create failed');
    clock.advance(1_000);
    const tom = rooms.join(host.code, 'Tom');
    clock.advance(1_000);
    const ann = rooms.join(host.code, 'Ann');
    if (!tom.ok || !ann.ok) throw new Error('join failed');

    rooms.disconnect(host.code, tom.playerId);
    rooms.disconnect(host.code, host.playerId);
    expect(rooms.view(host.code)?.hostId).toBe(ann.playerId);
  });

  it('keeps host when a guest leaves', () => {
    const { rooms } = setup();
    const host = rooms.create('Sara');
    if (!host.ok) throw new Error('create failed');
    const tom = rooms.join(host.code, 'Tom');
    if (!tom.ok) throw new Error('join failed');
    rooms.disconnect(host.code, tom.playerId);
    expect(rooms.view(host.code)?.hostId).toBe(host.playerId);
  });

  it('keeps the host seat when the host is the only one connected, so a rejoin restores host', () => {
    const { rooms } = setup();
    const host = rooms.create('Sara');
    if (!host.ok) throw new Error('create failed');
    rooms.disconnect(host.code, host.playerId);
    const back = rooms.join(host.code, 'Sara', host.playerId);
    expect(back.ok && back.state.hostId).toBe(host.playerId);
  });

  it('the new host can start the quarter', () => {
    const { rooms, clock } = setup();
    const host = rooms.create('Sara');
    if (!host.ok) throw new Error('create failed');
    clock.advance(1_000);
    const tom = rooms.join(host.code, 'Tom');
    if (!tom.ok) throw new Error('join failed');
    rooms.disconnect(host.code, host.playerId);
    expect(rooms.start(host.code, tom.playerId).ok).toBe(true);
  });
});

describe('company name rename', () => {
  it('lets the host rename in the lobby, trimmed', () => {
    const { rooms } = setup();
    const host = rooms.create('Sara');
    if (!host.ok) throw new Error('create failed');
    const renamed = rooms.rename(host.code, host.playerId, '  Acme Corp  ');
    expect(renamed.ok && renamed.state.companyName).toBe('Acme Corp');
  });

  it.each([
    ['empty', '   '],
    ['41 characters', 'c'.repeat(41)],
  ])('rejects a %s company name', (_label, name) => {
    const { rooms } = setup();
    const host = rooms.create('Sara');
    if (!host.ok) throw new Error('create failed');
    expect(rooms.rename(host.code, host.playerId, name)).toMatchObject({
      ok: false,
      code: 'INVALID_COMPANY_NAME',
    });
  });

  it('accepts a company name of exactly 40 characters', () => {
    const { rooms } = setup();
    const host = rooms.create('Sara');
    if (!host.ok) throw new Error('create failed');
    expect(rooms.rename(host.code, host.playerId, 'c'.repeat(40)).ok).toBe(true);
  });

  it('refuses to rename once the quarter is running', () => {
    const { rooms } = setup();
    const host = rooms.create('Sara');
    if (!host.ok) throw new Error('create failed');
    rooms.start(host.code, host.playerId);
    expect(rooms.rename(host.code, host.playerId, 'Late Rename')).toMatchObject({
      ok: false,
      code: 'WRONG_PHASE',
    });
  });
});

describe('play again', () => {
  it('returns an ended room to the lobby with the same players, then a new quarter starts', () => {
    const { rooms, clock } = setup();
    const host = rooms.create('Sara');
    if (!host.ok) throw new Error('create failed');
    const tom = rooms.join(host.code, 'Tom');
    if (!tom.ok) throw new Error('join failed');
    rooms.start(host.code, host.playerId);
    clock.advance(config.quarterMs);
    rooms.tick(host.code);
    expect(rooms.view(host.code)?.phase).toBe('ended');

    const again = rooms.playAgain(host.code, host.playerId);
    expect(again.ok).toBe(true);
    if (again.ok) {
      expect(again.state.phase).toBe('lobby');
      expect(again.state.prs).toEqual([]);
      expect(again.state.players.map((p) => p.id)).toEqual([host.playerId, tom.playerId]);
    }
    expect(rooms.start(host.code, host.playerId).ok).toBe(true);
  });

  it('rejects playAgain while the quarter is still running', () => {
    const { rooms } = setup();
    const host = rooms.create('Sara');
    if (!host.ok) throw new Error('create failed');
    rooms.start(host.code, host.playerId);
    expect(rooms.playAgain(host.code, host.playerId)).toMatchObject({
      ok: false,
      code: 'WRONG_PHASE',
    });
  });
});

describe('cleanup', () => {
  it('survives 29:59 after the last disconnect and is gone at 30:00', () => {
    const { rooms, clock } = setup();
    const host = rooms.create('Sara');
    if (!host.ok) throw new Error('create failed');
    rooms.disconnect(host.code, host.playerId);

    clock.advance(THIRTY_MIN - 1);
    expect(rooms.view(host.code)).not.toBeNull();
    clock.advance(1);
    expect(rooms.view(host.code)).toBeNull();
  });

  it('a reconnect resets the timer', () => {
    const { rooms, clock } = setup();
    const host = rooms.create('Sara');
    if (!host.ok) throw new Error('create failed');
    rooms.disconnect(host.code, host.playerId);
    clock.advance(20 * 60_000);
    rooms.join(host.code, 'Sara', host.playerId);
    rooms.disconnect(host.code, host.playerId);

    clock.advance(THIRTY_MIN - 1);
    expect(rooms.view(host.code)).not.toBeNull();
    clock.advance(1);
    expect(rooms.view(host.code)).toBeNull();
  });

  it('a room with someone still connected is never deleted', () => {
    const { rooms, clock } = setup();
    const host = rooms.create('Sara');
    if (!host.ok) throw new Error('create failed');
    const tom = rooms.join(host.code, 'Tom');
    if (!tom.ok) throw new Error('join failed');
    rooms.disconnect(host.code, host.playerId);
    clock.advance(2 * THIRTY_MIN);
    expect(rooms.view(host.code)).not.toBeNull();
  });

  it('leaves no timers behind once someone reconnects', () => {
    const { rooms, clock } = setup();
    const host = rooms.create('Sara');
    if (!host.ok) throw new Error('create failed');
    rooms.disconnect(host.code, host.playerId);
    expect(clock.pendingTimers()).toBe(1);
    rooms.join(host.code, 'Sara', host.playerId);
    expect(clock.pendingTimers()).toBe(0);
  });

  it('leaves no timers behind after deletion', () => {
    const { rooms, clock } = setup();
    const host = rooms.create('Sara');
    if (!host.ok) throw new Error('create failed');
    rooms.disconnect(host.code, host.playerId);
    clock.advance(THIRTY_MIN);
    expect(clock.pendingTimers()).toBe(0);
  });
});

describe('intents and the clock', () => {
  /** A started room with one spawned, open PR for the host to act on. */
  function playingRoom() {
    const { rooms, clock } = setup();
    const host = rooms.create('Sara');
    if (!host.ok) throw new Error('create failed');
    rooms.start(host.code, host.playerId);
    clock.advance(30_000);
    rooms.tick(host.code);
    const view = rooms.view(host.code);
    const open = view?.prs.find((p) => p.status === 'open');
    if (open === undefined) throw new Error('no PR spawned');
    return { rooms, clock, host, prId: open.id };
  }

  it('rejects an intent from someone who is not in the room', () => {
    const { rooms, host, prId } = playingRoom();
    expect(rooms.intent(host.code, 'stranger', { t: 'merge', prId })).toMatchObject({
      ok: false,
      code: 'NOT_IN_ROOM',
    });
  });

  it('applies a merge and names the merger', () => {
    const { rooms, host, prId } = playingRoom();
    const result = rooms.intent(host.code, host.playerId, { t: 'merge', prId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.events).toContainEqual(
      expect.objectContaining({ kind: 'merge', byName: 'Sara' }),
    );
    expect(result.state.prs.find((p) => p.id === prId)?.resolution).toMatchObject({
      kind: 'merged',
      byName: 'Sara',
    });
  });

  it('advances the clock before applying an intent, so an expired PR is already auto-merged', () => {
    const { rooms, clock, host, prId } = playingRoom();
    clock.advance(config.prTimerMs + 1_000);
    const result = rooms.intent(host.code, host.playerId, { t: 'merge', prId });
    expect(result).toMatchObject({ ok: false, code: 'PR_NOT_OPEN' });
  });

  it('returns the auto-merge events even when the intent itself is rejected', () => {
    const { rooms, clock, host, prId } = playingRoom();
    clock.advance(config.prTimerMs + 1_000);
    const result = rooms.intent(host.code, host.playerId, { t: 'merge', prId });
    expect(result.events).toContainEqual(expect.objectContaining({ kind: 'merge', by: null }));
  });

  it('reports changed when a tick spawns a PR, and not on an idle tick', () => {
    const { rooms, clock, host } = playingRoom();
    const idle = rooms.tick(host.code);
    expect(idle).toMatchObject({ ok: true, changed: false });

    clock.advance(1_000_000);
    const busy = rooms.tick(host.code);
    expect(busy).toMatchObject({ ok: true, changed: true });
  });

  it('the postmortem is only available once the quarter has ended', () => {
    const { rooms, clock, host } = playingRoom();
    expect(rooms.postmortem(host.code)).toBeNull();
    clock.advance(config.quarterMs);
    rooms.tick(host.code);
    expect(rooms.view(host.code)?.phase).toBe('ended');
    expect(rooms.postmortem(host.code)).not.toBeNull();
  });

  it('the same injected randomness and clock replay the same quarter', () => {
    const run = () => {
      const ids = scriptedStrings(['p1', 'p2', 'p3', 'p4']);
      const { rooms, clock } = setup({ random: createRng(99).next, playerIds: ids });
      const host = rooms.create('Sara');
      if (!host.ok) throw new Error('create failed');
      rooms.start(host.code, host.playerId);
      clock.advance(config.quarterMs);
      rooms.tick(host.code);
      return rooms.postmortem(host.code);
    };
    expect(run()).toEqual(run());
  });

  it('answers unknown rooms with ROOM_NOT_FOUND', () => {
    const { rooms } = setup();
    expect(rooms.start('ZZZZ', 'x')).toMatchObject({ ok: false, code: 'ROOM_NOT_FOUND' });
    expect(rooms.view('ZZZZ')).toBeNull();
  });
});
