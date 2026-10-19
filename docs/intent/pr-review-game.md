# Intent: PR Review Game

Confirmed statement of intent, produced by an `interview-me` session on 2026-10-19.
The build spec that implements this lives in [`SPEC.md`](../../SPEC.md).

- **Outcome:** A browser-based co-op game where a team runs one company together by
  reviewing a stream of PRs before a shared timer runs out. The goal is to grow the
  company while keeping uptime high and avoiding breaches.
- **Players:** Our engineering team, playing together on a call as a team-building
  activity, on desktop or phone. No public lobbies or matchmaking.
- **How it plays:**
  - Everyone works from one shared queue that fills up faster than any one person can review.
  - Each player grabs a PR and approves it, or rejects it with a bug type (money, security, outage).
  - Any PR whose timer runs out gets auto-merged.
- **Collaboration:**
  - Players can comment on a specific line or on the whole PR.
  - Commented PRs show a 💬 badge in the queue. A "🙋 Second opinion?" button pings the
    team and highlights the PR for everyone.
  - Anyone can merge or decline at any time; whoever clicks the button owns the decision.
  - Commenting doesn't pause a PR's timer.
- **Scoring:**
  - A clean PR that merges raises company value, by more for bigger features.
  - A clean PR that gets rejected earns nothing (lost revenue).
  - A buggy PR that merges still pays out the feature, then its incident hits: uptime
    drops, value drops, or a breach is logged.
  - Catching a bug and naming its type correctly avoids the incident and earns a small bonus.
  - Rejecting everything keeps the company safe but it stops growing; approving
    everything grows it fast until it gets breached.
- **Content:** About 25–30 short PRs (≈10–40 lines each), written by Claude, across
  payments, auth, infra and UI. Each hides a bug or is clean, and has a secret answer key
  saying what it's worth and what it breaks.
- **Session:** One "quarter" of about 10 minutes. Incidents fire live on the dashboard.
- **Postmortem:** For each missed bug: the line it was on, who merged it (or "nobody
  reviewed it"), and the comments and second-opinion pings on that PR.
- **Mobile:** Full game on phones: bottom tab bar (📥 Queue · 📄 PR · 📊 Dashboard),
  wrapped diff lines, tap a line to comment, big fixed Merge/Decline buttons, incident toasts.
- **Tech:** Node + WebSockets. Create a room, share a code or link, type a name to join.
  No accounts. One command to run; deployable to any cheap host.
- **Success:** The team runs a full session on a call, on any device, and everyone has a
  good time, especially at the postmortem.
- **Out of scope for v1:** Multiple quarters / progression, upgrades or hiring, player
  roles, required second approvals, persistent leaderboards, difficulty levels,
  AI-generated PRs, real PRs from our repos, native apps.
