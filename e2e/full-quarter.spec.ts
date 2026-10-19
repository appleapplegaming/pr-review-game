import { expect, test } from '@playwright/test';
import {
  createRoom,
  expectNoHorizontalScroll,
  joinRoom,
  newPlayer,
  startQuarter,
  waitForPostmortem,
} from './helpers';

const HOST = 'Ada';
const PHONE_PLAYER = 'Grace';

test('a desktop and a phone player finish a quarter together', async ({ browser }) => {
  const desktop = await newPlayer(browser, 'desktop');
  const phone = await newPlayer(browser, 'phone');
  const queue = (page: typeof desktop.page) => page.getByRole('list', { name: 'Review queue' });

  // Both players sit in the lobby.
  const shareLink = await createRoom(desktop.page, HOST);
  await joinRoom(phone.page, shareLink, PHONE_PLAYER);
  await expect(desktop.page.getByRole('listitem').filter({ hasText: PHONE_PLAYER })).toBeVisible();
  await expectNoHorizontalScroll(phone.page);

  await startQuarter(desktop.page);
  await expect(queue(desktop.page).getByRole('button').first()).toBeVisible();
  await expect(queue(phone.page).getByRole('button').first()).toBeVisible();
  await expectNoHorizontalScroll(phone.page);

  // The phone player opens the top PR, which the desktop shows too (the queue is oldest first).
  await queue(phone.page).getByRole('button').first().click();
  const prTitle = await phone.page
    .getByRole('article')
    .getByRole('heading', { level: 2 })
    .innerText();
  await expect(desktop.page.getByRole('heading', { level: 2, name: prTitle })).toBeVisible();

  // A second-opinion ping and a comment from the phone reach the desktop.
  const phoneNote = 'Second look: this retry path skips the lock';
  await phone.page.getByRole('button', { name: 'Second opinion?' }).click();
  await phone.page.getByRole('textbox', { name: 'Comment on this PR' }).fill(phoneNote);
  await phone.page.getByRole('button', { name: 'Comment', exact: true }).click();
  await expect(desktop.page.getByText(phoneNote)).toBeVisible();
  await expect(queue(desktop.page)).toContainText('Second opinion requested');

  // A comment from the desktop reaches the phone.
  const desktopNote = 'Checking the tests now';
  await desktop.page.getByRole('textbox', { name: 'Comment on this PR' }).fill(desktopNote);
  await desktop.page.getByRole('button', { name: 'Comment', exact: true }).click();
  await expect(phone.page.getByText(desktopNote)).toBeVisible();
  await expectNoHorizontalScroll(phone.page);

  // The desktop player merges eight PRs as they come up. Every other PR runs out its timer.
  for (let merged = 0; merged < 8; merged++) {
    await queue(desktop.page).getByRole('button').first().click();
    await desktop.page.getByRole('button', { name: /^Merge/ }).click();
    await expect(desktop.page.getByRole('status').filter({ hasText: /^Merged/ })).toBeVisible();
    // The Merge button is gone, so focus moves to the PR heading instead of dropping to <body>.
    await expect(desktop.page.getByRole('heading', { level: 2 }).first()).toBeFocused();
  }

  await waitForPostmortem(desktop.page);
  await waitForPostmortem(phone.page);
  await expectNoHorizontalScroll(phone.page);

  // Every bug that slipped names who let it through: a player, or the auto-merge line.
  const slipped = desktop.page.getByRole('region', { name: /What slipped through/ });
  const cards = slipped.getByRole('heading', { level: 3 });
  const count = await cards.count();
  expect(count, 'the desktop player merged at least one bug').toBeGreaterThan(0);
  await expect(
    slipped.getByText(/^(Merged by .+|Auto-merged: nobody reviewed it)\.?$/),
  ).toHaveCount(count);
  await expect(slipped.getByText(`Merged by ${HOST}`).first()).toBeVisible();
  await expect(slipped.getByText('Auto-merged: nobody reviewed it').first()).toBeVisible();

  await desktop.context.close();
  await phone.context.close();
});
