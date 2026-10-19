import type { PullRequest } from '../../shared/types';

export const pr: PullRequest = {
  id: 'ui-005',
  title: 'Show a busy state on the pay button',
  author: 'kofi.n',
  area: 'ui',
  description: 'Tracks whether a charge is in flight so the pay button can show progress.',
  language: 'ts',
  diff: `
@@ client/src/components/PayButton.tsx @@
 import { useState } from 'preact/hooks';
 import { charge } from '../api/payments';

 export function PayButton({ orderId, amount }: Props) {
   const [busy, setBusy] = useState(false);

   async function pay() {
+    setBusy(true);
     const res = await charge(orderId, amount);
+    setBusy(false);
     if (!res.ok) showError(res.error);
   }

   return (
-    <button disabled={busy} onClick={pay}>Pay {amount}</button>
+    <button onClick={pay}>Pay {amount}</button>
   );
 }
`,
  featureValue: 1_100_000,
  bug: {
    type: 'money',
    severity: 'critical',
    lines: [16],
    explanation:
      'The button is no longer disabled while the charge is in flight. On a slow connection the customer taps again, and each tap sends another charge for the same order. Customers can be charged two or three times.',
    incident: '💸 Pay button stays enabled during charge. Double charges on slow networks. −$5M',
  },
};
