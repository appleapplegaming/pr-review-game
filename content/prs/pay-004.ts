import type { PullRequest } from '../../shared/types';

export const pr: PullRequest = {
  id: 'pay-004',
  title: 'Apply promo codes at checkout',
  author: 'dana.k',
  area: 'payments',
  description: 'Lets customers stack a promo code on top of the member discount.',
  language: 'ts',
  diff: `
@@ checkout/total.ts @@
 export function total(cart: Cart, promo?: Promo): number {
   let sum = cart.items.reduce((s, i) => s + i.price * i.qty, 0);
   sum -= memberDiscount(cart);
+  if (promo) {
+    sum -= sum * promo.percent;
+  }
+  if (promo) {
+    sum -= sum * promo.percent;
+  }
   return Math.round(sum * 100) / 100;
 }
`,
  featureValue: 800_000,
  bug: {
    type: 'money',
    severity: 'major',
    lines: [7, 8],
    explanation:
      'The promo block is copied, so the code is applied twice. A 50% code takes 75% off instead of 50%, and the order can end up almost free.',
    incident: '💸 Promo stacking bug shipped. Customers checking out for $0. −$2M',
  },
};
