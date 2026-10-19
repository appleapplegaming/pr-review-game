# Spec: PR Review Game ("Ship It")

Status: **Draft, awaiting approval**. Source of intent: [`docs/intent/pr-review-game.md`](docs/intent/pr-review-game.md).

## Assumptions

Correct any of these before planning starts.

1. **Team size is 2–8 players** (confirmed). It also works solo, but solo isn't tuned.
2. **Room state lives in server memory only.** There's no database, and a server restart ends any running games.
3. **All PR diffs are TypeScript** (confirmed). Infra PRs are TypeScript too, e.g. config objects, middleware and job runners.
4. **Incidents fire a few seconds after a buggy merge, not instantly.** "What did we just ship?" adds tension and is how production bugs really surface.
5. **The company is fictional.** The room creator can rename it; the default is a random funny name.
6. **Targets are evergreen browsers**: Chrome, Safari, Firefox and Edge, including iOS Safari and Android Chrome.

---

## Objective

A browser-based co-op game for our engineering team to play together on a call. The team runs one company during one "quarter" (about 10 minutes) by reviewing a shared queue of short PRs. Each PR either hides a bug or is clean. Merging clean PRs grows company value. Merging buggy PRs causes incidents that hurt uptime and company value, or log data breaches. A postmortem at the end shows what slipped through, who merged it, and what the team said about it at the time.

### User stories

- **Create:** As a host, I create a room and get a 4-letter code and a share link.
- **Join:** As a player, I open the link (or type the code), enter a name, and I'm in the lobby. This works on my phone.
- **Start:** As the host, I start the quarter once everyone is in.
- **Review:** As a player, I see the live queue, open any PR, and read its title, description and diff.
- **Merge:** As a player, I can **Merge** a PR.
- **Decline:** As a player, I can **Decline** a PR by picking a bug type: 💸 Money, 🔓 Security or 🔥 Outage.
- **Comment:** As a player, I can comment on a diff line or on the whole PR. Everyone sees it live.
- **Second opinion:** As a player, I can press **🙋 Second opinion?** to ping the team and highlight a PR in everyone's queue.
- **Dashboard:** As any player, I see a shared dashboard with company value, uptime %, breaches, the time left in the quarter, and live incident toasts.
- **Postmortem:** As any player, at the end I see:
  - every missed bug, with the buggy line highlighted, an explanation, who merged it (or "nobody reviewed it") and the comments and pings on it
  - the great catches
  - the lost revenue from clean PRs we declined
- **Play again:** As the host, I can start another round with the same room.

---

## Game Rules

### Quarter

| Parameter | Value |
|---|---|
| Quarter length | 10:00 real time |
| PRs per quarter | `clamp(8 + 4 × players, 12, 30)`, drawn at random from the pool |
| Spawn schedule | Evenly spaced over the first 8:30 of the quarter, with ±20% jitter |
| Per-PR timer | 90 s from spawn, then the PR **auto-merges** |
| Mix in each draw | About ⅓ clean and ⅔ buggy, with at least one of each bug type |

- **Joining:** Players who join mid-quarter are dropped straight into the game.
- **Ending:** The quarter ends at 10:00, or early once every PR is resolved and no more PRs are left to spawn. Any open PRs auto-merge when the quarter ends.

### Starting state

| Metric | Start |
|---|---|
| Company value | $10.0M |
| Uptime | 100.000% |
| Breaches | 0 |

### Decisions

**Who decides a PR:**
- Any player can resolve any open PR.
- The first decision the server receives wins. Any later decision on the same PR is rejected and the client shows "Already merged by Sara".
- "Opening" a PR only shows an avatar ("👀 Sara") in the queue. It doesn't lock the PR.

**What each outcome does:**

| PR | Action | Effect |
|---|---|---|
| Clean | Merge (manual or auto) | `+featureValue` to company value |
| Clean | Decline | No change. Logged as lost revenue `featureValue`. |
| Buggy | Merge (manual or auto) | `+featureValue` now. The incident fires after a 4–12 s delay. |
| Buggy | Decline with **correct** type | No incident. **+$150k** "good catch" bonus. |
| Buggy | Decline with **wrong** type | No incident, no bonus. The postmortem shows "right call, wrong reason". |

### Incidents

Every bug has a `type` and a `severity` (`minor` | `major` | `critical`).

| Type | Effect | minor | major | critical |
|---|---|---|---|---|
| 🔥 Outage | Downtime is added, and value is lost at $40k per hour of downtime | 30 min | 4 h | 24 h |
| 💸 Money | Direct value loss | −$0.5M | −$2M | −$5M |
| 🔓 Security | Breaches +1, plus a value loss (fines and churn) | −$1M | −$3M | −$8M |

- **Uptime formula:** `uptime = 1 − downtimeMinutes / 129_600`, where 129,600 is the number of minutes in a 90-day quarter. Uptime is shown to 3 decimals, e.g. 99.815%.
- **Floor:** Company value can't go below $0. If it reaches $0 the company is **bankrupt** and the quarter ends immediately with a special postmortem banner.

### End-of-quarter grade

The headline result is **final company value**. A badge is added from uptime and breaches:

| Badge | Condition |
|---|---|
| 🏆 Five nines-ish | Uptime ≥ 99.99% and 0 breaches |
| 🥇 Three nines | Uptime ≥ 99.9% and ≤ 1 breach |
| 🥈 Business as usual | Uptime ≥ 99% |
| 🔥 This is fine | Everything else |

All of the numbers above live in one tunable config (`shared/config.ts`) so they can be balanced after playtesting.

### Comments and second opinion

**Comments:**
- Each comment is either attached to a diff line (by line index) or to the whole PR.
- Comments are plain text of 1–280 characters, rendered as text and never as HTML.
- They're visible to everyone live.
- A PR with comments shows a 💬 count badge in the queue.
- Comments can still be read after the PR resolves.

**🙋 Second opinion:**
- Pressing it shows a toast to everyone ("Sara wants a second opinion on *Add refund endpoint*").
- It highlights that PR in the queue until it resolves.
- Each player can ping a given PR at most once every 20 s.
- Comments and pings never pause the PR's timer.

### Postmortem

The postmortem is shown to everyone when the quarter ends. Sections, in this order:

1. **Headline:** Final company value, uptime, breaches and the badge.
2. **🚨 What slipped through:** Each buggy PR that merged, sorted by damage. Each entry shows:
   - the diff with the bug lines highlighted
   - a one-paragraph explanation
   - the incident text
   - "Merged by **Tom**" or "Auto-merged: nobody reviewed it"
   - the full comment thread and the pings, e.g. "Sara flagged line 42, Tom merged it anyway"
3. **🕵️ Great catches:** Declines with the correct type, and who made them.
4. **🤷 Right call, wrong reason:** Declines with the wrong type.
5. **💤 Lost revenue:** Clean PRs that were declined, and by whom.
6. **📊 Team stats:** Per player: PRs merged, declined, comments, catches and misses.

The host gets a **Play again** button that sends the room back to the lobby, keeping the players and drawing a new set of PRs.

---

## PR Content

Claude writes all the PRs. The pool has **30 PRs**: 9 clean, 7 money, 7 security and 7 outage, spread across the areas `payments`, `auth`, `infra`, `ui`, `data` and `api`.

Each PR is a typed object in `content/prs/<id>.ts`:

```ts
import type { PullRequest } from '../../shared/types';

export const pr: PullRequest = {
  id: 'pay-004',
  title: 'Apply promo codes at checkout',
  author: 'dana.k',
  area: 'payments',
  description: 'Lets customers stack a promo code on top of the member discount.',
  language: 'ts',
  diff: `
@@ checkout/total.ts @@
 export function total(cart: Cart, promo?: Promo): number {
   let sum = cart.items.reduce((s, i) => s + i.price * i.qty, 0);
-  sum -= memberDiscount(cart);
+  sum -= memberDiscount(cart);
+  if (promo) sum -= sum * promo.percent;
+  if (promo) sum -= sum * promo.percent;
   return Math.round(sum * 100) / 100;
 }`,
  featureValue: 800_000,
  bug: {
    type: 'money',
    severity: 'major',
    lines: [6],               // 1-based index into the rendered diff lines (excluding @@ headers)
    explanation: 'The promo is applied twice, so a 50% code makes the order free.',
    incident: '💸 Promo stacking bug shipped. Customers checking out for $0. −$2M',
  },
};
```

`bug: null` marks a clean PR. Some clean PRs should *look* suspicious, such as a scary-looking but correct SQL migration, so declining everything isn't a strategy.

**Content rules:**
- Each diff is 10–40 lines.
- Each bug is findable by a careful reviewer within about 60 s on a phone. Nothing relies on knowledge outside the diff.
- `featureValue` ranges from $0.2M to $2M, and bigger features have larger diffs.
- The answer key is never sent to clients before the postmortem, so you can't cheat from devtools.

---

## Tech Stack

| Concern | Choice |
|---|---|
| Runtime | Node.js 22 LTS |
| Language | TypeScript 5 (strict) across server, client and shared code |
| Realtime | `ws` (WebSocket) on the same HTTP server that serves the client |
| Client | Preact + Vite, CSS modules, no UI framework |
| Tests | Vitest for unit and integration, Playwright for end-to-end (desktop and a 390×844 phone viewport) |
| Lint/format | ESLint (typescript-eslint) and Prettier |
| Deploy | One `Dockerfile` and one port (`PORT`, default 3000). Primary target: **Render free web service**. Fallback: a laptop plus a free Cloudflare Tunnel. Any VM also works. |

**Architecture:** The server is authoritative.
- Clients send **intents** such as `merge`, `decline`, `comment` and `ping`.
- The server validates each intent, applies it with a pure game engine, and broadcasts a **public state snapshot** to the room.
- Clients render the countdowns from server timestamps plus a measured clock offset.
- A 250 ms server tick handles spawns, auto-merges and delayed incidents.

### Protocol (`shared/protocol.ts`)

```ts
// client → server
type ClientMsg =
  | { t: 'create'; name: string }
  | { t: 'join'; code: string; name: string; playerId?: string } // playerId lets you rejoin after a reconnect
  | { t: 'start' }                                              // host only, from the lobby
  | { t: 'open'; prId: string }                                 // presence only ("👀 Sara")
  | { t: 'merge'; prId: string }
  | { t: 'decline'; prId: string; bugType: BugType }
  | { t: 'comment'; prId: string; line: number | null; text: string }
  | { t: 'ping'; prId: string }
  | { t: 'rename'; companyName: string }                        // host only, from the lobby
  | { t: 'playAgain' };                                         // host only, from the postmortem

// server → client
type ServerMsg =
  | { t: 'welcome'; playerId: string; code: string; serverNow: number }
  | { t: 'state'; state: PublicRoomState }                      // full snapshot, never includes the answer key
  | { t: 'event'; event: GameEvent }                            // toasts: incident, ping, merge, catch
  | { t: 'postmortem'; report: Postmortem }                     // includes the answer key
  | { t: 'error'; code: ErrorCode; message: string };
```

**Rooms:**
- Codes are 4 uppercase letters without ambiguous ones (no `I`, `O`), e.g. `KZQX`.
- The share link is `/r/KZQX`.
- A room is deleted 30 minutes after its last player disconnects.
- If the host leaves, the player who has been in the room longest becomes host.
- `playerId` is kept in `sessionStorage`, so a refresh puts you back in the same seat.

**Validation:**
- Names are 1–20 characters and comments 1–280, both trimmed.
- Unknown or invalid messages are dropped with an `error` reply.
- Each connection is limited to 10 messages per second.

---

## UI and Mobile

**Desktop (≥ 900 px):** Three columns: queue on the left, the PR view in the centre, and the dashboard and activity feed on the right.

**Phone (< 900 px):**
- A bottom tab bar: 📥 Queue · 📄 PR · 📊 Dashboard.
- The Queue tab shows a badge with the number of open PRs.
- The PR tab shows a dot when someone pings a PR.

**Diff view:**
- Monospace text that wraps long lines (`pre-wrap`), with no horizontal page scroll.
- A line-number gutter.
- Added and removed lines coloured red and green, with `+`/`−` markers so colour isn't the only signal.
- Tapping a line opens an inline comment box anchored under that line.

**Actions:**
- A fixed bottom bar on the PR view with **Merge** and **Decline ▾**. Decline opens a sheet with the 3 bug types.
- Tap targets are at least 44×44 px.
- A confirm step happens only through the decline type sheet, so merging stays one tap.

**Queue cards show:**
- the title and area tag
- a countdown ring that turns red under 20 s
- 👀 viewers
- the 💬 count
- the 🙋 highlight

**Toasts:**
- Incidents, pings and catches appear at the top of the screen on every tab.
- Each toast disappears after 4 s.
- Toasts respect `prefers-reduced-motion`.

**Accessibility:**
- Keyboard operable on desktop (`j`/`k` to move through the queue, `m` to merge, `d` to decline).
- Visible focus states.
- WCAG AA colour contrast.
- `aria-live` on toasts.

---

## Commands

```bash
npm install
npm run dev          # Vite client (5173) + server with watch (3000), proxied together
npm run build        # Type-check + build client to dist/client and server to dist/server
npm start            # Run the production server: serves the client and WebSockets on $PORT
npm test             # Vitest unit + integration
npm run test:e2e     # Playwright (desktop + phone viewport), starts its own server
npm run lint         # ESLint + Prettier check
npm run typecheck    # tsc --noEmit for all projects
docker build -t ship-it . && docker run -p 3000:3000 ship-it
```

## Project Structure

```
shared/        → Types, protocol messages, game config (tunable numbers)
server/
  engine/      → Pure game engine: applyIntent(state, intent, now), tick(state, now), postmortem(state)
  rooms.ts     → Room registry, codes, host handover, cleanup
  ws.ts        → WebSocket wiring, validation, rate limiting
  index.ts     → HTTP server: static client + /r/:code + WS upgrade
content/prs/   → One file per PR plus index.ts (the pool)
client/
  src/
    net/       → Socket client, reconnect, clock offset
    views/     → Lobby, Game (Queue, PrView, Dashboard), Postmortem
    components/→ DiffView, CountdownRing, Toasts, TabBar, DeclineSheet
tests/         → Vitest: engine, scoring, rooms, content validation, ws integration
e2e/           → Playwright: multi-player flows, phone viewport
docs/intent/   → Confirmed statement of intent
```

## Code Style

The game engine has no I/O and no `Date.now()`. Time and randomness are always passed in, so every rule is unit-testable and deterministic.

```ts
export function applyIntent(state: GameState, playerId: string, intent: Intent, now: number): Result {
  const pr = state.prs.get(intent.prId);
  if (!pr || pr.status !== 'open') return reject('PR_NOT_OPEN');

  if (intent.t === 'merge') {
    return ok(resolve(state, pr, { kind: 'merged', by: playerId, at: now }));
  }
  // ...
}
```

**Conventions:**
- `camelCase` for values and `PascalCase` for types and components.
- Files are `kebab-case.ts`.
- Use discriminated unions on `t` / `kind`, with exhaustive `switch` statements.
- No `any`.
- Money is held in **whole dollars as integers** and formatted only at the edge (`$10.4M`).
- Server-only data (the answer key) lives in types that `PublicRoomState` cannot reference.

## Testing Strategy

**Engine unit tests (Vitest) cover every rule in the Game Rules section:**
- all five merge/decline outcomes
- each incident type and severity
- auto-merge on timeout
- incident delay
- first decision wins
- ending the quarter at time-up and when everything resolves early
- the bankruptcy floor
- badge thresholds
- ping cooldown
- comment validation

The tests use a fake clock and a seeded RNG.

**Content validation test:** Every PR in the pool must pass these checks:
- unique ids
- a 10–40 line diff
- every `bug.lines` index exists and points at a `+` line
- `featureValue` in range
- `type` and `severity` valid

The pool must also match the target mix (9 / 7 / 7 / 7). This test is the safety net for content that Claude writes.

**Protocol integration (Vitest + real `ws` clients against an in-process server):**
- create, join, start and play through to the postmortem
- the answer key never appears in any message before the postmortem
- reconnecting with a `playerId` restores the player's seat
- host handover
- the rate limit

**E2E (Playwright, Chromium):**
- two browser contexts (one desktop, one phone at 390×844) play a shortened quarter
- comments and pings show up for the other player
- the postmortem names who merged each bug
- the phone viewport has no horizontal scroll

**Coverage:** At least 90% lines on `server/engine/`. Other code has no hard number.

## Boundaries

- **Always:**
  - Run `npm run typecheck && npm run lint && npm test` before each commit.
  - Keep all balance numbers in `shared/config.ts`.
  - Render user text as text.
  - Keep the answer key server-side until the postmortem.
- **Ask first:**
  - Adding dependencies beyond the stack listed above.
  - Adding persistence or a database.
  - Changing the scoring model or the out-of-scope list.
  - Changing the deploy target.
- **Never:**
  - Commit secrets.
  - Edit `.claude/skills` (vendored).
  - Send the answer key to clients early.
  - Skip or delete failing tests to get green.

## Success Criteria

1. **Fast setup:** A host can create a room and 4+ players (mixing desktop and phone) can join by link and finish a full 10-minute quarter without errors or desyncs. Everyone sees the same queue, state and timers to within 1 s.
2. **Rules verified:** Every rule in Game Rules is covered by a passing engine test.
3. **Complete content:** The pool contains 30 PRs that pass content validation (9 clean, 7 money, 7 security, 7 outage).
4. **Correct postmortem:** For every merged bug it shows the highlighted line, the explanation, the merger or "nobody reviewed it", and that PR's comments and pings.
5. **Phone is fully playable:** At a 390 px wide viewport there's no horizontal page scroll, and every action (open, comment on a line, merge, decline, ping) can be done one-handed with ≥ 44 px targets.
6. **No cheating:** The integration test proves no client message contains bug data before the postmortem.
7. **One command:** `npm start` (or `docker run`) serves the whole game on one port.
8. **Playtest:** One real playtest with the team on a call. Everyone finishes the quarter, and the scoring numbers are tuned afterwards in `shared/config.ts`.

## Hosting

| Option | Cost | Caveats |
|---|---|---|
| **Render free web service** (chosen) | $0 | Spins down after 15 min without traffic. The first visit after that takes about 1 min to wake up. Since Feb 2026, WebSocket messages keep it awake during a game. Render may restart it occasionally, which ends any game in progress. |
| Laptop + Cloudflare Tunnel | $0 | Only up while the host's laptop is running it. |
| Fly.io | ~$2–3/month | No free tier for new accounts. Always on and no cold start. |

In-memory rooms suit a sleeping free host: when nobody is playing, there's nothing to lose. The host should open the site a minute before the call so it's already awake.

## Open Questions

1. **Company name:** Keep the "random funny company name, host can rename" idea, or always use a fixed name?
2. **Incident delay:** Is a 4–12 s delay before an incident fires more fun, or would you rather see the hit immediately on merge?
