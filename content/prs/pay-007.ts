import type { PullRequest } from '../../shared/types';

export const pr: PullRequest = {
  id: 'pay-007',
  title: 'Settle invoices from gateway payment amounts',
  author: 'lena.v',
  area: 'payments',
  description:
    'Marks an invoice paid when the gateway reports the full amount, else collects the balance.',
  language: 'java',
  diff: `
@@ src/main/java/com/shipit/billing/InvoiceSettler.java @@
 import java.math.BigDecimal;

 public class InvoiceSettler {
   private final Gateway gateway;
   private final InvoiceRepo repo;

   public void settle(Invoice inv, BigDecimal paid) {
     BigDecimal due = inv.getTotal()
       .subtract(inv.getCredit());
-    if (paid.compareTo(due) >= 0) {
+    if (paid.equals(due)) {
       repo.markPaid(inv.getId());
       return;
     }
+    // Not fully paid: collect the amount due from the card.
+    gateway.charge(inv.getCustomerId(), due);
+    repo.markPaid(inv.getId());
   }
 }
`,
  featureValue: 700_000,
  bug: {
    type: 'money',
    severity: 'major',
    lines: [11],
    explanation:
      'BigDecimal.equals compares scale as well as value, so 10.0 and 10.00 are not equal. Invoices that were already paid in full often fail the check, fall through to gateway.charge, and the customer is charged a second time. The check should be compareTo(due) >= 0 as before.',
    incident: '💸 Settlement scale bug shipped. Paid invoices charged twice. −$2M',
  },
};
