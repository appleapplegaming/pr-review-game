import type { PullRequest } from '../../shared/types';

export const pr: PullRequest = {
  id: 'auth-005',
  title: 'Handle grandfathered accounts at renewal',
  author: 'owen.d',
  area: 'auth',
  description: 'Renews grandfathered accounts on their legacy plan and price.',
  language: 'ts',
  diff: `
@@ auth/renewals.ts @@
 import { accounts } from '../db/accounts';
 import { billing } from '../billing/client';
 import { planPrice } from '../billing/plans';

 export async function renewDue(today: Date) {
   const due = await accounts.dueOn(today);
   for (const account of due) {
+    if (account.grandfathered) {
+      await accounts.bumpRenewal(account.id, today);
+      continue;
+    }
     const price = planPrice(account.plan);
     await billing.charge(account.id, price);
     await accounts.bumpRenewal(account.id, today);
   }
 }
`,
  featureValue: 300_000,
  bug: {
    type: 'money',
    severity: 'minor',
    lines: [8, 10],
    explanation:
      'Grandfathered accounts hit the continue before billing.charge, so this renewal is never charged. The bump still moves their renewal date forward, so the missed period is never billed. Every grandfathered account loses one charge.',
    incident:
      '💸 Grandfathered renewals skipped billing shipped. Missed charges never recovered. −$0.5M',
  },
};
