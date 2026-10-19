import type { PullRequest } from '../../shared/types';

export const pr: PullRequest = {
  id: 'api-007',
  title: 'Add tiered bulk discounts to quotes',
  author: 'rohan.s',
  area: 'api',
  description: 'Gives larger orders a percentage off the line total based on quantity tiers.',
  language: 'python',
  diff: `
@@ app/api/pricing.py @@
 # (min_qty, percent off). The single best matching tier applies.
 BULK_TIERS = [(10, 10), (50, 15), (100, 20)]


 def bulk_percent(qty):
     pct = 0
     for min_qty, tier_pct in BULK_TIERS:
+        if qty >= min_qty:
+            pct += tier_pct
     return pct


 def line_total_cents(unit_cents, qty):
     subtotal = unit_cents * qty
+    discount = subtotal * bulk_percent(qty) // 100
+    return subtotal - discount
`,
  featureValue: 700_000,
  bug: {
    type: 'money',
    severity: 'major',
    lines: [9],
    explanation:
      'The comment says only the single best tier applies, but the loop adds the percentage of every tier the quantity reaches. An order of 100 units gets 10 + 15 + 20 = 45% off instead of 20%, and 50 units get 25% instead of 15%. Every large order is undercharged. It should keep the highest matching percentage rather than summing them.',
    incident: '💸 Bulk discount tiers stacked on large orders. Big customers got 45% off. −$2M',
  },
};
