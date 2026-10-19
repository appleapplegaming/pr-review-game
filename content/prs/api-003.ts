import type { PullRequest } from '../../shared/types';

export const pr: PullRequest = {
  id: 'api-003',
  title: 'Bulk discount for orders of 10 or more',
  author: 'jun.p',
  area: 'api',
  description: 'Gives 10% off each unit when a line has 10 or more units.',
  language: 'ts',
  diff: `
@@ api/orders/pricing.ts @@
 import type { OrderLine } from './types';

 export const BULK_QTY = 10;
 export const BULK_OFF = 0.1;

 export function lineTotal(line: OrderLine): number {
-  return line.unitPrice * line.qty;
+  const unit = bulkUnitPrice(line);
+  const off = line.qty >= BULK_QTY ? 1 - BULK_OFF : 1;
+  return unit * line.qty * off;
 }

+function bulkUnitPrice(line: OrderLine): number {
+  if (line.qty < BULK_QTY) return line.unitPrice;
+  return line.unitPrice * (1 - BULK_OFF);
+}
`,
  featureValue: 700_000,
  bug: {
    type: 'money',
    severity: 'major',
    lines: [10, 15],
    explanation:
      'Bulk lines get the 10% off twice. bulkUnitPrice already lowers the unit price, and the return multiplies by 0.9 again. A 10-unit line at $100 should total $900 but is charged $810. Every bulk order is undercharged by 10%.',
    incident: '💸 Bulk discount applied twice shipped. Bulk orders undercharged 10%. −$2M',
  },
};
