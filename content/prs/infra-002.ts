import type { PullRequest } from '../../shared/types';

export const pr: PullRequest = {
  id: 'infra-002',
  title: 'Prune old releases on deploy',
  author: 'tomas.b',
  area: 'infra',
  description: 'Removes old release folders on deploy so the release disk does not fill up.',
  language: 'ts',
  diff: `
@@ infra/scripts/prune-releases.ts @@
 import { readdir, rm } from 'node:fs/promises';
 import { join } from 'node:path';

-const KEEP_LATEST = 5;
+const KEEP_LATEST = 3;

 /** Deletes all but the newest KEEP_LATEST release folders. */
 export async function prune(root: string): Promise<string[]> {
   const dir = join(root, 'releases');
   const entries = await readdir(dir, { withFileTypes: true });
-  const names = entries.filter((e) => e.isDirectory());
+  const names = entries
+    .filter((e) => e.isDirectory() && /^\\d{14}$/.test(e.name))
+    .map((e) => e.name)
+    .sort();
+  const excess = names.length - KEEP_LATEST;
+  const stale = names.slice(0, Math.max(0, excess));
+  for (const name of stale) {
+    const path = join(dir, name);
+    await rm(path, { recursive: true, force: true });
+  }
+  return stale;
 }
`,
  featureValue: 500_000,
  bug: null,
};
