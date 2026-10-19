import type { PullRequest } from '../../shared/types';

export const pr: PullRequest = {
  id: 'pay-002',
  title: 'Compute checkout tax per line item',
  author: 'tomas.v',
  area: 'payments',
  description: 'Calculates tax on each cart line so receipts show tax per item.',
  language: 'ts',
  diff: `
@@ checkout/tax.ts @@
 import type { CartLine } from './types';

 export const TAX_RATE = 0.0825;

 export function subtotalCents(lines: CartLine[]): number {
   return lines.reduce((s, l) => s + l.priceCents * l.qty, 0);
 }

 export function taxCents(lines: CartLine[]): number {
-  const subtotal = subtotalCents(lines);
-  return Math.round(subtotal * TAX_RATE);
+  return lines.reduce((sum, line) => {
+    const lineTax = line.priceCents * line.qty * TAX_RATE;
+    return sum + Math.floor(lineTax);
+  }, 0);
 }

 export function totalCents(lines: CartLine[]): number {
   return subtotalCents(lines) + taxCents(lines);
 }
`,
  featureValue: 700_000,
  bug: {
    type: 'money',
    severity: 'critical',
    lines: [14],
    explanation:
      'Tax is now floored on every cart line, so the fraction of a cent is dropped on each line. Large carts with many lines lose cents on every one, and the total tax comes out below the rate. The old code rounded the cart total once.',
    incident: '💸 Per-line tax rounding shipped. Large carts undercharged. −$5M',
  },
};
