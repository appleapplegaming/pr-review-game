import type { PullRequest } from '../../shared/types';

export const pr: PullRequest = {
  id: 'data-001',
  title: 'Add tax code column to invoice lines',
  author: 'leah.m',
  area: 'data',
  description: 'Adds a tax code to each invoice line by rebuilding the table in one transaction.',
  language: 'ts',
  diff: `
@@ db/migrations/0042_invoice_lines_tax_code.ts @@
 import type { Db } from '../client';

 export async function up(db: Db): Promise<void> {
   await db.transaction(async (tx) => {
+    await tx.query(
+      'CREATE TABLE lines_new (LIKE invoice_lines INCLUDING ALL)',
+    );
+    await tx.query(
+      'ALTER TABLE lines_new ADD COLUMN tax_code text',
+    );
+    await tx.query(
+      'INSERT INTO lines_new SELECT *, NULL FROM invoice_lines',
+    );
+    await tx.query('DROP TABLE invoice_lines');
+    await tx.query(
+      'ALTER TABLE lines_new RENAME TO invoice_lines',
+    );
   });
 }
`,
  featureValue: 800_000,
  bug: null,
};
