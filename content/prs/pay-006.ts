import type { PullRequest } from '../../shared/types';

export const pr: PullRequest = {
  id: 'pay-006',
  title: 'Compute invoice tax with BigDecimal',
  author: 'tomasz.r',
  area: 'payments',
  description: 'Replaces double-based tax math with BigDecimal and basis-point rates.',
  language: 'java',
  diff: `
@@ src/main/java/com/shipit/billing/TaxCalculator.java @@
 import java.math.BigDecimal;
 import java.math.RoundingMode;

 public class TaxCalculator {
   private static final BigDecimal BPS_PER_UNIT =
     new BigDecimal("10000");

   public BigDecimal withTax(BigDecimal net, int rateBps) {
-    return net.multiply(BigDecimal.valueOf(1.2));
+    if (net.compareTo(BigDecimal.ZERO) < 0) {
+      throw new IllegalArgumentException("negative net");
+    }
+    // 10000 only has factors 2 and 5, so this divide is exact.
+    BigDecimal rate = BigDecimal.valueOf(rateBps)
+      .divide(BPS_PER_UNIT);
+    BigDecimal tax = net.multiply(rate)
+      .setScale(2, RoundingMode.HALF_UP);
+    return net.add(tax);
   }
 }
`,
  featureValue: 500_000,
  bug: null,
};
