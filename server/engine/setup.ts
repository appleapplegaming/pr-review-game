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

/** Spaces `prs` evenly over [from, from + windowMs], in the order given. */
function schedule(prs: readonly PullRequest[], from: number, windowMs: number, rng: Rng) {
  return prs.map((pr, i) => ({ pr, spawnAt: from + spawnOffset(i, prs.length, windowMs, rng) }));
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
  const upcoming = schedule(drawn, now, timing.spawnWindowMs, rng);

  return {
    timing,
    minutes,
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

/**
 * Re-plans the PRs still to spawn for a new player count, so PRs come faster when players join
 * and slower when they leave. The quarter total becomes prCountFor(playerCount), never fewer than
 * the PRs already spawned. Extra PRs come from pool PRs not used this quarter, keeping about a
 * third clean; when the pool runs short it adds what it has. Dropped PRs are never the last of
 * their bug type. The remaining PRs are then spaced evenly over what is left of the spawn window.
 * Spawned PRs are not touched. Returns the quarter unchanged once the window has closed or when
 * the number left to spawn would stay the same.
 */
export function replanUpcoming(
  quarter: Quarter,
  pool: readonly PullRequest[],
  playerCount: number,
  rng: Rng,
  now: number,
): Quarter {
  const windowEnd = quarter.startedAt + quarter.timing.spawnWindowMs;
  if (now >= windowEnd) return quarter;

  const spawned = [...quarter.prs.values()].map((p) => p.pr);
  const target = Math.max(spawned.length, prCountFor(playerCount, quarter.minutes));
  const wanted = target - spawned.length;
  const current = quarter.upcoming.map((u) => u.pr);
  if (wanted === current.length) return quarter;

  const all = [...spawned, ...current];
  const cleanTarget = Math.round(target * config.cleanShare);
  const remaining =
    wanted > current.length
      ? [...current, ...drawMore(pool, all, wanted - current.length, cleanTarget, rng)]
      : dropSome(all, current, current.length - wanted, cleanTarget, rng);

  return {
    ...quarter,
    upcoming: schedule(shuffle(rng, remaining), now, windowEnd - now, rng),
  };
}

/** Up to `count` pool PRs not in `used`, topping the clean ones up to `cleanTarget` first. */
function drawMore(
  pool: readonly PullRequest[],
  used: readonly PullRequest[],
  count: number,
  cleanTarget: number,
  rng: Rng,
): PullRequest[] {
  const usedIds = new Set(used.map((p) => p.id));
  const fresh = shuffle(
    rng,
    pool.filter((p) => !usedIds.has(p.id)),
  );
  const clean = fresh.filter((p) => p.bug === null);
  const buggy = fresh.filter((p) => p.bug !== null);
  const cleanHave = used.filter((p) => p.bug === null).length;

  const cleanCount = Math.min(clean.length, count, Math.max(0, cleanTarget - cleanHave));
  const picked = [...clean.slice(0, cleanCount), ...buggy.slice(0, count - cleanCount)];
  // If the pool ran short of buggy PRs, fill the rest with clean ones.
  return [...picked, ...clean.slice(cleanCount, cleanCount + count - picked.length)];
}

/**
 * `current` without `count` of its PRs, in random order but surplus clean PRs (above `cleanTarget`
 * across `all`) first. Never drops the last PR of a bug type across `all`.
 */
function dropSome(
  all: readonly PullRequest[],
  current: readonly PullRequest[],
  count: number,
  cleanTarget: number,
  rng: Rng,
): PullRequest[] {
  const perType = new Map<string, number>();
  for (const p of all) {
    if (p.bug !== null) perType.set(p.bug.type, (perType.get(p.bug.type) ?? 0) + 1);
  }
  const surplusClean = Math.max(0, all.filter((p) => p.bug === null).length - cleanTarget);
  const order = shuffle(rng, current);
  const clean = order.filter((p) => p.bug === null);
  const first = new Set(clean.slice(0, surplusClean));
  const candidates = [...first, ...order.filter((p) => !first.has(p))];

  const dropped = new Set<string>();
  for (const pr of candidates) {
    if (dropped.size === count) break;
    if (pr.bug !== null) {
      const n = perType.get(pr.bug.type) ?? 0;
      if (n <= 1) continue;
      perType.set(pr.bug.type, n - 1);
    }
    dropped.add(pr.id);
  }
  return current.filter((p) => !dropped.has(p.id));
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
