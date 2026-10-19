// The answer-key boundary. toPublicState() turns the server's GameState into the PublicRoomState
// that every client receives. Nothing else may build a public state.
//
// It is an allowlist: each field is copied by name, so a field added to ServerPr or PullRequest
// later stays out of the output until someone adds it here on purpose. The `bug` field, and
// everything inside it, is never read.
//
// What the state shows (plan.md → Resolved Decisions, item 2): open PRs show no bug information.
// A resolved PR shows its outcome and who decided. The bug is never shown in the public state.
// Incident text and catch bonuses go out as events, not in the state.

import type {
  Comment,
  PublicMetrics,
  PublicPlayer,
  PublicPr,
  PublicRoomState,
  Resolution,
} from '../../shared/types';
import { config } from '../../shared/config';
import { computeUptime } from '../../shared/money';
import type { GameState, ServerPr } from './state';

function copyComment(comment: Comment): Comment {
  return {
    id: comment.id,
    prId: comment.prId,
    playerId: comment.playerId,
    playerName: comment.playerName,
    line: comment.line,
    text: comment.text,
    at: comment.at,
  };
}

function copyResolution(resolution: Resolution): Resolution {
  return resolution.kind === 'merged'
    ? { kind: 'merged', by: resolution.by, byName: resolution.byName, at: resolution.at }
    : {
        kind: 'declined',
        by: resolution.by,
        byName: resolution.byName,
        at: resolution.at,
        bugType: resolution.bugType,
      };
}

function toPublicPr(entry: ServerPr): PublicPr {
  const { pr } = entry;
  return {
    id: pr.id,
    title: pr.title,
    author: pr.author,
    area: pr.area,
    description: pr.description,
    diff: pr.diff,
    featureValue: pr.featureValue,
    spawnAt: entry.spawnAt,
    expiresAt: entry.expiresAt,
    status: entry.status,
    resolution: entry.resolution === null ? null : copyResolution(entry.resolution),
    viewers: [...entry.viewers],
    comments: entry.comments.map(copyComment),
    // A second-opinion ping highlights the PR until it resolves.
    highlighted: entry.status === 'open' && entry.pings.length > 0,
  };
}

/** Before the quarter starts, the company is at its starting value with no downtime. */
const LOBBY_METRICS: PublicMetrics = {
  value: config.startingValue,
  downtimeMinutes: 0,
  uptime: computeUptime(0),
  breaches: 0,
};

/**
 * The public view of the room. PRs are the spawned ones only, in spawn order. PRs still waiting to
 * spawn are counted in totalPrs and nowhere else. Time is sent as server timestamps (startedAt,
 * endsAt, expiresAt), so the client works out time remaining from its clock offset.
 */
export function toPublicState(state: GameState): PublicRoomState {
  const quarter = state.quarter;
  const players: PublicPlayer[] = state.players.map((p) => ({
    id: p.id,
    name: p.name,
    isHost: p.id === state.hostId,
    connected: p.connected,
    joinedAt: p.joinedAt,
  }));

  if (quarter === null) {
    return {
      code: state.code,
      companyName: state.companyName,
      phase: state.phase,
      hostId: state.hostId,
      players,
      startedAt: null,
      endsAt: null,
      totalPrs: 0,
      prs: [],
      metrics: LOBBY_METRICS,
      bankrupt: false,
    };
  }

  const { metrics } = quarter;
  return {
    code: state.code,
    companyName: state.companyName,
    phase: state.phase,
    hostId: state.hostId,
    players,
    startedAt: quarter.startedAt,
    endsAt: quarter.endsAt,
    totalPrs: quarter.prs.size + quarter.upcoming.length,
    prs: [...quarter.prs.values()].map(toPublicPr),
    metrics: {
      value: metrics.value,
      downtimeMinutes: metrics.downtimeMinutes,
      uptime: computeUptime(metrics.downtimeMinutes),
      breaches: metrics.breaches,
    },
    bankrupt: quarter.bankrupt,
  };
}
