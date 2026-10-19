# Implementation Plan: Ship It (PR Review Game)

Source spec: [`SPEC.md`](../SPEC.md) · Intent: [`docs/intent/pr-review-game.md`](../docs/intent/pr-review-game.md) · Task details: [`tasks/todo.md`](todo.md)

## Overview

We're building a browser co-op game for 2–8 players. The team reviews a shared queue of short TypeScript PRs during a 10-minute "quarter". Merging clean PRs grows company value. Merging buggy PRs fires delayed incidents. A postmortem at the end shows what slipped through and who merged it.

The build has these parts:

- **Server:** one Node 22 process that is authoritative. It runs a pure game engine, keeps rooms in memory and talks over WebSockets.
- **Client:** Preact + Vite, working on desktop and phone.
- **Content:** a pool of 30 hand-written PRs, checked by a content-validation test.
- **Hosting:** one Docker image on Render's free tier.

The repo is greenfield. Today it has only the spec, the intent doc and the vendored skills.

## Dependency Graph

```
shared/ (types, config, protocol, money format)
   │
   ├── content/prs/ schema + validator ──────────────► 30-PR pool (parallel track)
   │
   └── server/engine/ (pure: setup → decisions → tick → comments/pings → projection → postmortem)
          │
          └── server/rooms.ts (registry, codes, host handover, cleanup)
                 │
                 └── server/ws.ts + server/index.ts (validation, rate limit, tick loop, HTTP/static)
                        │
                        └── client/src/net (socket, reconnect, clock offset)
                               │
                               └── client views: Lobby → Queue/PR → Actions → Comments/Pings
                                                → Dashboard/Toasts → Phone layout → Postmortem
                                                       │
                                                       └── e2e → Docker/Render → playtest
```

## Architecture Decisions

- **Separate engine and transport.** `server/engine/` has no I/O, timers, `Date.now()` or `Math.random()`. It takes `(state, intent, now)` and a seeded RNG and returns a new state plus the events to emit. `rooms.ts` and `ws.ts` are thin adapters around it. This is what makes the ≥90% engine coverage and the deterministic rule tests possible.
- **Two state types, with the answer key kept out of the public one by the type system.** `GameState` (server) holds `ServerPr` with `bug`. `PublicRoomState` is built only by `toPublicState()`, which maps each PR to a `PublicPr` type that has no `bug` field. A type-level test (`expectTypeOf`) and the integration leak test both enforce this.
- **Line indexing.** `bug.lines` and a comment's `line` use the same 1-based index into the rendered diff lines, skipping `@@` headers. One shared `parseDiff()` in `shared/` is used by the validator, the engine and `DiffView`, so all three agree.
- **Money is stored as integer dollars everywhere.** `formatMoney()` in `shared/` is the only place that formats it.
- **Full state snapshots, no diffs.** At most 30 PRs and 8 players keep a snapshot small. We broadcast after every accepted intent and every tick that changed something, never on idle ticks.
- **Clock sync.** The client works out its offset from `welcome.serverNow` and measures it again on every reconnect. All countdowns are calculated from server timestamps. This keeps the protocol unchanged, and the spec's "within 1 s" is a loose enough target.
- **Message validation with `zod`** in `server/validate.ts`. The schemas mirror `ClientMsg`, and a type test checks that the inferred types match the protocol, so the two can't drift apart.
- **Test-only time scaling.** The e2e tests need a short quarter. The server reads `SHIP_IT_TIME_SCALE` (for example `0.1`) and applies it only when `NODE_ENV=test`. It scales the durations from `shared/config.ts` at room creation, so the balance numbers still have one source.
- **Content runs on its own track.** It's validated by the test, not by review. After Task 3 lands the schema and validator, the three content batches (Tasks 24–26) can run in parallel with everything else.

## Task List

Full detail for each task (acceptance criteria, verification, files and size) is in [`tasks/todo.md`](todo.md).

### Phase 0: Foundation
- [x] Task 1: Project scaffold and toolchain
- [x] Task 2: Shared types, config, protocol and money formatting
- [x] Task 3: Diff parser, PR content schema, validator and four seed PRs

### Checkpoint A: Foundation
- [ ] `npm run typecheck && npm run lint && npm test` are green on a clean clone

### Phase 1: Game engine (pure, TDD)
- [x] Task 4: Quarter setup: seeded RNG, PR draw and spawn schedule
- [x] Task 5: Decisions: merge and decline outcomes, first decision wins, presence
- [x] Task 6: Tick: spawns, auto-merge, delayed incidents, uptime and quarter end
- [x] Task 7: Comments and second-opinion pings
- [x] Task 8: Public state projection (answer-key boundary)
- [x] Task 9: Postmortem report, badges and team stats

### Checkpoint B: Engine complete
- [x] Every rule in SPEC → Game Rules has a named passing test
- [x] `server/engine/` line coverage ≥ 90%
- [ ] Review with a human before the transport work starts

### Phase 2: Server and realtime (highest risk, so it comes before the UI)
- [x] Task 10: Room registry: codes, join and rejoin, host handover, cleanup, play again
- [x] Task 11: WebSocket layer: validation, rate limit, broadcast and tick loop
- [x] Task 12: HTTP server: static client, `/r/:code`, WebSocket upgrade, `PORT`
- [x] Task 13: Protocol integration tests: full game, leak, reconnect, handover, rate limit

### Checkpoint C: Headless game works
- [x] Scripted `ws` clients play a time-scaled quarter through to the postmortem
- [x] The no-leak integration test is green

### Phase 3: Client (vertical slices)
- [x] Task 14: Client scaffold and net layer: socket, reconnect, clock offset, store
- [ ] Task 15: Lobby: create, join by code or link, start, rename company
- [ ] Task 16: Queue and PR view (desktop): queue cards, countdown ring, DiffView, presence
- [ ] Task 17: Merge and decline actions, rejection feedback, keyboard shortcuts
- [ ] Task 18: Line and PR comments, second-opinion ping
- [ ] Task 19: Dashboard, activity feed and toasts

### Checkpoint D: Desktop playable
- [ ] Two desktop browsers on `npm run dev` can play a full quarter by hand

### Phase 4: Phone, postmortem and polish
- [ ] Task 20: Phone layout: tab bar, fixed action bar, 44 px targets, no horizontal scroll
- [ ] Task 21: Postmortem view, bankruptcy banner and play again
- [ ] Task 22: Accessibility pass (focus, contrast, `aria-live`, reduced motion)

### Checkpoint E: Feature complete
- [ ] A phone (390×844) and a desktop can play a full quarter by hand
- [ ] The postmortem matches the spec's section order and content

### Phase 5: Content (parallel track, can start after Task 3)
- [ ] Task 23: Content authoring guide and per-PR quality checklist
- [ ] Task 24: PR batch A: payments and data (9 PRs)
- [ ] Task 25: PR batch B: auth and api (9 PRs)
- [ ] Task 26: PR batch C: infra and ui (8 PRs), plus the pool-mix assertion

### Phase 6: Ship
- [ ] Task 27: Playwright e2e: desktop and phone players in a time-scaled quarter
- [ ] Task 28: Dockerfile and Render deploy
- [ ] Task 29: Team playtest and balance tuning

### Checkpoint F: Complete
- [ ] All eight Success Criteria in SPEC.md are met
- [ ] Ready for review

## Parallelization

| Can run in parallel | Notes |
|---|---|
| Content batches (24–26) alongside Phases 1–4 | They depend only on Task 3's schema and validator |
| Tasks 7 and 8 | Both build on Task 5's state shape and don't touch the same files |
| Tasks 16–19 after Task 15 | They share the store from Task 14. Agree on the store shape first, then split |
| Task 22 alongside Task 21 | They touch different files |

These must be done in order: Tasks 1→2→3 (the shared contract), Tasks 4→5→6 (engine state shape), and Tasks 10→11→12→13.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| The answer key leaks through an event or snapshot field | High (cheating breaks the game) | Type split (Task 8), `expectTypeOf` test, and a leak test that scans every message (Task 13) |
| Client timers drift or disagree between players | High (Success Criterion 1) | Countdowns come from server timestamps plus the offset, and the offset is measured again on reconnect. An integration test checks spawn and expire timestamps. Desync is checked by hand at Checkpoint D |
| PR content is too easy, too hard or ambiguous | Medium | Validator test, authoring checklist (Task 23), and a dry run of each batch by a reviewer for "findable in about 60 s on a phone" |
| Render free tier cold starts or restarts mid-game | Medium | Already accepted in the spec. Open the site a minute before the call. Cloudflare Tunnel is the documented fallback |
| Balance is off (for example, outages are cheap: a critical outage costs only $960k) | Low | All numbers are in `shared/config.ts`. Tune them at the playtest (Task 29) |
| Mobile diff readability (long TS lines on a 390 px screen) | Medium | `pre-wrap`, a content rule against very long lines, and a phone e2e check for horizontal scroll |
| `.claude/skills` is edited by accident | Low | It's a Boundaries "Never". It's checked in review |

## Resolved Decisions

These were open questions. The game rules among them are now in `SPEC.md`.

1. **Dependencies:** Add whatever the work needs without asking. The "ask first" rule is removed from SPEC → Boundaries.
2. **What counts as a leak:** Before the postmortem, no message contains `bug.lines` or `bug.explanation` for any PR, and no message contains anything about the bug in an open PR. The game shows some things on purpose once a PR is resolved: an incident's text when it fires, and the catch toast and bonus. Those are allowed. The leak test in Task 13 enforces exactly this.
3. **Incidents still pending when the quarter ends:** They fire at once, before the postmortem is built.
4. **Incident toasts:** They show only the incident text, not which PR caused it.
5. **"Sorted by damage":** Total value lost, counting outage downtime at $40k per hour. Ties go to the higher severity.
6. **Spec status:** Approved.

## Open Questions

None.
