import { defineConfig } from '@playwright/test';

// Normal setup: `npx playwright install chromium` downloads the browser this
// Playwright version expects. Sandboxes that ship their own Chromium and block
// downloads can point at it instead with PLAYWRIGHT_CHROMIUM_EXECUTABLE.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;

// A fixed port, so the tests never reach a dev server on 3000 by accident.
const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  // A time-scaled quarter lasts about a minute, so each test gets room for one full game.
  timeout: 120_000,
  expect: { timeout: 15_000 },
  // Two workers: the full-quarter and accessibility specs run side by side on one server.
  workers: 2,
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  webServer: {
    // The production build, served by the same entry point as deployment.
    command: 'npm run build:client && npm run build:server && node dist/server/index.js',
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
    env: {
      NODE_ENV: 'test',
      SHIP_IT_TIME_SCALE: '0.1',
      PORT: String(PORT),
    },
  },
});
