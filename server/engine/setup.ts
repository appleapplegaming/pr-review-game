// Quarter setup: how many PRs to draw, which ones, and when each spawns. Pure: time and
// randomness are passed in, and the RNG is the only source of chance.

import { BUG_TYPES, type PullRequest } from '../../shared/types';
import { config } from '../../shared/config';
import { shuffle, type Rng } from './rng';
import {
  defaultTiming,
  timingForMinutes,
  type GameState,
  type Quarter,
  type Timing,
} from './state';

/**
 * clamp(base + perPlayer × players, min, max), scaled by game length (minutes over the default) and
 * kept within [prCountFloor, max], so a short game is not flooded and a long one has more to do.
 */
export function prCountFor(
  playerCount: number,
  minutes: number = config.durationMinutes.default,
): number {
  const { base, perPlayer, min, max } = config.prCount;
  const standard = Math.min(max, Math.max(min, base + perPlayer * playerCount));
  const scaled = Math.round((standard * minutes) / config.durationMinutes.default);
  return Math.min(max, Math.max(config.prCountFloor, scaled));
}

/**
 * Draws `count` PRs from the pool. The clean share is about a third, capped by how many clean
 * PRs the pool has. Every bug type appears at least once. Throws if the pool cannot supply that,
 * because a short pool is a content error, not a runtime condition.
 */
function drawPrs(pool: readonly PullRequest[], count: number, rng: Rng): PullRequest[] {
  const clean = pool.filter((p) => p.bug === null);
  const buggy = pool.filter((p) => p.bug !== null);

  const cleanCount = Math.min(Math.round(count * config.cleanShare), clean.length);
  const buggyCount = count - cleanCount;
  if (buggy.length < buggyCount) {
    throw new Error(`pool has ${buggy.length} buggy PRs, a ${count}-PR draw needs ${buggyCount}`);
  }

  // One of each bug type first, so the guarantee holds whatever the seed.
  const forced = BUG_TYPES.map((type) => {
    const candidates = buggy.filter((p) => p.bug?.type === type);
    const [pick] = shuffle(rng, candidates);
    if (pick === undefined) throw new Error(`pool has no ${type} PR, a draw needs at least one`);
    return pick;
  });

  const forcedIds = new Set(forced.map((p) => p.id));
  const restBuggy = shuffle(
    rng,
    buggy.filter((p) => !forcedIds.has(p.id)),
  ).slice(0, buggyCount - BUG_TYPES.length);
  const restClean = shuffle(rng, clean).slice(0, cleanCount);

  // Shuffle the whole draw so the forced PRs don't always spawn first.
  return shuffle(rng, [...forced, ...restBuggy, ...restClean]);
}

/**
 * Spawn offset (ms from quarter start) for slot `index` of `count`. Each PR gets an equal slot
 * of the spawn window, and the spawn lands within ±spawnJitter of that slot's centre. Slots don't
 * overlap, so the spawns come out in order and stay inside the window.
 */
function spawnOffset(index: number, count: number, windowMs: number, rng: Rng): number {
  const slot = windowMs / count;
  const centre = (index + 0.5) * slot;
  const jitter = (rng.next() * 2 - 1) * config.spawnJitter * slot;
  return Math.round(centre + jitter);
}

export function createQuarter(
  pool: readonly PullRequest[],
  playerCount: number,
  rng: Rng,
  now: number,
  baseTiming: Timing = defaultTiming(),
  minutes: number = config.durationMinutes.default,
): Quarter {
  const timing = timingForMinutes(baseTiming, minutes);
  const count = prCountFor(playerCount, minutes);
  const drawn = drawPrs(pool, count, rng);
  const upcoming = drawn.map((pr, i) => ({
    pr,
    spawnAt: now + spawnOffset(i, count, timing.spawnWindowMs, rng),
  }));

  return {
    timing,
    startedAt: now,
    endsAt: now + timing.quarterMs,
    upcoming,
    prs: new Map(),
    incidents: [],
    metrics: { value: config.startingValue, downtimeMinutes: 0, breaches: 0 },
    bankrupt: false,
    nextId: 1,
  };
}

/** Lobby → playing: draws the quarter for the players in the room. */
export function startQuarter(
  state: GameState,
  pool: readonly PullRequest[],
  rng: Rng,
  now: number,
  timing?: Timing,
  minutes?: number,
): GameState {
  return {
    ...state,
    phase: 'playing',
    quarter: createQuarter(pool, state.players.length, rng, now, timing, minutes),
  };
}
