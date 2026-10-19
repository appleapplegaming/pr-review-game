import type { PullRequest } from '../../shared/types';

export const pr: PullRequest = {
  id: 'data-005',
  title: 'Add a top products report to analytics',
  author: 'omar.s',
  area: 'data',
  description: 'Shows the ten best-selling products, optionally for one region.',
  language: 'ts',
  diff: `
@@ data/analytics/top-products.ts @@
 import type { Db } from '../client';
 import type { AnalyticsQuery } from './types';

 export async function topProducts(db: Db, q: AnalyticsQuery) {
   const base = 'SELECT product_id, SUM(qty) AS sold FROM sales';
   if (q.region) {
     return db.query(
       base + ' WHERE tenant_id = $1 AND region = $2' +
         ' GROUP BY product_id ORDER BY sold DESC LIMIT 10',
       [q.tenantId, q.region],
     );
   }
   return db.query(
-    base + ' WHERE tenant_id = $1 GROUP BY product_id' +
+    base + ' GROUP BY product_id' +
     ' ORDER BY sold DESC LIMIT 10',
-    [q.tenantId],
+    [],
   );
 }
`,
  featureValue: 1_000_000,
  bug: {
    type: 'security',
    severity: 'major',
    lines: [15, 18],
    explanation:
      'The no-region branch no longer filters on tenant_id, and it passes no parameters. Any account that does not pick a region gets the top products across every tenant, so other tenants sales are visible.',
    incident: '🔓 Top products query drops the tenant filter. Rows from other tenants leak. −$3M',
  },
};
