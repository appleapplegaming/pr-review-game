# Ship It: handoff

## Done
All 29 tasks except the human-only items below are implemented on this branch: shared contract, pure engine, rooms, WebSocket and HTTP server, Preact client (desktop and phone), postmortem, accessibility pass, a 30-PR content pool, Playwright e2e, Dockerfile and Render config.

## Verified automatically
- `npm run typecheck`, `npm run lint`, `npm test` (39 files, 666 tests), `npm run build`: green.
- `npm run test:e2e` (3 specs, Chromium, `SHIP_IT_TIME_SCALE=0.1`): desktop and phone players finish a quarter, no horizontal scroll on phone, axe finds no serious or critical issues. It also asserts that focus lands on the PR heading after a merge.
- Engine line coverage is at least 90%. The no-leak integration test passes. Content tests check the 30-PR 9/7/7/7 mix.

## Remaining human or manual items (unticked in `tasks/todo.md`)
- Task 1: fresh clone plus `npm install` shows no engine-version warning.
- Checkpoints A, B, C, E, F: human reviews (shared types, engine, protocol, UX), a clean-clone check, a phone and a desktop playing a quarter by hand, all eight Success Criteria, Definition of Done.
- Tasks 15, 16, 17, 18, 19: two real browsers on `npm run dev` (create/join/start, same queue and timers, merge race, comments and ping, incident toast 4-12 s after a buggy merge).
- Task 20: devtools at 390x844 and a real iOS Safari device.
- Task 21: a quarter with deliberate misses gives a correct postmortem.
- Task 22: keyboard-only quarter on desktop (criterion and manual check), and a contrast audit.
- Task 23: a human reviews the assignment matrix. Tasks 24 and 25: a reviewer who has not seen the answer key finds each bug in about 60 s.
- Task 28: `docker build` and run, image has no dev dependencies or secrets, live Render service checked from a phone on mobile data.
- Task 29: team playtest, balance tuning (all numbers are in `shared/config.ts`), Success Criteria 1 and 8.

## Known gaps and judgment calls for a human
- A bankrupt game can still show an uptime badge, as SPEC allows.
- The spawn rate follows the live player count: `replanUpcoming` (engine) re-plans the PRs still to spawn when players join, or after a player has been gone for `leaveGraceMs` (rooms). Plan: `tasks/plan-spawn-rate.md`.
- There is no room player cap: the protocol has no `ROOM_FULL` error, so the 2-8 players range is a design target, not enforced.
- The Docker image was not built in the sandbox (proxy TLS). The Dockerfile is untested.
- The e2e merged-by and auto-merged assertions depend on the random bug mix (about 0.02% flake). A test-only seed was not added: room codes, company names and room seeds share one `random` source, and two parallel specs create rooms in a racy order, so a seed would not make the mix deterministic without refactoring `rooms.ts`.
- The e2e suite needs a Chromium that matches @playwright/test. In sandboxes without the download, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE`.
