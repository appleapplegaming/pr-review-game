// The end-of-quarter report. postmortem(state) is pure: it reads the finished quarter and builds
// the six sections in the order SPEC.md → Postmortem gives. It reads the answer key (`bug`), so
// its output may only be sent once the quarter has ended.
//
// Sorting "What slipped through" (plan.md → Resolved Decisions, item 5): damage is the value lost
// to the incident, with outage downtime at the hourly rate. Ties go to the higher severity. Any
// tie left after that keeps spawn order, because the sort is stable and quarter.prs is in spawn
// order.

import type {
  Badge,
  Bug,
  DecisionEntry,
  PlayerStats,
  Postmortem,
  PublicMetrics,
  Resolution,
  Severity,
  SlippedEntry,
} from '../../shared/types';
import { config } from '../../shared/config';
import { computeUptime } from '../../shared/money';
import { incidentEffect } from './incidents';
import type { GameState, ServerPlayer, ServerPr } from './state';

const SEVERITY_RANK: Record<Severity, number> = { minor: 0, major: 1, critical: 2 };

/** The badge for an uptime fraction (0..1) and a breach count. Thresholds live in shared/config. */
export function badgeFor(uptime: number, breaches: number): Badge {
  const { fiveNines, threeNines, businessAsUsual } = config.badges;
  if (uptime >= fiveNines.uptime && breaches <= fiveNines.maxBreaches) return 'five-nines';
  if (uptime >= threeNines.uptime && breaches <= threeNines.maxBreaches) return 'three-nines';
  if (uptime >= businessAsUsual.uptime) return 'business-as-usual';
  return 'this-is-fine';
}

/** Value lost to a bug's incident: the money or fine, or outage downtime at the hourly rate. */
export function damageOf(bug: Bug): number {
  return incidentEffect(bug).valueLoss;
}

/** Most damage first. Equal damage goes to the higher severity. */
export function compareSlipped(a: SlippedEntry, b: SlippedEntry): number {
  return b.damage - a.damage || SEVERITY_RANK[b.bug.severity] - SEVERITY_RANK[a.bug.severity];
}

function slippedEntries(prs: ServerPr[]): SlippedEntry[] {
  const entries: SlippedEntry[] = [];
  for (const entry of prs) {
    const resolution = entry.resolution;
    const bug = entry.pr.bug;
    if (entry.status !== 'merged' || resolution?.kind !== 'merged' || bug === null) continue;
    entries.push({
      pr: entry.pr,
      bug,
      mergedBy: resolution.by,
      mergedByName: resolution.byName,
      autoMerged: resolution.by === null,
      resolvedAt: resolution.at,
      damage: damageOf(bug),
      downtimeMinutes: incidentEffect(bug).downtimeMinutes,
      comments: [...entry.comments],
      pings: [...entry.pings],
    });
  }
  return entries.sort(compareSlipped);
}

function decisionEntry(
  entry: ServerPr,
  by: string,
  byName: string,
  bugType: DecisionEntry['bugType'],
  resolvedAt: number,
): DecisionEntry {
  return {
    pr: entry.pr,
    by,
    byName,
    bugType,
    resolvedAt,
    comments: [...entry.comments],
    pings: [...entry.pings],
  };
}

/** Sorts each declined PR into catches, wrong-reason declines or lost revenue. */
function declinedEntries(prs: ServerPr[]): {
  catches: DecisionEntry[];
  wrongReason: DecisionEntry[];
  lostRevenue: DecisionEntry[];
} {
  const catches: DecisionEntry[] = [];
  const wrongReason: DecisionEntry[] = [];
  const lostRevenue: DecisionEntry[] = [];
  for (const entry of prs) {
    const resolution = entry.resolution;
    if (entry.status !== 'declined' || resolution?.kind !== 'declined') continue;
    const bug = entry.pr.bug;
    if (bug === null) {
      lostRevenue.push(decisionEntry(entry, resolution.by, resolution.byName, null, resolution.at));
    } else if (resolution.bugType === bug.type) {
      catches.push(
        decisionEntry(entry, resolution.by, resolution.byName, resolution.bugType, resolution.at),
      );
    } else {
      wrongReason.push(
        decisionEntry(entry, resolution.by, resolution.byName, resolution.bugType, resolution.at),
      );
    }
  }
  return { catches, wrongReason, lostRevenue };
}

function statsFor(
  player: ServerPlayer,
  prs: ServerPr[],
  slipped: SlippedEntry[],
  catches: DecisionEntry[],
): PlayerStats {
  let merged = 0;
  let declined = 0;
  let comments = 0;
  for (const entry of prs) {
    const resolution: Resolution | null = entry.resolution;
    if (resolution?.kind === 'merged' && resolution.by === player.id) merged += 1;
    if (resolution?.kind === 'declined' && resolution.by === player.id) declined += 1;
    comments += entry.comments.filter((c) => c.playerId === player.id).length;
  }
  return {
    playerId: player.id,
    name: player.name,
    merged,
    declined,
    comments,
    catches: catches.filter((d) => d.by === player.id).length,
    // A miss is a slipped-through bug that this player merged by hand. Auto-merges have no player.
    misses: slipped.filter((s) => s.mergedBy === player.id).length,
  };
}

/** The end-of-quarter report. Throws when the room never had a quarter. */
export function postmortem(state: GameState): Postmortem {
  const quarter = state.quarter;
  if (quarter === null) throw new Error('postmortem needs a quarter');

  const prs = [...quarter.prs.values()];
  const { metrics } = quarter;
  const uptime = computeUptime(metrics.downtimeMinutes);
  const finalMetrics: PublicMetrics = {
    value: metrics.value,
    downtimeMinutes: metrics.downtimeMinutes,
    uptime,
    breaches: metrics.breaches,
  };

  const slipped = slippedEntries(prs);
  const { catches, wrongReason, lostRevenue } = declinedEntries(prs);

  return {
    companyName: state.companyName,
    finalMetrics,
    badge: badgeFor(uptime, metrics.breaches),
    bankrupt: quarter.bankrupt,
    slipped,
    catches,
    wrongReason,
    lostRevenue,
    lostRevenueTotal: lostRevenue.reduce((total, d) => total + d.pr.featureValue, 0),
    teamStats: state.players.map((p) => statsFor(p, prs, slipped, catches)),
  };
}
