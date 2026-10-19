# Ship It

A browser co-op PR review game. Players share one quarter of a fictional company: they review pull requests, catch bugs, and keep the company from going bankrupt.

## Run locally

Requires Node 22 or later.

```sh
npm ci
npm run dev        # client on http://localhost:5173, server on :3000 (proxies /ws)
```

Production build and run, on one port:

```sh
npm run build      # typecheck, client bundle to dist/client, server bundle to dist/server
npm start          # serves the game and WebSockets on $PORT (default 3000)
```

Tests:

```sh
npm test                         # unit and integration tests (Vitest)
npx playwright install chromium  # once: downloads the browser for the e2e tests
npm run test:e2e                 # Playwright end-to-end tests
```

If browser downloads are blocked (some CI sandboxes ship their own Chromium), skip
`playwright install` and point the tests at the existing browser instead:
`PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chrome npm run test:e2e`.

## Run with Docker

```sh
docker build -t ship-it .
docker run -p 3000:3000 ship-it
```

Open http://localhost:3000. The image is a multi-stage build on `node:22-slim`:

- Only `dist/` and the production dependencies are copied into the runtime stage. No source, tests, docs, dev dependencies or `.env` files end up in the image (see `.dockerignore`).
- The process runs as the unprivileged `node` user, and `PORT` defaults to 3000.
- The game needs no secrets or environment variables beyond the optional `PORT`.

## Deploy to Render (free web service)

This is the primary host. It uses the `Dockerfile` in this repo. The free tier has these limits:

- The service spins down after 15 minutes without traffic. The first visit after that takes about a minute to wake up. Open the site a few minutes before a game.
- Render may restart the service at any time, which ends any game in progress.

Setup (one time, in the Render dashboard):

1. New > Web Service, then connect this GitHub repository and choose the branch to deploy.
2. Runtime: **Docker**. Dockerfile path: `./Dockerfile`. Root directory: empty.
3. Instance type: **Free**.
4. Health check path: `/`.
5. No environment variables are required. Render sets `PORT` itself, and the server reads it.
6. Create the service and wait for the first deploy to finish. Then open the `onrender.com` URL.

Alternatively, `render.yaml` at the repo root describes the same service as a Render Blueprint. Create it with New > Blueprint. The file sets `autoDeployTrigger: checksPass`, so Render deploys a commit only after the GitHub Actions CI checks (`.github/workflows/ci.yml`) pass. For a service created by hand, choose "After CI checks pass" under Settings > Build & Deploy > Auto-Deploy.

Before a playtest, check the deployed URL from a phone on mobile data: create a room, then join it from a second device with the room code.

## Fallback: laptop plus Cloudflare Tunnel

Use this when Render is unavailable. The game is only reachable while the laptop runs it.

```sh
docker run -p 3000:3000 ship-it        # or: npm run build && npm start
cloudflared tunnel --url http://localhost:3000
```

`cloudflared` prints a public `https://<random>.trycloudflare.com` address for a quick tunnel. For a stable hostname, create a named tunnel in Cloudflare Zero Trust that points at `http://localhost:3000`, and attach a domain you control. The tunnel forwards the original `Host` header, which the server needs: it accepts a WebSocket upgrade only when the `Origin` host matches `Host`.

## Other hosts

Any host that runs a Docker container or `node dist/server/index.js` and exposes `$PORT` works. The server listens on `$PORT`, serves the client and WebSockets on that one port, and closes cleanly on SIGTERM.

## Project layout

- `shared/`: types, config numbers, protocol and the diff parser, used by both sides
- `server/`: HTTP and WebSocket server, room registry, and the pure game engine in `server/engine/`
- `client/`: Preact app (Vite)
- `content/`: the PR seed pool
- `tasks/`: the task list and plan. `SPEC.md` is the spec.
