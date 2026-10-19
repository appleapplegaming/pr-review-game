import type { PullRequest } from '../../shared/types';

export const pr: PullRequest = {
  id: 'data-006',
  title: 'Sortable invoice list and mark-paid transaction',
  author: 'tomas.h',
  area: 'data',
  description: 'Lets the invoice list be sorted by column and adds a safe mark-paid update.',
  language: 'java',
  diff: `
@@ src/main/java/com/shipit/billing/InvoiceRepo.java @@
 public class InvoiceRepo {
   private static final Map<String, String> SORTABLE = Map.of(
       "created", "created_at", "total", "total_cents");
+  public List<Invoice> list(long tenantId, String sort)
+      throws SQLException {
+    String col = SORTABLE.getOrDefault(sort, "created_at");
+    String sql = "SELECT id, total_cents FROM invoices"
+        + " WHERE tenant_id = ? ORDER BY " + col;
+    try (Connection c = ds.getConnection();
+         PreparedStatement ps = c.prepareStatement(sql)) {
+      ps.setLong(1, tenantId);
+      try (ResultSet rs = ps.executeQuery()) {
+        List<Invoice> out = new ArrayList<>();
+        while (rs.next()) {
+          out.add(new Invoice(rs.getLong(1), rs.getLong(2)));
+        }
+        return out;
+      }
+    }
+  }
+  public void markPaid(long id) throws SQLException {
+    try (Connection c = ds.getConnection()) {
+      c.setAutoCommit(false);
+      try (PreparedStatement ps = c.prepareStatement(
+          "UPDATE invoices SET status = 'PAID' WHERE id = ?")) {
+        ps.setLong(1, id);
+        ps.executeUpdate();
+        c.commit();
+      } catch (SQLException e) {
+        c.rollback();
+        throw e;
+      }
+    }
+  }
 }
`,
  featureValue: 500_000,
  bug: null,
};
