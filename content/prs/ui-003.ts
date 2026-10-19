import type { PullRequest } from '../../shared/types';

export const pr: PullRequest = {
  id: 'ui-003',
  title: 'Keep line breaks in the comment preview',
  author: 'jonas.f',
  area: 'ui',
  description:
    'Shows line breaks in the comment preview the same way the posted comment shows them.',
  language: 'ts',
  diff: `
@@ client/src/components/CommentPreview.tsx @@
 import { useMemo } from 'preact/hooks';
-import { escapeHtml } from '../lib/html';

 interface Props {
   text: string;
 }

 export function CommentPreview({ text }: Props) {
-  const safe = useMemo(() => escapeHtml(text), [text]);
+  const html = useMemo(() => text.replace(/\\n/g, '<br>'), [text]);
   return (
-    <div dangerouslySetInnerHTML={{ __html: safe }} />
+    <div dangerouslySetInnerHTML={{ __html: html }} />
   );
 }
`,
  featureValue: 500_000,
  bug: {
    type: 'security',
    severity: 'major',
    lines: [10],
    explanation:
      'The preview used to escape the comment text before putting it into innerHTML. Now only newlines are replaced, so raw HTML and script in a comment run in the browser of everyone who views the thread.',
    incident: '🔓 Comment preview stops escaping HTML, so comments run script. −$3M',
  },
};
