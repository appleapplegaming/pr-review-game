import type { PullRequest } from '../../shared/types';

export const pr: PullRequest = {
  id: 'ui-001',
  title: 'Debounce the search box in the order list',
  author: 'lee.w',
  area: 'ui',
  description: 'Waits for the user to pause typing before filtering the order list.',
  language: 'ts',
  diff: `
@@ client/src/components/OrderSearch.tsx @@
 import { useEffect, useRef, useState } from 'preact/hooks';
 
 export function OrderSearch({ onSearch }: Props) {
   const [q, setQ] = useState('');
+  const timer = useRef<number | undefined>(undefined);
+
+  useEffect(() => {
+    clearTimeout(timer.current);
+    timer.current = window.setTimeout(() => onSearch(q), 250);
+    return () => clearTimeout(timer.current);
+  }, [q]);
+
   return (
     <input value={q} onInput={(e) => setQ(e.currentTarget.value)} />
   );
 }
`,
  featureValue: 400_000,
  bug: null,
};
