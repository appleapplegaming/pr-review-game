import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';

/** The phone from the spec: a 390 × 844 viewport with touch enabled. */
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };

/** A desktop browser window. */
const DESKTOP = { viewport: { width: 1280, height: 800 } };

export type PlayerKind = 'desktop' | 'phone';

/** One browser context per player, so each one has its own seat and session. */
export async function newPlayer(
  browser: Browser,
  kind: PlayerKind,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext(kind === 'phone' ? PHONE : DESKTOP);
  const page = await context.newPage();
  return { context, page };
}

/** Fails when the page is wider than the viewport, which would mean a horizontal scroll. */
export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth, 'document scrollWidth must fit the viewport').toBeLessThanOrEqual(innerWidth);
}

/** Creates a room from the landing page and returns its share link (the lobby's read-only field). */
export async function createRoom(page: Page, name: string): Promise<string> {
  await page.goto('/');
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Create room' }).click();
  const shareLink = page.getByLabel('Share link');
  await expect(shareLink).toBeVisible();
  await expect(shareLink).toHaveValue(/\/r\/[A-Za-z0-9]{4}$/);
  return shareLink.inputValue();
}

/** Opens a share link and joins the room under the given name. */
export async function joinRoom(page: Page, shareLink: string, name: string): Promise<void> {
  await page.goto(shareLink);
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Join room' }).click();
  await expect(page.getByRole('heading', { name: /^Players \(/ })).toBeVisible();
}

/** The host starts the quarter; both screens then show the game. */
export async function startQuarter(host: Page): Promise<void> {
  await host.getByRole('button', { name: 'Start quarter' }).click();
  await expect(host.getByText('Quarter in progress')).toBeVisible();
}

/** Waits for the postmortem: the headline stats only appear once the quarter has ended. */
export async function waitForPostmortem(page: Page): Promise<void> {
  // A time-scaled quarter is about a minute, so this allows for the whole quarter.
  await expect(page.getByText('Final company value')).toBeVisible({ timeout: 100_000 });
}
