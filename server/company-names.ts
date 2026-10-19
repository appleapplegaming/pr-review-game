// Random funny company names for new rooms. The host can rename the company in the lobby.
// Every name must fit config.companyName (1-40 characters, no control characters); the tests check it.

export const COMPANY_NAMES: readonly string[] = [
  'Works On My Machine Co.',
  'Merge Conflict Ltd',
  'Null Pointer Holdings',
  'Off-By-One Industries',
  'Friday Deploy Inc.',
  'Rubber Duck Ventures',
  'Spaghetti Code Labs',
  'Tabs vs Spaces GmbH',
  'Infinite Loop Partners',
  'Git Blame & Associates',
  'Ship It Or Skip It LLC',
  'Cache Me If You Can',
  'Legacy Code Conglomerate',
  'Dependency Hell Inc.',
  'Hotfix Hotel Group',
  'Segfault Systems',
  'Regex And Regret Co.',
  'Bikeshed Industries',
  'LGTM Enterprises',
  'Chaos Monkey Mutual',
  'Sprint Zero Trust',
  'Dark Launch Capital',
  'Monolith Mortgage Co.',
  'Yolo Deploy Co.',
];

/** A name from the list. `random` returns a number in [0, 1), so the pick is injectable. */
export function randomCompanyName(random: () => number): string {
  const index = Math.min(COMPANY_NAMES.length - 1, Math.floor(random() * COMPANY_NAMES.length));
  return COMPANY_NAMES[index] ?? 'Acme Corp';
}
