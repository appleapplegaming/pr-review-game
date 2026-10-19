# Task List: Ship It (PR Review Game)

Plan: [`tasks/plan.md`](plan.md) · Spec: [`SPEC.md`](../SPEC.md)

A task is done only when its acceptance criteria are met **and** it passes the standing [Definition of Done](../.claude/references/definition-of-done.md). Before every commit, run `npm run typecheck && npm run lint && npm test` (from SPEC → Boundaries). Never edit `.claude/skills`.

---

## Phase 0: Foundation

## Task 1: Project scaffold and toolchain

**Description:** Set up an empty TypeScript project with three areas (`shared`, `server`, `client`) using strict TypeScript. Every npm script from SPEC → Commands should exist and run, even when there's almost nothing for it to do yet.

**Acceptance criteria:**
- [x] `npm install` works on Node 22, and `engines.node` is set to `>=22`.
- [x] `typecheck`, `lint`, `test`, `build`, `dev`, `start` and `test:e2e` scripts exist. `test` runs a placeholder Vitest test.
- [x] `strict` is on, `noUncheckedIndexedAccess` is on, and ESLint bans `any` (`@typescript-eslint/no-explicit-any: error`).

**Verification:**
- [x] `npm run typecheck && npm run lint && npm test` all pass.
- [ ] Manual check: a fresh clone followed by `npm install` has no warnings about the engine version.

**Dependencies:** None

**Files likely touched:** `package.json`, `tsconfig.json` (+ `tsconfig.{shared,server,client}.json`), `eslint.config.js`, `.prettierrc`, `vitest.config.ts`, `.gitignore`

**Estimated scope:** Medium (all config files)

---

## Task 2: Shared types, config, protocol and money formatting

**Description:** Write the shared contract. This covers the domain types (`PullRequest`, `Bug`, `BugType`, `Severity`, `Area`), the server-only and public state types, `GameEvent`, `Postmortem` and `ErrorCode`. It also covers `ClientMsg`/`ServerMsg` exactly as the spec defines them, every balance number in `shared/config.ts`, and `formatMoney()`.

**Acceptance criteria:**
- [x] Every number in SPEC → Game Rules is in `shared/config.ts`, with no magic numbers anywhere else.
- [x] `PublicRoomState` and `PublicPr` can't refer to `Bug` (a type-level test checks this with `expectTypeOf`).
- [x] `formatMoney()` turns whole dollars into strings like `$10.4M`, `$150k` and `$0`, and unit tests cover it.

**Verification:**
- [x] Tests pass: `npx vitest run tests/shared`
- [x] `npm run typecheck`

**Dependencies:** Task 1

**Files likely touched:** `shared/types.ts`, `shared/protocol.ts`, `shared/config.ts`, `shared/money.ts`, `tests/shared/types.test.ts`

**Estimated scope:** Medium

---

## Task 3: Diff parser, PR content schema, validator and four seed PRs

**Description:** Write `parseDiff()`, which turns a diff string into rendered lines. It skips `@@` headers, labels each line as `+`, `-` or context, and numbers lines from 1. Write a `validatePr()` that runs every per-PR rule from SPEC → Testing Strategy. Seed the pool with one clean PR and one of each bug type so the engine has real content to test against.

**Acceptance criteria:**
- [x] The spec's `pay-004` example parses so that `bug.lines: [6]` points at a `+` line.
- [x] The validator catches duplicate ids, diffs outside 10–40 lines, `bug.lines` that are out of range or point at a non-`+` line, `featureValue` outside $0.2M–$2M, and a bad type or severity. Each check has a negative test.
- [x] `content/prs/index.ts` exports the pool, and all four seed PRs pass validation.

**Verification:**
- [x] Tests pass: `npx vitest run tests/content`

**Dependencies:** Task 2

**Files likely touched:** `shared/diff.ts`, `content/validate.ts`, `content/prs/index.ts`, `content/prs/*.ts` (4 files), `tests/content/validate.test.ts`

**Estimated scope:** Medium

## Checkpoint A: Foundation
- [ ] `npm run typecheck && npm run lint && npm test` pass on a clean clone
- [ ] Shared types reviewed by a human (this is the contract every later task depends on)

---

## Phase 1: Game engine (pure, TDD; a fake clock and a seeded RNG in every test)

## Task 4: Quarter setup: seeded RNG, PR draw and spawn schedule

**Description:** Write `createQuarter(pool, playerCount, rng, now)`. It draws `clamp(8 + 4 × players, 12, 30)` PRs with about ⅓ clean and ⅔ buggy, and at least one PR of each bug type. It spreads their spawn times evenly over the first 8:30, with ±20% jitter, and sets the starting metrics.

**Acceptance criteria:**
- [x] PR counts are correct for 1, 2, 5 and 8 players (12, 16, 28 and 30, per SPEC's `clamp(8 + 4 × players, 12, 30)`), and the same seed always gives the same draw.
- [x] Every draw has at least one money, one security and one outage PR, and the clean share is about ⅓, tested over many seeds.
- [x] Every spawn falls within [0, 8:30], spawns are in order, and the jitter stays within ±20% of the slot.

**Verification:**
- [x] Tests pass: `npx vitest run tests/engine/setup.test.ts`

**Dependencies:** Task 3

**Files likely touched:** `server/engine/rng.ts`, `server/engine/setup.ts`, `server/engine/state.ts`, `tests/engine/setup.test.ts`

**Estimated scope:** Small–Medium

---

## Task 5: Decisions: merge and decline outcomes, first decision wins, presence

**Description:** Write `applyIntent` for `open`, `merge` and `decline`. It covers all five outcomes in the Decisions table, schedules incidents 4–12 s after a buggy merge, rejects any second decision with the first decider's name, and records `open` as presence only.

**Acceptance criteria:**
- [x] There's a test for each of the five rows of the outcome table, covering value changes, the +$150k bonus, lost revenue and "right call, wrong reason".
- [x] A second merge or decline on a resolved PR is rejected as `PR_NOT_OPEN`, with the name of whoever resolved it first.
- [x] A buggy merge schedules one pending incident with `fireAt` between now + 4 s and now + 12 s, using the RNG.

**Verification:**
- [x] Tests pass: `npx vitest run tests/engine/decisions.test.ts`

**Dependencies:** Task 4

**Files likely touched:** `server/engine/apply-intent.ts`, `server/engine/state.ts`, `tests/engine/decisions.test.ts`

**Estimated scope:** Small–Medium

---

## Task 6: Tick: spawns, auto-merge, delayed incidents, uptime and quarter end

**Description:** Write `tick(state, now, rng)` (the RNG is needed because an auto-merged buggy PR schedules its incident). It spawns PRs that are due and auto-merges PRs older than 90 s. It fires due incidents with the effect for their type and severity, applies the uptime formula and the $0 floor (bankruptcy), and ends the quarter at 10:00, when everything is resolved early, or on bankruptcy. Per SPEC → Quarter, when the quarter ends it auto-merges any open PRs and fires all pending incidents.

**Acceptance criteria:**
- [x] There's a test for each type × severity cell in the Incidents table, and an uptime test such as 4 h of downtime giving 99.815%.
- [x] Auto-merge happens at exactly 90 s and is recorded as `by: null` ("nobody reviewed it").
- [x] The quarter ends in each of three ways (time-up, early resolve, bankruptcy), each with its own test. Value never drops below 0.

**Verification:**
- [x] Tests pass: `npx vitest run tests/engine/tick.test.ts`

**Dependencies:** Task 5

**Files likely touched:** `server/engine/tick.ts`, `server/engine/incidents.ts`, `tests/engine/tick.test.ts`, `tests/engine/incidents.test.ts`

**Estimated scope:** Medium

---

## Task 7: Comments and second-opinion pings

**Description:** Add `comment` and `ping` to `applyIntent`. Comments are trimmed and must be 1–280 characters. A comment's `line` must exist in the parsed diff, or be `null` for the whole PR. Comments still work after a PR resolves. A ping marks the PR as highlighted until it resolves, a player can ping the same PR only once every 20 s, and neither action pauses the PR's timer.

**Acceptance criteria:**
- [x] Comments that are empty, too long or on an out-of-range line are rejected. A comment on a resolved PR is accepted.
- [x] A second ping from the same player on the same PR within 20 s is rejected, and one after 20 s is accepted. Pings from different players are independent.
- [x] The highlight clears when the PR resolves, and an expiry test shows comments and pings don't change the PR's timer.

**Verification:**
- [x] Tests pass: `npx vitest run tests/engine/collab.test.ts`

**Dependencies:** Task 5 (can run in parallel with Tasks 6 and 8)

**Files likely touched:** `server/engine/apply-intent.ts`, `server/engine/collab.ts`, `tests/engine/collab.test.ts`

**Estimated scope:** Small

---

## Task 8: Public state projection (answer-key boundary)

**Description:** Write `toPublicState(state, now)`, which returns `PublicRoomState`. It includes the queue (spawned PRs only), each PR's status and decider, viewers, comment counts, highlights, metrics, time remaining and players. It never includes bug data, and it never includes PRs that haven't spawned yet.

**Acceptance criteria:**
- [x] A test deep-scans the output of a state full of buggy PRs and finds no `bug`, `lines`, `explanation`, `severity` or incident strings.
- [x] PRs that haven't spawned yet don't appear, so the client can't see what's coming.
- [x] The output is JSON-serializable, with no `Map` or `Set` values left in it.

**Verification:**
- [x] Tests pass: `npx vitest run tests/engine/projection.test.ts`

**Dependencies:** Task 5

**Files likely touched:** `server/engine/projection.ts`, `tests/engine/projection.test.ts`

**Estimated scope:** Small

---

## Task 9: Postmortem report, badges and team stats

**Description:** Write `postmortem(state)`. It builds the six sections in the order the spec gives. "What slipped through" is sorted by damage (SPEC → Postmortem) and lists the merger or "nobody reviewed it", the comment thread and the pings. The other sections are great catches, right call wrong reason, lost revenue, team stats, the badge and the bankruptcy flag.

**Acceptance criteria:**
- [x] There's a test for each badge threshold, including the exact boundary values (99.99%, 99.9%, 99%, 0 breaches and 1 breach).
- [x] A missed bug that a player flagged on line N shows the comment and ping history needed for "Sara flagged line 42, Tom merged it anyway".
- [x] Team stats per player (merged, declined, comments, catches, misses) add up to the totals in the action log.

**Verification:**
- [x] Tests pass: `npx vitest run tests/engine/postmortem.test.ts`
- [x] `npx vitest run --coverage server/engine` shows ≥ 90% line coverage

**Dependencies:** Tasks 6 and 7

**Files likely touched:** `server/engine/postmortem.ts`, `server/engine/badge.ts`, `tests/engine/postmortem.test.ts`

**Estimated scope:** Medium

## Checkpoint B: Engine complete
- [x] Every rule in SPEC → Game Rules has a matching test name (mapping in `docs/engine-rule-tests.md`)
- [x] `server/engine/` coverage ≥ 90%
- [ ] Human review before the transport work starts

---

## Phase 2: Server and realtime

## Task 10: Room registry: codes, join and rejoin, host handover, cleanup, play again

**Description:** Write `rooms.ts`. It generates 4-letter codes without `I` or `O` and never reuses a live code. It handles create and join, rejoin by `playerId`, and joining mid-quarter. When the host leaves, the player who has been in the room longest becomes host. A room is deleted 30 minutes after its last player disconnects. It also handles the host-only `start`, `rename` and `playAgain`, and gives each new room a random funny company name.

**Acceptance criteria:**
- [x] Codes match `^[A-HJ-NP-Z]{4}$`. Joining with an unknown code, or a name that's empty or over 20 characters after trimming, returns an error.
- [x] `start`, `rename` and `playAgain` from a player who isn't the host are rejected. After the host leaves, the oldest remaining player becomes host.
- [x] Cleanup is tested with a fake clock: the room survives 29:59 after its last disconnect and is gone at 30:00. Any reconnect resets the timer.

**Verification:**
- [x] Tests pass: `npx vitest run tests/server/rooms.test.ts`

**Dependencies:** Task 9

**Files likely touched:** `server/rooms.ts`, `server/company-names.ts`, `tests/server/rooms.test.ts`

**Estimated scope:** Medium

---

## Task 11: WebSocket layer: validation, rate limit, broadcast and tick loop

**Description:** Write `ws.ts`. It parses and validates every `ClientMsg` with `zod` schemas and replies `error` to anything invalid. It limits each connection to 10 messages per second. It sends `welcome` with `serverNow`, broadcasts `state`, `event` and `postmortem` to the room, and runs a 250 ms tick for each active room that broadcasts only when something changed.

**Acceptance criteria:**
- [x] A type test shows the schemas' inferred types match `ClientMsg`.
- [x] Malformed JSON, an unknown `t`, wrong field types or extra-long strings each get an `error` reply, and the socket stays open.
- [x] The 11th message within one second is dropped with a `RATE_LIMITED` error.
- [x] The tick loop stops when a room has no game running, so there are no timers left behind after cleanup.

**Verification:**
- [x] Tests pass: `npx vitest run tests/server/validate.test.ts tests/server/ws.test.ts`

**Dependencies:** Task 10

**Files likely touched:** `server/ws.ts`, `server/validate.ts`, `server/clock.ts`, `tests/validate.test.ts`, `tests/ws.test.ts`

**Estimated scope:** Medium

---

## Task 12: HTTP server: static client, `/r/:code`, WebSocket upgrade, `PORT`

**Description:** Write `index.ts`. It serves `dist/client` with the right content types and returns `index.html` for `/` and `/r/:code`. It handles the WebSocket upgrade on the same server, reads `PORT` (default 3000), and applies `SHIP_IT_TIME_SCALE` only when `NODE_ENV=test`. It also exports `startServer()` for the in-process tests.

**Acceptance criteria:**
- [x] `GET /r/KZQX` returns the app's HTML. Requests for unknown static files get a 404, and path traversal attempts are blocked.
- [x] `startServer({ port: 0 })` returns the port it actually bound and a `close()` function.
- [x] The time scale has no effect unless `NODE_ENV=test`.

**Verification:**
- [x] Tests pass: `npx vitest run tests/http.test.ts`
- [x] Build succeeds: `npm run build && npm start` serves on `$PORT`

**Dependencies:** Task 11

**Files likely touched:** `server/index.ts`, `server/static.ts`, `tests/http.test.ts`

**Estimated scope:** Small

---

## Task 13: Protocol integration tests: full game, leak, reconnect, handover, rate limit

**Description:** Write the integration tests from SPEC → Testing Strategy. They run real `ws` clients against `startServer()` with fake timers or time scaling.

**Acceptance criteria:**
- [x] Three clients create a room, join, start, merge, decline, comment and ping, and every client receives an identical `postmortem`.
- [x] A leak test records every message sent before `postmortem` and checks it against the leak rule in SPEC → Content rules. It also checks that the allowed exceptions (fired incident text, the catch toast) show up only after their PR is resolved.
- [x] Reconnecting with a `playerId` puts the player back in the same seat. When the host disconnects, host passes to the next player, and the rate limit works end to end.

**Verification:**
- [x] Tests pass: `npx vitest run tests/integration`

**Dependencies:** Task 12

**Files likely touched:** `tests/integration/game-flow.test.ts`, `tests/integration/leak.test.ts`, `tests/integration/session.test.ts`, `tests/integration/helpers.ts`

**Estimated scope:** Medium

## Checkpoint C: Headless game works
- [x] Full suite green, including the leak test
- [ ] Human review of the protocol behaviour before UI work

---

## Phase 3: Client (vertical slices)

## Task 14: Client scaffold and net layer: socket, reconnect, clock offset, store

**Description:** Set up Vite and Preact using CSS modules. Write a socket client that reconnects with backoff and sends `join` with the `playerId` stored in `sessionStorage`. The clock offset comes from `welcome.serverNow`. A small store keeps the latest `state`, an event queue and the `postmortem`. `npm run dev` proxies `/ws` to the server.

**Acceptance criteria:**
- [x] `serverTime()` returns `Date.now()` plus the offset. A unit test covers how the offset is calculated.
- [x] When the socket drops, the client reconnects and sends `join` with the stored `playerId`.
- [x] `npm run dev` serves the client on 5173 with a working WebSocket connection to 3000.

**Verification:**
- [x] Tests pass: `npx vitest run tests/client/net.test.ts`
- [x] Build succeeds: `npm run build`

**Dependencies:** Task 12

**Files likely touched:** `client/index.html`, `client/vite.config.ts`, `client/src/main.tsx`, `client/src/net/socket.ts`, `client/src/net/store.ts`

**Estimated scope:** Medium

---

## Task 15: Lobby: create, join by code or link, start, rename company

**Description:** Build the landing and lobby screens. A player can create a room, or join with a code or a `/r/CODE` link plus a name. The lobby shows the player list (host marked) and a share link with a copy button. The host also gets start and rename-company controls.

**Acceptance criteria:**
- [x] Opening `/r/KZQX` fills in the code, so the player only needs to type a name.
- [x] Only the host sees the Start and Rename controls. Server errors (unknown room, invalid name) show up inline.
- [x] Refreshing the page puts the player back in the same seat.

**Verification:**
- [ ] Manual check: two browsers on `npm run dev` can create, join and start a game. (Automated Playwright run passed: two browser contexts, create, join by link, rename, start. A human check is still open.)
- [x] Build succeeds: `npm run build`

**Dependencies:** Task 14

**Files likely touched:** `client/src/views/lobby.tsx`, `client/src/views/landing.tsx`, `client/src/app.tsx`, `client/src/views/lobby.module.css`

**Estimated scope:** Medium

---

## Task 16: Queue and PR view (desktop): queue cards, countdown ring, DiffView, presence

**Description:** Build the three-column desktop layout for 900 px and wider. Each queue card shows the title, area, a countdown ring (red under 20 s), 👀 viewers, a 💬 count and the 🙋 highlight. The PR view shows the title, description and a `DiffView` with a gutter, `+`/`−` markers and `pre-wrap`. Selecting a PR sends `open`.

**Acceptance criteria:**
- [ ] The countdown matches the server's expiry time to within 1 s, because it uses `serverTime()`.
- [ ] `DiffView` line numbers match `parseDiff()` from `shared/`, and added and removed lines show a marker, not just a colour.
- [ ] Opening a PR shows "👀 Name" on that card for the other players.

**Verification:**
- [ ] Tests pass: `npx vitest run tests/client/diff-view.test.tsx`
- [ ] Manual check: two players see the same queue and timers

**Dependencies:** Task 15

**Files likely touched:** `client/src/views/game.tsx`, `client/src/views/queue.tsx`, `client/src/views/pr-view.tsx`, `client/src/components/diff-view.tsx`, `client/src/components/countdown-ring.tsx`

**Estimated scope:** Medium

---

## Task 17: Merge and decline actions, rejection feedback, keyboard shortcuts

**Description:** Add a Merge button (one tap) and a Decline ▾ button that opens a `DeclineSheet` with 💸 / 🔓 / 🔥. When the server rejects an action, show "Already merged by Sara". Add the desktop keys: `j`/`k` move through the queue, `m` merges and `d` declines.

**Acceptance criteria:**
- [ ] Merge takes one click. A decline isn't sent until the player picks a bug type.
- [ ] When two players act on the same PR, the one who loses the race sees who resolved it.
- [ ] Keyboard shortcuts don't fire while the player is typing in a comment box.

**Verification:**
- [ ] Manual check: a race between two browsers shows the right message
- [ ] Build succeeds: `npm run build`

**Dependencies:** Task 16

**Files likely touched:** `client/src/components/action-bar.tsx`, `client/src/components/decline-sheet.tsx`, `client/src/hooks/use-shortcuts.ts`, `client/src/views/pr-view.tsx`

**Estimated scope:** Small–Medium

---

## Task 18: Line and PR comments, second-opinion ping

**Description:** Tapping a diff line opens a comment box anchored under that line. There's also a box for comments on the whole PR. Comment threads update live, and comments are rendered as text, never as HTML. Add a 🙋 Second opinion? button that shows its 20 s cooldown.

**Acceptance criteria:**
- [ ] A comment containing `<img onerror>` shows up as literal text.
- [ ] Comments appear for other players without a refresh, and the 💬 count updates.
- [ ] The ping button is disabled during its cooldown, and the highlight appears in everyone's queue.

**Verification:**
- [ ] Tests pass: `npx vitest run tests/client/comments.test.tsx`
- [ ] Manual check: comments and a ping show up in a second browser

**Dependencies:** Task 16 (can run in parallel with Tasks 17 and 19)

**Files likely touched:** `client/src/components/comment-box.tsx`, `client/src/components/comment-thread.tsx`, `client/src/components/diff-view.tsx`, `client/src/components/ping-button.tsx`

**Estimated scope:** Medium

---

## Task 19: Dashboard, activity feed and toasts

**Description:** Build the dashboard: company value, uptime to 3 decimals, breaches and time left in the quarter. Add an activity feed. Toasts for incidents, pings and catches appear on every screen, disappear after 4 s, use `aria-live` and respect `prefers-reduced-motion`.

**Acceptance criteria:**
- [ ] Every number on the dashboard is formatted with `formatMoney()` or the shared uptime formatter.
- [ ] Each incoming `event` shows as a toast for 4 s and is also added to the activity feed.
- [ ] Toasts don't animate when `prefers-reduced-motion: reduce` is set.

**Verification:**
- [ ] Manual check: merging a buggy PR shows an incident toast 4–12 s later, and the dashboard numbers change
- [ ] Build succeeds: `npm run build`

**Dependencies:** Task 16

**Files likely touched:** `client/src/views/dashboard.tsx`, `client/src/components/toasts.tsx`, `client/src/components/activity-feed.tsx`

**Estimated scope:** Small–Medium

## Checkpoint D: Desktop playable
- [ ] Two desktop browsers can play a full quarter (time-scaled) by hand, with no desync over 1 s
- [ ] All tests green, build clean

---

## Phase 4: Phone, postmortem and polish

## Task 20: Phone layout: tab bar, fixed action bar, 44 px targets, no horizontal scroll

**Description:** Below 900 px, show a bottom tab bar (📥 Queue · 📄 PR · 📊 Dashboard). The Queue tab shows a badge with the number of open PRs, and the PR tab shows a dot when someone pings. On the PR view, the Merge and Decline bar stays fixed at the bottom. Every tap target is at least 44×44 px.

**Acceptance criteria:**
- [ ] At 390×844 the page never scrolls horizontally, including on the longest diff line in the pool.
- [ ] Selecting a queue card switches to the PR tab. Toasts show on every tab.
- [ ] Every interactive element measures at least 44×44 px.

**Verification:**
- [ ] Manual check: Chrome devtools at 390×844 and a real iOS Safari device
- [ ] Build succeeds: `npm run build`

**Dependencies:** Tasks 17, 18 and 19

**Files likely touched:** `client/src/components/tab-bar.tsx`, `client/src/views/game.tsx`, `client/src/views/game.module.css`, `client/src/components/action-bar.module.css`

**Estimated scope:** Medium

---

## Task 21: Postmortem view, bankruptcy banner and play again

**Description:** Render the `postmortem` report in the spec's section order. Missed bugs show their diffs with the bug lines highlighted. A bankrupt company gets a special banner. Only the host sees the **Play again** button, which sends everyone back to the lobby.

**Acceptance criteria:**
- [ ] Every missed bug shows the highlighted line, the explanation, the incident text, "Merged by X" or "Auto-merged: nobody reviewed it", and the comments and pings on it.
- [ ] Sections that have nothing in them show a friendly empty state instead of disappearing.
- [ ] Play again sends every client to the lobby with the same players.

**Verification:**
- [ ] Manual check: a quarter played with some deliberate misses produces a correct postmortem
- [ ] Build succeeds: `npm run build`

**Dependencies:** Task 19

**Files likely touched:** `client/src/views/postmortem.tsx`, `client/src/views/postmortem.module.css`, `client/src/components/diff-view.tsx`

**Estimated scope:** Small–Medium

---

## Task 22: Accessibility pass

**Description:** Go through the client against `.claude/references/accessibility-checklist.md`. Check visible focus states, WCAG AA contrast for the diff colours and badges, labels on emoji-only controls, and that the DeclineSheet traps focus.

**Acceptance criteria:**
- [ ] A whole quarter can be played with only the keyboard on desktop.
- [ ] `@axe-core/playwright` finds no serious or critical issues.
- [ ] Every emoji-only control has an accessible name.

**Verification:**
- [ ] Manual check: a keyboard-only playthrough and a contrast audit

**Dependencies:** Task 20 (can run in parallel with Task 21)

**Files likely touched:** `client/src/**/*.module.css`, `client/src/components/decline-sheet.tsx`, `client/src/components/tab-bar.tsx`

**Estimated scope:** Small–Medium

## Checkpoint E: Feature complete
- [ ] A phone and a desktop complete a quarter by hand. The postmortem matches the spec.
- [ ] Human review of UX before content is finalised

---

## Phase 5: Content (parallel track, can start after Task 3)

## Task 23: Content authoring guide and per-PR quality checklist

**Description:** Write `content/README.md` with the content rules from the spec, the area and type matrix (which ids go in which batch), and a checklist for each PR. The checklist covers: the bug is findable in about 60 s on a phone, it needs no knowledge outside the diff, no line is over about 70 characters, bigger features get bigger diffs, and some clean PRs look suspicious.

**Acceptance criteria:**
- [ ] The matrix assigns all 30 ids so the pool comes out 9 clean, 7 money, 7 security and 7 outage across the six areas.
- [ ] The matrix includes the four seed PRs from Task 3.

**Verification:**
- [ ] Manual check: a human reviews the matrix

**Dependencies:** Task 3

**Files likely touched:** `content/README.md`

**Estimated scope:** XS

---

## Task 24: PR batch A: payments and data (9 PRs)

**Description:** Write the batch A PRs from the Task 23 matrix.

**Acceptance criteria:**
- [x] Every PR passes `validatePr()`, and its diff is real-looking TypeScript.
- [ ] A reviewer who hasn't seen the answer key finds each bug in about 60 s, and doesn't flag the suspicious-looking clean PRs.

**Verification:**
- [x] Tests pass: `npx vitest run tests/content`

**Dependencies:** Task 23

**Files likely touched:** `content/prs/*.ts` (9 new files), `content/prs/index.ts`

**Estimated scope:** Medium (the files are all the same kind: content only)

---

## Task 25: PR batch B: auth and api (9 PRs)

Same as Task 24 for batch B. **Dependencies:** Task 23. Can run in parallel with Tasks 24 and 26.

**Acceptance criteria / Verification:** as in Task 24.

**Files likely touched:** `content/prs/*.ts` (9 new files), `content/prs/index.ts`

**Estimated scope:** Medium

---

## Task 26: PR batch C: infra and ui (8 PRs), plus the pool-mix assertion

**Description:** Write the last batch, then add the pool-level test that requires exactly 30 PRs with the 9/7/7/7 mix.

**Acceptance criteria:**
- [x] The pool has 30 PRs: 9 clean, 7 money, 7 security and 7 outage, all with unique ids (Success Criterion 3).
- [x] Every one of the six areas has at least 3 PRs.

**Verification:**
- [x] Tests pass: `npx vitest run tests/content`

**Dependencies:** Tasks 24 and 25

**Files likely touched:** `content/prs/*.ts` (8 new files), `content/prs/index.ts`, `tests/content/pool.test.ts`

**Estimated scope:** Medium

---

## Phase 6: Ship

## Task 27: Playwright e2e: desktop and phone players in a time-scaled quarter

**Description:** Write the e2e tests from SPEC → Testing Strategy. Playwright's `webServer` starts a production build with `NODE_ENV=test SHIP_IT_TIME_SCALE=0.1`. Two browser contexts play: one desktop and one phone at 390×844.

**Acceptance criteria:**
- [ ] A comment and a ping from one player show up for the other.
- [ ] The postmortem names who merged each bug, and says "nobody reviewed it" for auto-merges.
- [ ] `document.documentElement.scrollWidth <= innerWidth` on the phone viewport on every screen.

**Verification:**
- [ ] `npm run test:e2e` passes 3 runs in a row (no flakes)

**Dependencies:** Tasks 21, 22 and 26

**Files likely touched:** `playwright.config.ts`, `e2e/full-quarter.spec.ts`, `e2e/phone.spec.ts`, `e2e/helpers.ts`

**Estimated scope:** Medium

---

## Task 28: Dockerfile and Render deploy

**Description:** Write a multi-stage `Dockerfile` on Node 22 slim: build, then copy only `dist` and the production dependencies, and run as a non-root user. Document the Render free web service setup and the Cloudflare Tunnel fallback in `README.md`. Deploying to Render is a step outside the repo, so it needs the user's go-ahead.

**Acceptance criteria:**
- [ ] `docker build -t ship-it . && docker run -p 3000:3000 ship-it` serves the full game (Success Criterion 7).
- [ ] The image has no dev dependencies and no secrets.
- [ ] The Render service is live and has been checked from a phone on mobile data.

**Verification:**
- [ ] Manual check: create a room on the deployed URL and join it from a phone

**Dependencies:** Task 27

**Files likely touched:** `Dockerfile`, `.dockerignore`, `README.md`

**Estimated scope:** Small

---

## Task 29: Team playtest and balance tuning

**Description:** Run one real quarter with 4 or more people on a call, using both desktop and phone. Collect feedback, then tune `shared/config.ts`. Outage costs are the main candidate for changes.

**Acceptance criteria:**
- [ ] Everyone finishes the quarter, with no errors or desyncs reported (Success Criteria 1 and 8).
- [ ] Every config change is in a single commit that explains why each number changed.

**Verification:**
- [ ] `npm run typecheck && npm run lint && npm test` pass after tuning (engine tests read from config and don't hard-code numbers)

**Dependencies:** Task 28

**Files likely touched:** `shared/config.ts`, `SPEC.md` (Game Rules table, if the numbers change)

**Estimated scope:** XS

## Checkpoint F: Complete
- [ ] All eight SPEC Success Criteria are checked off
- [ ] Definition of Done (full checklist) satisfied
- [ ] Human review and approval
