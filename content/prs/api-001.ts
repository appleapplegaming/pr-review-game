import type { PullRequest } from '../../shared/types';

export const pr: PullRequest = {
  id: 'api-001',
  title: 'Cursor-based pagination for the orders list',
  author: 'sam.k',
  area: 'api',
  description: 'Lets the orders list page through results with an opaque cursor.',
  language: 'ts',
  diff: `
@@ api/pagination.ts @@
+import { HttpError } from '../http/errors';
+
+type CursorKey = { createdAt: string; id: string };
+
+export function encodeCursor(key: CursorKey): string {
+  return Buffer.from(JSON.stringify(key)).toString('base64url');
+}
+
+export function decodeCursor(cursor: string): CursorKey {
+  let parsed: unknown;
+  try {
+    const json = Buffer.from(cursor, 'base64url').toString();
+    parsed = JSON.parse(json);
+  } catch {
+    throw new HttpError(400, 'invalid cursor');
+  }
+  if (!isCursorKey(parsed)) {
+    throw new HttpError(400, 'invalid cursor');
+  }
+  return parsed;
+}
+
+function isCursorKey(v: unknown): v is CursorKey {
+  const k = v as Partial<CursorKey> | null;
+  return typeof k?.createdAt === 'string'
+    && typeof k?.id === 'string';
+}
@@ api/orders.ts @@
   const limit = Math.min(Number(req.query.limit) || 25, 100);
+  const cursor = req.query.cursor;
+  const after = cursor ? decodeCursor(cursor) : null;
   const rows = await db.query(
-    'select * from orders ' +
-      'order by created_at desc, id desc limit $1',
+    'select * from orders ' +
+      'where ($2::timestamptz is null ' +
+      'or (created_at, id) < ($2, $3)) ' +
+      'order by created_at desc, id desc limit $1',
+    [limit, after?.createdAt ?? null, after?.id ?? null],
   );
`,
  featureValue: 1_000_000,
  bug: null,
};
