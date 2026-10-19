import { expect, test } from '@playwright/test';
import { createRoom, expectNoHorizontalScroll, joinRoom, newPlayer, startQuarter } from './helpers';

test('the phone layout never scrolls sideways on the landing, lobby or game screens', async ({
  browser,
}) => {
  const host = await newPlayer(browser, 'desktop');
  const phone = await newPlayer(browser, 'phone');

  await phone.page.goto('/');
  await expect(phone.page.getByRole('button', { name: 'Create room' })).toBeEnabled();
  await expectNoHorizontalScroll(phone.page);

  const shareLink = await createRoom(host.page, 'Ada');
  await joinRoom(phone.page, shareLink, 'Grace');
  await expectNoHorizontalScroll(phone.page);

  await startQuarter(host.page);
  const tabs = phone.page.getByRole('navigation', { name: 'Game sections' });
  for (const name of [/^Queue/, /^PR/, /^Dashboard/]) {
    await tabs.getByRole('button', { name }).click();
    await expect(tabs.getByRole('button', { name })).toHaveAttribute('aria-current', 'page');
    await expectNoHorizontalScroll(phone.page);
  }

  await host.context.close();
  await phone.context.close();
});
