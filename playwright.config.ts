import { defineConfig } from '@playwright/test';

// Normal setup: `npx playwright install chromium` downloads the browser this
// Playwright version expects. Sandboxes that ship their own Chromium and block
// downloads can point at it instead with PLAYWRIGHT_CHROMIUM_EXECUTABLE.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;

export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: 'http://localhost:3000',
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
});
