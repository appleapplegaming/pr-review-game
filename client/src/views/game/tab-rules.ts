// Phone tab rules. Pure: no DOM and no store, so they are unit-tested in Vitest.
//
// Below 900 px the game shows one column at a time: the queue, the PR, or the dashboard. At 900 px
// and wider all three sit side by side and the tabs are hidden (see GameScreen.module.css).

export const PHONE_TABS = ['queue', 'pr', 'dashboard'] as const;
export type PhoneTab = (typeof PHONE_TABS)[number];

/** The badge on the Queue tab: the open PR count, or null when there is nothing to show. */
export function queueBadge(openCount: number): string | null {
  if (openCount <= 0) return null;
  return openCount > 99 ? '99+' : String(openCount);
}

/** The dot on the PR tab: a ping is waiting to be seen, and the player is not already on that tab. */
export function pingDotVisible(unseenPingPrIds: readonly string[], tab: PhoneTab): boolean {
  return unseenPingPrIds.length > 0 && tab !== 'pr';
}

/**
 * Whether the PR keys (m to merge, d to decline) may act now. On a phone the PR is hidden on the
 * other tabs, so those keys must not act on it there. Desktop shows every column, so it is always on.
 */
export function keysActive(wide: boolean, tab: PhoneTab): boolean {
  return wide || tab === 'pr';
}
