// Every tunable number lives here. Times are milliseconds unless the name says otherwise.
// Source of truth for the numbers: SPEC.md → Game Rules.

export const config = {
  // Quarter
  quarterMs: 600_000, // 10:00 real time
  spawnWindowMs: 510_000, // PRs spread over the first 8:30
  spawnJitter: 0.2, // ±20%
  prTimerMs: 90_000, // auto-merge timer per PR
  prCount: { base: 8, perPlayer: 4, min: 12, max: 30 }, // clamp(base + perPlayer × players, min, max)
  cleanShare: 1 / 3, // about a third of each draw is clean
  // Game length the host can pick at start. quarterMs is the `default` length; the others scale it.
  durationMinutes: { options: [5, 10, 15], default: 10 },
  prCountFloor: 6, // a shortened game never draws fewer PRs than this (3 bug types + a clean one)
  leaveGraceMs: 20_000, // a player gone this long mid-quarter stops counting, and PRs slow down

  // Starting state
  startingValue: 10_000_000,

  // Incidents
  incidentDelayMs: { min: 4_000, max: 12_000 },
  catchBonus: 150_000,
  outage: {
    minutes: { minor: 30, major: 240, critical: 1440 },
    valuePerHour: 40_000,
  },
  money: { minor: 500_000, major: 2_000_000, critical: 5_000_000 },
  security: { minor: 1_000_000, major: 3_000_000, critical: 8_000_000 },

  // Uptime and badges
  quarterMinutes: 129_600, // minutes in a 90-day quarter
  badges: {
    fiveNines: { uptime: 0.9999, maxBreaches: 0 },
    threeNines: { uptime: 0.999, maxBreaches: 1 },
    businessAsUsual: { uptime: 0.99 },
  },

  // Comments and pings
  pingCooldownMs: 20_000,
  comment: { min: 1, max: 280 },

  // Names and limits
  name: { min: 1, max: 20 },
  companyName: { min: 1, max: 40 },
  rateLimit: { messages: 10, windowMs: 1000 },

  // Server
  tickMs: 250,
  roomCleanupMs: 1_800_000, // 30 min after the last player leaves
  maxMessageBytes: 4_096, // largest client frame; a 280-char comment is at most about 1,120 bytes
  defaultPort: 3000, // used when PORT is unset
  wsMaxPayloadBytes: 65_536, // transport ceiling for ws; ws.ts still enforces maxMessageBytes first

  // Content validation
  featureValue: { min: 200_000, max: 2_000_000 },
  diffLines: { min: 10, max: 40 },
  contentLineMax: 70, // characters per diff line, including the +/-/space prefix

  // Client
  toastMs: 4000,
  toastIncidentMs: 8000, // incident toasts stay longer: they matter more and are the ones to read
  toastMax: 3, // toasts shown at once; the rest collapse into "+N more"
  roomCodeLength: 4,
  reconnectBaseMs: 500, // first retry ceiling after a drop; doubles per failed attempt
  reconnectMaxMs: 15_000, // cap on the retry ceiling
  reconnectFactor: 2, // ceiling growth per failed attempt
  reconnectJitter: 0.5, // delay is drawn from [ceiling × (1 − jitter), ceiling]
  eventQueueMax: 20, // oldest toasts drop off once the queue is longer than this
  feedMax: 50, // activity feed entries kept per quarter; the oldest drop off first
  countdownUrgentMs: 20_000, // the countdown ring turns red below this many ms left
} as const;
