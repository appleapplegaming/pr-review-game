import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { createRoom, newPlayer, startQuarter, waitForPostmortem } from './helpers';

/** WCAG 2.0 and 2.1 A and AA rules. Only serious and critical violations fail the build. */
async function seriousViolations(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  return results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

test('landing, lobby, game and postmortem have no serious or critical a11y violations', async ({
  browser,
}) => {
  const player = await newPlayer(browser, 'desktop');
  const page = player.page;

  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Create room' })).toBeEnabled();
  expect(await seriousViolations(page)).toEqual([]);

  await createRoom(page, 'Ada');
  await expect(page.getByRole('button', { name: 'Start quarter' })).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);

  await startQuarter(page);
  await expect(
    page.getByRole('list', { name: 'Review queue' }).getByRole('button').first(),
  ).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);

  await waitForPostmortem(page);
  expect(await seriousViolations(page)).toEqual([]);

  await player.context.close();
});
