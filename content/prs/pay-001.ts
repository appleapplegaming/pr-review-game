import type { PullRequest } from '../../shared/types';

export const pr: PullRequest = {
  id: 'pay-001',
  title: 'Cap refunds at the amount still charged',
  author: 'nadia.h',
  area: 'payments',
  description: 'Stops a refund request from going above what the customer paid.',
  language: 'ts',
  diff: `
@@ payments/refunds.ts @@
 import type { Charge } from '../db/charges';
 import { RefundError } from './errors';

 export function refundable(
   charge: Charge,
   requested: number,
 ): number {
   if (!Number.isInteger(requested) ||
     requested <= 0) {
     throw new RefundError('invalid amount');
   }
-  return requested;
+  // Never refund more than the customer still has charged.
+  // Earlier refunds are subtracted from the charge to get the cap.
+  const netCharged = charge.amountCents -
+    charge.refundedCents;
+  return Math.min(requested, netCharged);
 }
`,
  featureValue: 600_000,
  bug: null,
};
