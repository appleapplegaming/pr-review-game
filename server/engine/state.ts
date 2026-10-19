// Server-side game state. This is the answer-key side: `ServerPr` holds the full PullRequest,
// `bug` included. Only toPublicState() (Task 8) may turn it into something a client sees.
//
// Shape rules (kept so Tasks 5-9 can build on it without restructuring):
// - Room-level data (players, host, phase) lives on GameState. Quarter-level data lives on
//   Quarter, so "play again" keeps the room and replaces only the quarter.
// - Derived values are not stored: uptime, `highlighted` (a PR with pings that is still open),
//   `totalPrs` and `isHost` are computed where they are needed.
// - Money is whole dollars, times are epoch ms, durations are ms.
// - Unspawned PRs sit in `upcoming` (sorted by spawnAt). Spawned PRs move into `prs`, keyed by id,
//   in spawn order. A PR is therefore never in both.
// - The engine takes an Rng as an argument. It is not stored here, so the room adapter keeps one
//   Rng per room and advances it between intents.

import type { Comment, Phase, Ping, PrStatus, PullRequest, Resolution } from '../../shared/types';
import { config } from '../../shared/config';

/** Quarter durations in ms. Copied into the quarter at creation, so a time-scaled test run
 * (SHIP_IT_TIME_SCALE) stays consistent for the whole game. */
export interface Timing {
  quarterMs: number;
  spawnWindowMs: number;
  prTimerMs: number;
  incidentDelayMs: { min: number; max: number };
  pingCooldownMs: number;
}

export function defaultTiming(): Timing {
  return {
    quarterMs: config.quarterMs,
    spawnWindowMs: config.spawnWindowMs,
    prTimerMs: config.prTimerMs,
    incidentDelayMs: { ...config.incidentDelayMs },
    pingCooldownMs: config.pingCooldownMs,
  };
}

export interface ServerPlayer {
  id: string;
  name: string;
  joinedAt: number;
  connected: boolean;
}

/** A PR drawn for this quarter that has not spawned yet. */
export interface ScheduledPr {
  pr: PullRequest;
  spawnAt: number;
}

/** A spawned PR, with its answer key. */
export interface ServerPr {
  pr: PullRequest;
  spawnAt: number;
  /** Auto-merge time: spawnAt + prTimerMs. */
  expiresAt: number;
  status: PrStatus;
  resolution: Resolution | null;
  /** playerIds currently viewing the PR ("👀 Sara"). Presence only, it never locks the PR. */
  viewers: string[];
  comments: Comment[];
  pings: Ping[];
}

/** A buggy PR that merged. Its incident fires at `fireAt`, or at once when the quarter ends. */
export interface PendingIncident {
  prId: string;
  fireAt: number;
}

export interface Metrics {
  value: number;
  /** Total downtime in game minutes. Uptime is derived from it. */
  downtimeMinutes: number;
  breaches: number;
}

export interface Quarter {
  timing: Timing;
  startedAt: number;
  endsAt: number;
  upcoming: ScheduledPr[];
  prs: Map<string, ServerPr>;
  incidents: PendingIncident[];
  metrics: Metrics;
  bankrupt: boolean;
  /** Next number for comment and ping ids. Ids are "<prefix>-<n>", so they stay unique and replayable. */
  nextId: number;
}

export interface GameState {
  code: string;
  companyName: string;
  hostId: string | null;
  players: ServerPlayer[];
  phase: Phase;
  /** null in the lobby. Set when the quarter starts and kept after it ends, for the postmortem. */
  quarter: Quarter | null;
}
