import type { PullRequest } from '../../shared/types';

export const pr: PullRequest = {
  id: 'ui-002',
  title: 'Remember the dark mode choice',
  author: 'mei.l',
  area: 'ui',
  description: 'Saves the light or dark theme choice so it survives a page reload.',
  language: 'ts',
  diff: `
@@ client/src/theme.ts @@
 export type Theme = 'light' | 'dark';

 const KEY = 'theme';

+function systemTheme(): Theme {
+  const query = '(prefers-color-scheme: dark)';
+  return window.matchMedia(query).matches ? 'dark' : 'light';
+}
+
-export function currentTheme(): Theme {
-  return 'light';
-}
+export function readTheme(): Theme {
+  try {
+    const saved = window.localStorage.getItem(KEY);
+    if (saved === 'dark' || saved === 'light') return saved;
+  } catch {
+    // Storage can be blocked. Use the system setting instead.
+  }
+  return systemTheme();
+}
+
+export function saveTheme(theme: Theme): void {
+  try {
+    window.localStorage.setItem(KEY, theme);
+  } catch {
+    // Private windows can block storage. The choice is not saved.
+  }
+}
`,
  featureValue: 300_000,
  bug: null,
};
