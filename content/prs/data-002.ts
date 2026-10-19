import type { PullRequest } from '../../shared/types';

export const pr: PullRequest = {
  id: 'data-002',
  title: 'Use half-open range in usage report',
  author: 'kofi.a',
  area: 'data',
  description: 'Switches the usage report to a half-open date range to match the warehouse.',
  language: 'ts',
  diff: `
@@ data/usage/report.ts @@
 import type { Db } from '../client';

 // end is the last billing day of the period, inclusive.
 export async function billableUsage(db: Db, start: Date, end: Date) {
   const rows = await db.query(
     'SELECT account_id, SUM(units) AS units FROM usage_events ' +
-      'WHERE occurred_at >= $1 AND occurred_at <= $2 ' +
+      'WHERE occurred_at >= $1 AND occurred_at < $2 ' +
       'GROUP BY account_id',
     [start, end],
   );
   return rows.map((r) => ({ id: r.account_id, units: r.units }));
 }
`,
  featureValue: 500_000,
  bug: {
    type: 'money',
    severity: 'minor',
    lines: [8],
    explanation:
      'The end date is the last billing day and is inclusive, but the filter is now strictly less than end. A date passed as midnight of the last day drops every usage event from that day, so the report bills the last day as zero.',
    incident: '💸 Usage report drops the last billing day. −$0.5M',
  },
};
