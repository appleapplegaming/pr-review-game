import type { PullRequest } from '../../shared/types';

export const pr: PullRequest = {
  id: 'data-009',
  title: 'Nightly export of events to CSV',
  author: 'tomasz.b',
  area: 'data',
  description: 'Adds a nightly job that writes the events table to a CSV file for the warehouse.',
  language: 'python',
  diff: `
@@ app/jobs/export_events.py @@
 import csv

 from app.db import get_conn

 COLUMNS = ["id", "user_id", "kind", "payload", "created_at"]


 def export_events(out_path):
+    with get_conn() as conn:
+        cur = conn.cursor()
+        cur.execute(f"SELECT {', '.join(COLUMNS)} FROM events")
+        rows = cur.fetchall()
+
+    with open(out_path, "w", newline="") as f:
+        writer = csv.writer(f)
+        writer.writerow(COLUMNS)
+        writer.writerows(rows)
+    return len(rows)
`,
  featureValue: 400_000,
  bug: {
    type: 'outage',
    severity: 'minor',
    lines: [11, 12],
    explanation:
      'The job selects every row of the events table and fetchall() loads them all into memory before writing anything. The table grows every day, so the nightly job eventually runs out of memory and gets killed, taking the warehouse feed with it. It should stream rows with a server-side cursor or fetch in batches and write as it goes.',
    incident:
      '🔥 Nightly events export loaded the whole table into RAM. Job killed by OOM. 30 min down',
  },
};
