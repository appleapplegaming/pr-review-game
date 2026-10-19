import type { PullRequest } from '../../shared/types';

export const pr: PullRequest = {
  id: 'data-008',
  title: 'Backfill normalized customer columns',
  author: 'priya.v',
  area: 'data',
  description: 'Fills the new lowercase columns for existing customer rows in one transaction.',
  language: 'python',
  diff: `
@@ app/jobs/backfill.py @@
 from contextlib import closing

 import psycopg2

 ALLOWED_COLUMNS = {"email", "phone", "name"}


 def backfill_norm(dsn, column):
+    if column not in ALLOWED_COLUMNS:
+        raise ValueError(f"unsupported column: {column}")
+    sql = (
+        f"UPDATE customers SET {column}_norm = "
+        f"lower(trim({column})) "
+        f"WHERE {column}_norm IS NULL AND {column} IS NOT NULL"
+    )
+    with closing(psycopg2.connect(dsn)) as conn:
+        # "with conn" commits on success and rolls back on error.
+        with conn, conn.cursor() as cur:
+            cur.execute("SET LOCAL lock_timeout = '5s'")
+            cur.execute(sql)
+            return cur.rowcount
`,
  featureValue: 500_000,
  bug: null,
};
