// The clock. tick(state, now, rng) advances a running quarter to `now`: it spawns the PRs that
// are due, auto-merges the PRs whose 90 s timer has run out, fires the incidents that are due,
// and ends the quarter. Pure: the caller passes the clock and the RNG.
//
// Events are handled one at a time in time order, so a PR that expires after the company went
// bankrupt does not merge, and an incident scheduled by an auto-merge can fire in the same tick.
// The RNG is needed only because an auto-merged buggy PR schedules its incident.
//
// Ending the quarter (SPEC.md → Quarter): at time-up, when every PR is resolved, or on bankruptcy.
// Each end auto-merges open PRs (except on bankruptcy, where no more value can be added) and then
// fires every incident still pending, in fireAt order, at the end time.

import type { GameEvent } from '../../shared/types';
import { applyIncident } from './incidents';
import { mergePr } from './apply-intent';
import type { Rng } from './rng';
import type { GameState, PendingIncident, Quarter, ScheduledPr, ServerPr } from './state';

export interface Ticked {
  state: GameState;
  events: GameEvent[];
}

type Due =
  | { kind: 'spawn'; at: number; item: ScheduledPr }
  | { kind: 'expire'; at: number; pr: ServerPr }
  | { kind: 'incident'; at: number; incident: PendingIncident };

/** At the same time: spawns, then auto-merges, then incidents. */
const RANK: Record<Due['kind'], number> = { spawn: 0, expire: 1, incident: 2 };

function before(a: Due, b: Due): boolean {
  return a.at !== b.at ? a.at < b.at : RANK[a.kind] < RANK[b.kind];
}

/** The earliest event due at or before `limit`, or null. Ties keep queue order. */
function nextDue(quarter: Quarter, limit: number): Due | null {
  const candidates: Due[] = [
    ...quarter.upcoming.map((item): Due => ({ kind: 'spawn', at: item.spawnAt, item })),
    ...[...quarter.prs.values()]
      .filter((pr) => pr.status === 'open')
      .map((pr): Due => ({ kind: 'expire', at: pr.expiresAt, pr })),
    ...quarter.incidents.map((incident): Due => ({
      kind: 'incident',
      at: incident.fireAt,
      incident,
    })),
  ].filter((due) => due.at <= limit);

  return candidates.reduce<Due | null>(
    (best, due) => (best === null || before(due, best) ? due : best),
    null,
  );
}

/** Every PR is resolved and none is left to spawn. */
function allResolved(quarter: Quarter): boolean {
  return (
    quarter.upcoming.length === 0 && [...quarter.prs.values()].every((p) => p.status !== 'open')
  );
}

interface Step {
  quarter: Quarter;
  event?: GameEvent;
}

function spawn(quarter: Quarter, item: ScheduledPr): Step {
  const pr: ServerPr = {
    pr: item.pr,
    spawnAt: item.spawnAt,
    expiresAt: item.spawnAt + quarter.timing.prTimerMs,
    status: 'open',
    resolution: null,
    viewers: [],
    comments: [],
    pings: [],
  };
  const prs = new Map(quarter.prs);
  prs.set(pr.pr.id, pr);
  return { quarter: { ...quarter, prs, upcoming: quarter.upcoming.filter((s) => s !== item) } };
}

/**
 * An auto-merge: nobody reviewed it, so `by` is null. `at` is the PR's expiry time, or the quarter
 * end when the quarter ends with the PR still open.
 */
function autoMerge(quarter: Quarter, pr: ServerPr, at: number, rng: Rng): Step {
  const next = mergePr(quarter, pr, null, null, at, rng);
  return {
    quarter: next,
    event: { kind: 'merge', prId: pr.pr.id, prTitle: pr.pr.title, by: null, byName: null, at },
  };
}

/** Fires one incident at `at`. The value floors at $0, and reaching it sets the bankruptcy flag. */
function fire(quarter: Quarter, incident: PendingIncident, at: number): Step {
  const incidents = quarter.incidents.filter((i) => i !== incident);
  const bug = quarter.prs.get(incident.prId)?.pr.bug ?? null;
  if (bug === null) return { quarter: { ...quarter, incidents } };

  const { metrics, bankrupt } = applyIncident(quarter.metrics, bug);
  return {
    quarter: { ...quarter, incidents, metrics, bankrupt: quarter.bankrupt || bankrupt },
    event: { kind: 'incident', bugType: bug.type, text: bug.incident, at },
  };
}

function runDue(quarter: Quarter, due: Due, rng: Rng): Step {
  switch (due.kind) {
    case 'spawn':
      return spawn(quarter, due.item);
    case 'expire':
      return autoMerge(quarter, due.pr, due.pr.expiresAt, rng);
    case 'incident':
      return fire(quarter, due.incident, due.at);
  }
}

/** Ends the quarter at `at`: auto-merge what is still open (not after bankruptcy), then fire every
 * pending incident in fireAt order. Incidents from those merges fire too. */
function endQuarter(
  state: GameState,
  quarter: Quarter,
  at: number,
  rng: Rng,
  events: GameEvent[],
): Ticked {
  let current = quarter;

  if (!current.bankrupt) {
    for (const id of [...current.prs.keys()]) {
      const pr = current.prs.get(id);
      if (pr?.status !== 'open') continue;
      const step = autoMerge(current, pr, at, rng);
      current = step.quarter;
      if (step.event) events.push(step.event);
    }
  }

  const pending = [...current.incidents].sort((a, b) => a.fireAt - b.fireAt);
  for (const incident of pending) {
    const step = fire(current, incident, at);
    current = step.quarter;
    if (step.event) events.push(step.event);
  }

  return { state: { ...state, phase: 'ended', quarter: current }, events };
}

export function tick(state: GameState, now: number, rng: Rng): Ticked {
  const quarter = state.quarter;
  if (state.phase !== 'playing' || quarter === null) return { state, events: [] };

  const limit = Math.min(now, quarter.endsAt);
  const events: GameEvent[] = [];

  // Manual decisions can resolve the last PR between ticks, so check before the timeline.
  if (allResolved(quarter)) return endQuarter(state, quarter, limit, rng, events);

  let current = quarter;
  for (let due = nextDue(current, limit); due !== null; due = nextDue(current, limit)) {
    const step = runDue(current, due, rng);
    current = step.quarter;
    if (step.event) events.push(step.event);
    if (current.bankrupt || allResolved(current)) {
      return endQuarter(state, current, due.at, rng, events);
    }
  }

  if (now >= quarter.endsAt) return endQuarter(state, current, quarter.endsAt, rng, events);

  return { state: { ...state, quarter: current }, events };
}
