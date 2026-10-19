import type { PullRequest } from '../../shared/types';

export const pr: PullRequest = {
  id: 'auth-007',
  title: 'Look up users by session id in the database',
  author: 'ravi.m',
  area: 'auth',
  description: 'Loads the session user straight from the database instead of the cache.',
  language: 'java',
  diff: `
@@ src/main/java/com/shipit/auth/SessionDao.java @@
 public class SessionDao {
   private final DataSource pool;

   public User findUser(String sessionId) throws SQLException {
+    Connection c = pool.getConnection();
+    PreparedStatement ps = c.prepareStatement(
+      "SELECT * FROM users u JOIN sessions s "
+      + "ON s.user_id = u.id WHERE s.id = ?");
+    ps.setString(1, sessionId);
+    ResultSet rs = ps.executeQuery();
+    if (!rs.next()) {
+      return null;
+    }
+    User user = User.from(rs);
+    rs.close();
+    ps.close();
+    c.close();
+    return user;
   }
 }
`,
  featureValue: 300_000,
  bug: {
    type: 'outage',
    severity: 'minor',
    lines: [5, 11, 12],
    explanation:
      'The connection is only closed on the happy path. When the session id is unknown, the method returns null early and never closes the connection, and an exception from the query also skips the close calls. Expired or invalid sessions are common, so the pool drains and every login and request starts timing out. Use try-with-resources.',
    incident: '🔥 Session lookup leak shipped. Connection pool ran dry. 30 min down',
  },
};
