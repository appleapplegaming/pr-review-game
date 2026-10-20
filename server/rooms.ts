// Room registry: codes, create and join, rejoin by playerId, host handover, cleanup and the
// host-only lobby and play-again actions. It is a thin adapter around the pure engine in
// server/engine/: it owns the clock, the randomness and the per-room Rng, and nothing else.
//
// Trust: every string here came from a client. Codes, names and company names are normalised
// and checked before use, and a playerId is looked up only inside the room it names. playerIds
// come from crypto.randomUUID() by default, so they are unguessable and act as the rejoin secret.

import { randomUUID } from 'node:crypto';
import type {
  ErrorCode,
  GameEvent,
  Postmortem,
  PublicRoomState,
  PullRequest,
} from '../shared/types';
import type { Intent } from '../shared/protocol';
import { config } from '../shared/config';
import { applyIntent } from './engine/apply-intent';
import { createRng, type Rng } from './engine/rng';
import { replanUpcoming, startQuarter } from './engine/setup';
import { tick as engineTick } from './engine/tick';
import { toPublicState } from './engine/projection';
import { postmortem as buildPostmortem } from './engine/postmortem';
import { defaultTiming, type GameState, type ServerPlayer, type Timing } from './engine/state';
import { randomCompanyName } from './company-names';

/** Room codes use these 24 letters: A-Z without I and O. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const CODE_PATTERN = /^[A-HJ-NP-Z]{4}$/;
/** Control characters (including newlines and tabs) are never allowed in a name. */
const CONTROL_CHARACTER = /\p{Cc}/u;
/** How many fresh codes to try before giving up. With 24^4 codes this never runs out in practice. */
const MAX_CODE_ATTEMPTS = 100;

/** The clock and timers. Injected so tests can run the 30-minute cleanup in no time. */
export interface RoomClock {
  now(): number;
  /** Runs `fn` after `ms` and returns a handle for clearTimer. */
  setTimer(fn: () => void, ms: number): number;
  clearTimer(handle: number): void;
}

export interface RoomsOptions {
  clock: RoomClock;
  /** Uniform numbers in [0, 1). Used for room seeds, company names and generated codes. */
  random: () => number;
  /** Source of new room codes. Defaults to random 4-letter codes, and the registry retries on a clash. */
  newCode?: () => string;
  /** Source of new player ids. Defaults to crypto.randomUUID(). */
  newPlayerId?: () => string;
  /** The PR pool every quarter draws from. */
  pool: readonly PullRequest[];
  /** Fixed seed for every room's PR draw. Test-only: makes e2e quarters repeatable. */
  roomSeed?: number;
  /** Quarter timing. Defaults to shared/config.ts; the e2e tests pass a scaled copy. */
  timing?: Timing;
}

export interface Joined {
  ok: true;
  code: string;
  playerId: string;
  state: PublicRoomState;
}

export interface Done {
  ok: true;
  state: PublicRoomState;
  /** Events from the clock catching up, plus any the intent itself caused, in order. */
  events: GameEvent[];
}

export interface Failed {
  ok: false;
  code: ErrorCode;
  message: string;
  /** Events from the clock catching up before the failure. Still broadcast them. */
  events: GameEvent[];
}

export type JoinResult = Joined | Failed;
export type Acted = Done | Failed;
export type TickResult = Done & {
  /** True when the tick spawned, resolved or ended something. An idle tick is false. */
  changed: boolean;
};

export interface Rooms {
  create(name: string): JoinResult;
  join(code: string, name: string, playerId?: string): JoinResult;
  /** Marks a player disconnected. Starts the 30-minute cleanup if nobody is left connected. */
  disconnect(code: string, playerId: string): void;
  /** `minutes` is the game length; omit it for the default. Must be one of config.durationMinutes.options. */
  start(code: string, playerId: string, minutes?: number): Acted;
  rename(code: string, playerId: string, companyName: string): Acted;
  playAgain(code: string, playerId: string): Acted;
  intent(code: string, playerId: string, intent: Intent): Acted;
  tick(code: string): TickResult | Failed;
  view(code: string): PublicRoomState | null;
  postmortem(code: string): Postmortem | null;
}

interface Room {
  code: string;
  state: GameState;
  rng: Rng;
  /** The pending cleanup timer, or null while someone is connected. */
  cleanup: number | null;
  /** How many players the running quarter's PRs are planned for. */
  plannedFor: number;
  /** When each disconnected player left. They still count until config.leaveGraceMs has passed. */
  leftAt: Map<string, number>;
}

/** A random code of the configured length, drawn from CODE_ALPHABET. */
export function generateCode(random: () => number): string {
  let code = '';
  for (let i = 0; i < config.roomCodeLength; i++) {
    const index = Math.min(CODE_ALPHABET.length - 1, Math.floor(random() * CODE_ALPHABET.length));
    code += CODE_ALPHABET.charAt(index);
  }
  return code;
}

/** Trims and checks a client-supplied name. Returns null when it is not acceptable. */
function cleanText(raw: unknown, min: number, max: number): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  const length = [...trimmed].length;
  if (length < min || length > max || CONTROL_CHARACTER.test(trimmed)) return null;
  return trimmed;
}

/** Upper-cases and checks a client-supplied code. Anything that isn't a code of ours is null. */
function normalizeCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.trim().toUpperCase();
  return CODE_PATTERN.test(code) ? code : null;
}

/** The connected player who has been in the room longest, or undefined if nobody is connected. */
function longestConnected(players: readonly ServerPlayer[]): ServerPlayer | undefined {
  let best: ServerPlayer | undefined;
  for (const player of players) {
    if (!player.connected) continue;
    if (best === undefined || player.joinedAt < best.joinedAt) best = player;
  }
  return best;
}

function fail(code: ErrorCode, message: string, events: GameEvent[] = []): Failed {
  return { ok: false, code, message, events };
}

export function createRooms(options: RoomsOptions): Rooms {
  const { clock, random, pool } = options;
  const timing = options.timing ?? defaultTiming();
  const newPlayerId = options.newPlayerId ?? randomUUID;
  const newCode = options.newCode ?? (() => generateCode(random));
  const rooms = new Map<string, Room>();

  function allocateCode(): string {
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
      const code = newCode();
      if (!rooms.has(code)) return code;
    }
    throw new Error(`no free room code after ${MAX_CODE_ATTEMPTS} attempts`);
  }

  function findRoom(code: string): Room | null {
    const key = normalizeCode(code);
    return key === null ? null : (rooms.get(key) ?? null);
  }

  /** Finds the room and checks the playerId is seated in it. */
  function seated(code: string, playerId: string): { room: Room } | Failed {
    const room = findRoom(code);
    if (room === null) return fail('ROOM_NOT_FOUND', 'No room has that code');
    if (!room.state.players.some((p) => p.id === playerId)) {
      return fail('NOT_IN_ROOM', 'You are not in this room');
    }
    return { room };
  }

  function hostOnly(room: Room, playerId: string): Failed | null {
    return room.state.hostId === playerId ? null : fail('NOT_HOST', 'Only the host can do that');
  }

  function done(room: Room, events: GameEvent[] = []): Done {
    return { ok: true, state: toPublicState(room.state), events };
  }

  /** Cancels any pending cleanup, because someone is connected again. */
  function cancelCleanup(room: Room): void {
    if (room.cleanup !== null) clock.clearTimer(room.cleanup);
    room.cleanup = null;
  }

  function scheduleCleanup(room: Room): void {
    cancelCleanup(room);
    room.cleanup = clock.setTimer(() => {
      // Only delete the room this timer was set for. A reused code must not hit a newer room.
      if (rooms.get(room.code) === room) rooms.delete(room.code);
    }, config.roomCleanupMs);
  }

  /**
   * Re-plans the quarter's PRs still to spawn when the number of active players has changed.
   * Active means connected, or gone for less than config.leaveGraceMs. Returns true if it did.
   */
  function replanForPlayers(room: Room): boolean {
    const now = clock.now();
    for (const [id, at] of room.leftAt) {
      if (now - at >= config.leaveGraceMs) room.leftAt.delete(id);
    }
    const active = room.state.players.filter((p) => p.connected || room.leftAt.has(p.id)).length;
    const { quarter } = room.state;
    if (room.state.phase !== 'playing' || quarter === null || active === room.plannedFor) {
      return false;
    }
    room.plannedFor = active;
    const replanned = replanUpcoming(quarter, pool, active, room.rng, now);
    if (replanned === quarter) return false;
    room.state = { ...room.state, quarter: replanned };
    return true;
  }

  function create(rawName: string): JoinResult {
    const name = cleanText(rawName, config.name.min, config.name.max);
    if (name === null) return fail('INVALID_NAME', 'Names must be 1 to 20 characters');

    const code = allocateCode();
    const playerId = newPlayerId();
    const room: Room = {
      code,
      state: {
        code,
        companyName: randomCompanyName(random),
        hostId: playerId,
        players: [{ id: playerId, name, joinedAt: clock.now(), connected: true }],
        phase: 'lobby',
        quarter: null,
      },
      rng: createRng(options.roomSeed ?? Math.floor(random() * 2 ** 32)),
      cleanup: null,
      plannedFor: 0,
      leftAt: new Map(),
    };
    rooms.set(code, room);
    return { ok: true, code, playerId, state: toPublicState(room.state) };
  }

  function join(rawCode: string, rawName: string, playerId?: string): JoinResult {
    const room = findRoom(rawCode);
    if (room === null) return fail('ROOM_NOT_FOUND', 'No room has that code');
    const name = cleanText(rawName, config.name.min, config.name.max);
    if (name === null) return fail('INVALID_NAME', 'Names must be 1 to 20 characters');

    const existing = room.state.players.find((p) => p.id === playerId);
    let seatId: string;
    if (existing !== undefined) {
      // Rejoin: same seat, same joinedAt, so host handover order is unchanged.
      seatId = existing.id;
      room.state = {
        ...room.state,
        players: room.state.players.map((p) =>
          p.id === seatId ? { ...p, name, connected: true } : p,
        ),
      };
    } else {
      seatId = newPlayerId();
      room.state = {
        ...room.state,
        players: [
          ...room.state.players,
          { id: seatId, name, joinedAt: clock.now(), connected: true },
        ],
      };
    }
    room.leftAt.delete(seatId);
    cancelCleanup(room);
    replanForPlayers(room);
    return { ok: true, code: room.code, playerId: seatId, state: toPublicState(room.state) };
  }

  function disconnect(rawCode: string, playerId: string): void {
    const room = findRoom(rawCode);
    if (room === null) return;
    const leaving = room.state.players.find((p) => p.id === playerId);
    if (leaving === undefined || !leaving.connected) return;

    room.state = {
      ...room.state,
      players: room.state.players.map((p) => (p.id === playerId ? { ...p, connected: false } : p)),
    };
    room.leftAt.set(playerId, clock.now());

    // Host handover: the longest-connected player takes over. If nobody else is connected, the
    // host seat stays put, so the host gets it back on rejoin.
    if (room.state.hostId === playerId) {
      const successor = longestConnected(room.state.players);
      if (successor !== undefined) room.state = { ...room.state, hostId: successor.id };
    }

    if (longestConnected(room.state.players) === undefined) scheduleCleanup(room);
  }

  function start(rawCode: string, playerId: string, minutes?: number): Acted {
    const seat = seated(rawCode, playerId);
    if (!('room' in seat)) return seat;
    const { room } = seat;
    const notHost = hostOnly(room, playerId);
    if (notHost !== null) return notHost;
    if (room.state.phase !== 'lobby') return fail('WRONG_PHASE', 'The quarter has already started');
    const offered: readonly number[] = config.durationMinutes.options;
    if (minutes !== undefined && !offered.includes(minutes)) {
      return fail('INVALID_DURATION', `Game length must be ${offered.join(', ')} minutes`);
    }
    room.state = startQuarter(room.state, pool, room.rng, clock.now(), timing, minutes);
    room.plannedFor = room.state.players.length;
    return done(room);
  }

  function rename(rawCode: string, playerId: string, companyName: string): Acted {
    const seat = seated(rawCode, playerId);
    if (!('room' in seat)) return seat;
    const { room } = seat;
    const notHost = hostOnly(room, playerId);
    if (notHost !== null) return notHost;
    if (room.state.phase !== 'lobby')
      return fail('WRONG_PHASE', 'Rename is only possible in the lobby');
    const clean = cleanText(companyName, config.companyName.min, config.companyName.max);
    if (clean === null) {
      return fail('INVALID_COMPANY_NAME', 'Company names must be 1 to 40 characters');
    }
    room.state = { ...room.state, companyName: clean };
    return done(room);
  }

  function playAgain(rawCode: string, playerId: string): Acted {
    const seat = seated(rawCode, playerId);
    if (!('room' in seat)) return seat;
    const { room } = seat;
    const notHost = hostOnly(room, playerId);
    if (notHost !== null) return notHost;
    if (room.state.phase !== 'ended')
      return fail('WRONG_PHASE', 'Play again is only possible after a quarter');
    // Back to the lobby with the same players. The next start draws a new set of PRs.
    room.state = { ...room.state, phase: 'lobby', quarter: null };
    return done(room);
  }

  /** Advances the clock to now and returns what that produced. Every intent runs this first. */
  function advance(room: Room): { events: GameEvent[]; changed: boolean } {
    const before = room.state;
    const result = engineTick(room.state, clock.now(), room.rng);
    room.state = result.state;
    const spawnedBefore = before.quarter?.prs.size ?? 0;
    const spawnedAfter = room.state.quarter?.prs.size ?? 0;
    const changed =
      result.events.length > 0 ||
      spawnedAfter !== spawnedBefore ||
      before.phase !== room.state.phase;
    return { events: result.events, changed };
  }

  function intent(rawCode: string, playerId: string, action: Intent): Acted {
    const room = findRoom(rawCode);
    if (room === null) return fail('ROOM_NOT_FOUND', 'No room has that code');
    const { events } = advance(room);
    const result = applyIntent(room.state, playerId, action, clock.now(), room.rng);
    if (!result.ok) return fail(result.code, result.message, events);
    room.state = result.state;
    return done(room, [...events, ...result.events]);
  }

  function tick(rawCode: string): TickResult | Failed {
    const room = findRoom(rawCode);
    if (room === null) return fail('ROOM_NOT_FOUND', 'No room has that code');
    const { events, changed } = advance(room);
    const replanned = replanForPlayers(room);
    return { ...done(room, events), changed: changed || replanned };
  }

  function view(rawCode: string): PublicRoomState | null {
    const room = findRoom(rawCode);
    return room === null ? null : toPublicState(room.state);
  }

  function postmortem(rawCode: string): Postmortem | null {
    const room = findRoom(rawCode);
    if (room === null || room.state.phase !== 'ended' || room.state.quarter === null) return null;
    return buildPostmortem(room.state);
  }

  return { create, join, disconnect, start, rename, playAgain, intent, tick, view, postmortem };
}
