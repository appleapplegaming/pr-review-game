import type { PullRequest } from '../../shared/types';

export const pr: PullRequest = {
  id: 'data-004',
  title: 'Sync orders to the warehouse nightly',
  author: 'ben.c',
  area: 'data',
  description: 'Pushes new orders to the warehouse in the nightly job and returns the count.',
  language: 'ts',
  diff: `
@@ data/jobs/nightly-sync.ts @@
 import type { Db } from '../client';
 import { sendToWarehouse } from '../warehouse/client';

-const BATCH_SIZE = 500;
 
 export async function syncOrders(db: Db): Promise<number> {
   let cursor = 0;
   let total = 0;
   for (;;) {
     const rows = await db.query(
-      'SELECT * FROM orders WHERE id > $1 ORDER BY id LIMIT $2',
-      [cursor, BATCH_SIZE],
+      'SELECT * FROM orders WHERE id > $1 ORDER BY id',
+      [cursor],
     );
     if (rows.length === 0) break;
     await sendToWarehouse(rows);
     cursor = rows[rows.length - 1].id;
     total += rows.length;
   }
   return total;
 }
`,
  featureValue: 400_000,
  bug: {
    type: 'outage',
    severity: 'minor',
    lines: [13, 14],
    explanation:
      'The LIMIT was removed from the batch query, so the first query reads every order past the cursor into memory at once. On a large table the nightly job runs out of memory and dies before anything syncs.',
    incident: '🔥 Nightly order sync loads every row at once. Job dies. 30 min down',
  },
};
