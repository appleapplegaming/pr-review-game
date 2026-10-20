# Implementation Plan: Spawn rate follows the live player count

Separate from the main build plan (`tasks/plan.md` / `tasks/todo.md`, which still has open manual items).

## Overview

The PR count already scales with players: `prCountFor` gives `clamp(8 + 4 × players, 12, 30)`, spread over a fixed 8:30 spawn window. But it is worked out **once**, in `createQuarter`, from `state.players.length`. A player who joins mid-quarter (SPEC: "dropped straight into the game") changes nothing, and neither does someone leaving. This change re-plans the PRs still to come whenever the number of active players changes. More players means more PRs over the rest of the window, so they arrive faster. Fewer players means the reverse.

Rates today (10-minute game): 1 player 12 PRs (~43 s apart), 2 → 16 (~32 s), 3 → 20 (~26 s), 4 → 24 (~21 s), 5 → 28 (~18 s), 6+ → 30 (~17 s, capped).

## Architecture Decisions

- **Re-plan the future only.** PRs that have already spawned, and their timers, are never touched. Only `quarter.upcoming` changes.
- **Pure engine function.** `replanUpcoming(quarter, pool, playerCount, rng, now)` goes in `server/engine/setup.ts`, next to `createQuarter`, and reuses `prCountFor` and the slot/jitter logic. Rooms decide *when* to call it. The engine stays free of I/O.
- **Target = `prCountFor(players, minutes)` total for the quarter.** Remaining to spawn = `max(0, target − spawned)`. When it grows, extra PRs are drawn from pool PRs not yet used this quarter, keeping about a third clean. When it shrinks, PRs are dropped from `upcoming`, never one that is the last of its bug type, so the "at least one of each bug type" rule still holds.
- **Re-space evenly over what is left of the window.** Remaining PRs get equal slots over `[now, startedAt + spawnWindowMs]`, with the same ±`spawnJitter`. If the window has already closed, the call does nothing.
- **Game length goes on `Quarter`.** Store `minutes` (engine-internal `state.ts`, not `shared/types.ts`), so the re-plan uses the same scaling as the start.
- **Who counts:** connected players. A join counts at once. A leave counts only after `config.leaveGraceMs` (20 s), so a page reload or a phone blip doesn't drop PRs and then draw new ones.
- **Config only in `shared/config.ts`:** `leaveGraceMs`. The `prCount` curve stays as it is.
- **No protocol change.** `totalPrs` in the projection just changes value mid-quarter. No answer key is exposed: upcoming PRs are already hidden.

## Task List

### Phase 1: Engine

- [ ] **Task 1: `replanUpcoming` in the engine** (M)
  - Add `minutes` to `Quarter` and set it in `createQuarter`. Pull the even-spacing code out of `createQuarter` so both functions share it.
  - Implement grow, shrink and re-space as described above. Same player count and same window → `upcoming` is the same length and still sorted.
  - Acceptance:
    - [ ] Growing from 2 to 4 players at 3:00 gives a quarter total of `prCountFor(4)`, every new `spawnAt` is in `[now, window end]` and in ascending order, and nothing is drawn twice.
    - [ ] Shrinking keeps at least one PR of each bug type over spawned plus upcoming PRs, and never touches `quarter.prs`.
    - [ ] Calling it after the window has closed, or when the cap is already reached, returns the quarter unchanged.
  - Verify: `npx vitest run tests/engine/setup.test.ts`; engine coverage stays ≥ 90%.
  - Files: `server/engine/setup.ts`, `server/engine/state.ts`, `tests/engine/setup.test.ts`.
  - Deps: none.

- [ ] **Task 2: Simulation check** (S)
  - Add a seeded simulation where players join at 2:00 and 4:00. Check that the gap between spawns gets smaller and that the quarter still ends on time and passes the postmortem invariants.
  - Verify: `npx vitest run tests/engine/simulation.test.ts`.
  - Files: `tests/engine/simulation.test.ts`.
  - Deps: 1.

### Checkpoint A
- [ ] `npm run typecheck && npm run lint && npm test` pass.
- [ ] Human review of the grow and shrink rules before wiring them into rooms.

### Phase 2: Rooms

- [ ] **Task 3: Re-plan on join** (S)
  - In `server/rooms.ts`, when a new or returning player connects during `phase === 'playing'` and the connected count goes up, call `replanUpcoming` with `room.rng` and `clock.now()`.
  - Acceptance:
    - [ ] Integration test: start with 2 players, join a third mid-quarter, and the next broadcast `totalPrs` goes up.
    - [ ] The no-leak test still passes.
  - Files: `server/rooms.ts`, `tests/rooms.test.ts` (or the existing rooms/protocol test file).
  - Deps: 1.

- [ ] **Task 4: Re-plan on leave, with a grace period** (M)
  - Add `config.leaveGraceMs`. On disconnect, record when it happened. In the room `tick`, once a player has been gone longer than the grace period, re-plan for the lower count. A reconnect within the grace period cancels it.
  - Acceptance:
    - [ ] Disconnect then reconnect within the grace period → `upcoming` is not changed.
    - [ ] Disconnect for longer than the grace period → the total drops to `prCountFor(n − 1)` (or to the number already spawned, if that is higher).
  - Files: `shared/config.ts`, `server/rooms.ts`, `server/engine/state.ts` (if the timestamp lives on `ServerPlayer`), rooms tests.
  - Deps: 3.

### Checkpoint B
- [ ] All tests pass. `npm run build` is clean.
- [ ] Two browsers on `npm run dev` (with `SHIP_IT_TIME_SCALE` to speed things up): a third joins mid-quarter, and the queue fills faster.

### Phase 3: Client and docs

- [ ] **Task 5: Client handles a changing `totalPrs`** (S)
  - Check every place `totalPrs` is shown (dashboard / progress). It must not assume the value is fixed, and a drop must never show "N of M" with N > M. Optionally add a feed or toast entry such as "New teammate: PRs speeding up".
  - Verify: `npm test`; `npm run test:e2e` if the dashboard markup changes.
  - Files: `client/src/game/*`, `tests/client/*`.
  - Deps: 3.

- [ ] **Task 6: SPEC and docs** (XS)
  - SPEC → Game Rules → Quarter: say the PR count and spawn schedule follow the connected player count during the quarter, with the leave grace period. Fix the stale "30-PR pool" in `CLAUDE.md` (the pool now has 52).
  - Files: `SPEC.md`, `CLAUDE.md`, `docs/handoff.md`.
  - Deps: 4.

### Checkpoint C: Complete
- [ ] Typecheck, lint, unit and e2e tests pass. Engine coverage ≥ 90%.
- [ ] Ready for review.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Re-plan bunches spawns right after a join (a burst) | Med | Re-space from `now` with full slots. The first new spawn is at least half a slot away. |
| Reload churn swaps upcoming PRs | Low | Leave grace period; join and leave are not symmetric. |
| Breaking the bug-type guarantee when shrinking | Med | Never drop the last PR of a type. Tested over many seeds. |
| 6+ players are already at the 30 cap, so joins beyond 5 do nothing | Low | Accepted: the cap stays at 30. |
| A bigger draw runs out of clean PRs | Low | The existing draw already caps the clean share at what the pool has. Reuse that rule. |

## Decisions (resolved with the user)

- Leaving slows the game down: Task 4 stays in.
- `leaveGraceMs` is 20 s (`20_000`).
- `prCount.max` stays at 30, so joins beyond 5 players don't change the rate.
