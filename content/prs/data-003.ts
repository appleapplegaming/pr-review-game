import type { PullRequest } from '../../shared/types';

export const pr: PullRequest = {
  id: 'data-003',
  title: 'Filter tenant exports by order status',
  author: 'yuki.t',
  area: 'data',
  description: 'Lets a tenant download only the orders with one status.',
  language: 'ts',
  diff: `
@@ data/exports/query.ts @@
 import type { Db } from '../client';
 import type { ExportRequest } from './types';

 const BASE = 'SELECT id, status, total_cents FROM orders';

 export async function exportRows(db: Db, req: ExportRequest) {
   let sql = BASE + ' WHERE tenant_id = $1';
   const params: unknown[] = [req.tenantId];
   if (req.status) {
-    params.push(req.status);
-    sql += ' AND status = $' + params.length;
+    sql += " AND status = '" + req.status + "'";
   }
   sql += ' ORDER BY created_at';
   return db.query(sql, params);
 }
`,
  featureValue: 900_000,
  bug: {
    type: 'security',
    severity: 'critical',
    lines: [12],
    explanation:
      'The status filter is now pasted into the SQL text. A crafted status value can close the quote and add its own conditions, which reads or changes rows from other tenants. The old code passed the value as a bound parameter.',
    incident: '🔓 Export status filter built into raw SQL. Orders of all tenants exposed. −$8M',
  },
};
