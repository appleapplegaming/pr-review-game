// Shared domain types. Imported by server, client and content.
// Money is whole dollars (integer). Times are epoch milliseconds. Durations are milliseconds.

export const BUG_TYPES = ['money', 'security', 'outage'] as const;
export type BugType = (typeof BUG_TYPES)[number];

export const SEVERITIES = ['minor', 'major', 'critical'] as const;
export type Severity = (typeof SEVERITIES)[number];

export const AREAS = ['payments', 'auth', 'infra', 'ui', 'data', 'api'] as const;
export type Area = (typeof AREAS)[number];

export const LANGUAGES = ['ts', 'java', 'python'] as const;
export type Language = (typeof LANGUAGES)[number];

/** Display names, e.g. for the PR header. */
export const LANGUAGE_LABEL: Record<Language, string> = {
  ts: 'TypeScript',
  java: 'Java',
  python: 'Python',
};

// The answer key. Server and postmortem only. Never referenced by public types.
export interface Bug {
  type: BugType;
  severity: Severity;
  /** 1-based index into the rendered diff lines (excluding @@ headers). */
  lines: number[];
  explanation: string;
  incident: string;
}

// Content type for a PR in content/prs. Contains the answer key.
export interface PullRequest {
  id: string;
  title: string;
  author: string;
  area: Area;
  description: string;
  language: Language;
  diff: string;
  featureValue: number;
  bug: Bug | null;
}

export interface Comment {
  id: string;
  prId: string;
  playerId: string;
  playerName: string;
  /** Diff line index, or null for a comment on the whole PR. */
  line: number | null;
  text: string;
  at: number;
}

export interface Ping {
  prId: string;
  playerId: string;
  playerName: string;
  at: number;
}

export type PrStatus = 'open' | 'merged' | 'declined';

export type Resolution =
  | { kind: 'merged'; by: string | null; byName: string | null; at: number }
  | { kind: 'declined'; by: string; byName: string; at: number; bugType: BugType };

/** A PR as clients see it. Has no `bug` field, so the answer key can't leak. */
export interface PublicPr {
  id: string;
  title: string;
  author: string;
  area: Area;
  description: string;
  language: Language;
  diff: string;
  featureValue: number;
  spawnAt: number;
  expiresAt: number;
  status: PrStatus;
  resolution: Resolution | null;
  /** playerIds currently viewing the PR */
  viewers: string[];
  comments: Comment[];
  highlighted: boolean;
}

export interface PublicPlayer {
  id: string;
  name: string;
  isHost: boolean;
  connected: boolean;
  joinedAt: number;
}

export type Phase = 'lobby' | 'playing' | 'ended';

export interface PublicMetrics {
  value: number;
  downtimeMinutes: number;
  /** Fraction 0..1 */
  uptime: number;
  breaches: number;
}

export interface PublicRoomState {
  code: string;
  companyName: string;
  phase: Phase;
  hostId: string | null;
  players: PublicPlayer[];
  startedAt: number | null;
  endsAt: number | null;
  totalPrs: number;
  prs: PublicPr[];
  metrics: PublicMetrics;
  bankrupt: boolean;
}

export type DeclineVerdict = 'clean' | 'wrong-reason';

export type GameEvent =
  | { kind: 'incident'; bugType: BugType; text: string; at: number }
  | {
      kind: 'ping';
      prId: string;
      prTitle: string;
      playerId: string;
      playerName: string;
      at: number;
    }
  | {
      kind: 'merge';
      prId: string;
      prTitle: string;
      by: string | null;
      byName: string | null;
      at: number;
    }
  | {
      kind: 'decline';
      prId: string;
      prTitle: string;
      by: string;
      byName: string;
      bugType: BugType;
      /**
       * The only outcome shown before the postmortem. 'clean': the PR had no bug, its value is
       * lost. 'wrong-reason': the PR had a real bug, but the type was wrong (no bonus). The real
       * bug type is never sent.
       */
      verdict: DeclineVerdict;
      at: number;
    }
  | {
      kind: 'comment';
      prId: string;
      prTitle: string;
      by: string;
      byName: string;
      /** True for a diff-line comment, false for a whole-PR comment. The text is never included. */
      onLine: boolean;
      at: number;
    }
  | {
      kind: 'catch';
      prId: string;
      prTitle: string;
      by: string;
      byName: string;
      bugType: BugType;
      bonus: number;
      at: number;
    };

export type Badge = 'five-nines' | 'three-nines' | 'business-as-usual' | 'this-is-fine';

export interface SlippedEntry {
  pr: PullRequest;
  bug: Bug;
  mergedBy: string | null;
  mergedByName: string | null;
  autoMerged: boolean;
  /** When the PR was merged (epoch ms), so a ping can be compared with the decision. */
  resolvedAt: number;
  /** Value lost, including outage downtime at the hourly rate. */
  damage: number;
  downtimeMinutes: number;
  comments: Comment[];
  pings: Ping[];
}

export interface DecisionEntry {
  pr: PullRequest;
  by: string;
  byName: string;
  /** The type the player chose. */
  bugType: BugType | null;
  /** When the PR was declined (epoch ms). */
  resolvedAt: number;
  comments: Comment[];
  pings: Ping[];
}

export interface PlayerStats {
  playerId: string;
  name: string;
  merged: number;
  declined: number;
  comments: number;
  catches: number;
  misses: number;
}

export interface Postmortem {
  companyName: string;
  finalMetrics: PublicMetrics;
  badge: Badge;
  bankrupt: boolean;
  slipped: SlippedEntry[];
  catches: DecisionEntry[];
  wrongReason: DecisionEntry[];
  lostRevenue: DecisionEntry[];
  lostRevenueTotal: number;
  teamStats: PlayerStats[];
}

export type ErrorCode =
  | 'BAD_MESSAGE'
  | 'RATE_LIMITED'
  | 'ROOM_NOT_FOUND'
  | 'INVALID_NAME'
  | 'NOT_IN_ROOM'
  | 'NOT_HOST'
  | 'WRONG_PHASE'
  | 'PR_NOT_FOUND'
  | 'PR_NOT_OPEN'
  | 'INVALID_COMMENT'
  | 'PING_COOLDOWN'
  | 'INVALID_COMPANY_NAME'
  | 'INVALID_DURATION'
  | 'SERVER_ERROR';
