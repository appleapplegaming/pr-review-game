# Ship It (pr-review-game)

Browser co-op PR review game: players share one fictional company for a quarter, review PRs, catch bugs, stay solvent. Spec: `SPEC.md`. Status and open manual items: `docs/handoff.md`. Task list: `tasks/todo.md`.

## Tech stack
- Preact 11 + Vite (client), Node >=22 + `ws` (server), Zod 4 (protocol validation), TypeScript 5.9
- Tests: Vitest (unit/integration), Playwright + axe (e2e). Lint: ESLint + Prettier.

## Commands
- Dev: `npm run dev` (client :5173, server :3000)
- Typecheck: `npm run typecheck`
- Lint: `npm run lint` (eslint + `prettier --check`); fix formatting with `npm run format`
- Unit/integration: `npm test`
- E2E: `npm run test:e2e` (needs Chromium; else set `PLAYWRIGHT_CHROMIUM_EXECUTABLE`)
- Build: `npm run build` (typecheck + client + server bundles)
- Before calling work done: typecheck, lint, test (and e2e if UI flow changed).

## Layout
- `shared/`: types, `config.ts` (all balance numbers), protocol, diff parser, used by both sides
- `server/engine/`: pure game engine (no I/O); `server/`: HTTP/WS server, room registry
- `client/src/`: views (`landing`, `lobby`, `game`, `postmortem`), `net/socket.ts`, CSS modules, `styles/global.css`
- `content/`: 30-PR seed pool (9/7/7/7 mix, checked by content tests)
- `tests/{client,engine,...}`, `e2e/`

## Conventions
- Keep the engine pure; side effects live in the server/rooms layer.
- Tune balance only in `shared/config.ts`.
- Clients must never receive bug answer keys before postmortem (the no-leak integration test enforces this).
- Colour tokens are declared once with `light-dark()` in `global.css`; `tests/client/contrast.test.ts` guards contrast. Don't re-add per-theme duplicate blocks.
- Accessibility is a requirement: keyboard operable, focus moves to the PR heading after merge/decline, no horizontal scroll on phone.
- Engine line coverage must stay >= 90%.
- Commits: short imperative subject describing the change.

## Boundaries
- Never commit secrets or `.env`; the game needs none.
- WebSocket upgrades require `Origin` host to match `Host`; don't loosen it.
- Ask before changing the shared protocol types in `shared/types.ts` in a breaking way (client and server both depend on it).
