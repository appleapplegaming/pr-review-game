import type { PullRequest } from '../../shared/types';

export const pr: PullRequest = {
  id: 'data-007',
  title: 'Two-tier overage pricing for API usage',
  author: 'lena.v',
  area: 'data',
  description: 'Bills usage above the included quota in two price tiers.',
  language: 'java',
  diff: `
@@ src/main/java/com/shipit/billing/OverageCalc.java @@
 public class OverageCalc {
   private static final long INCLUDED = 10_000;
   private static final long TIER1 = 50_000;
   private static final long RATE1 = 2;
   private static final long RATE2 = 1;
 
-  public long overageCents(long units) {
-    return Math.max(0, units - INCLUDED) * RATE1;
+  public long overageCents(long units) {
+    if (units <= INCLUDED) {
+      return 0;
+    }
+    long extra = units - INCLUDED;
+    long first = Math.min(extra, TIER1);
+    long cents = first * RATE1;
+    if (extra > TIER1) {
+      cents = (extra - TIER1) * RATE2;
+    }
+    return cents;
   }
 }
`,
  featureValue: 700_000,
  bug: {
    type: 'money',
    severity: 'critical',
    lines: [17],
    explanation:
      'The second tier assigns to cents instead of adding to it. For any customer whose overage passes the first tier, the charge for the first tier is thrown away and only the cheaper second-tier units are billed, so the heaviest users are undercharged by the whole first tier.',
    incident: '💸 Two-tier overage pricing shipped. Heavy users billed for tier two only. −$5M',
  },
};
