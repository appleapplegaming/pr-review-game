import type { PullRequest } from '../../shared/types';

export const pr: PullRequest = {
  id: 'pay-008',
  title: 'Round order totals once and dedupe charges by key',
  author: 'tomasz.r',
  area: 'payments',
  description:
    'Rounds the tax-inclusive total to the cent and makes charge creation safe to retry.',
  language: 'python',
  diff: `
@@ app/payments/charges.py @@
 from decimal import Decimal, ROUND_HALF_UP

 CENT = Decimal("0.01")


 def charge_total(subtotal, tax_rate):
-    return subtotal * (1 + tax_rate)
+    # Round once, on the final total, half-up to the cent.
+    total = subtotal * (Decimal("1") + tax_rate)
+    return total.quantize(CENT, rounding=ROUND_HALF_UP)


 def create_charge(db, gateway, order, key):
+    # A retried request with the same key returns the first charge.
+    existing = db.find_charge(key)
+    if existing is not None:
+        return existing
+    total = charge_total(order.subtotal, order.tax_rate)
+    cents = int(total * 100)
+    charge = gateway.charge(order.card, cents, idempotency_key=key)
+    db.save_charge(key, charge)
+    return charge
`,
  featureValue: 700_000,
  bug: null,
};
