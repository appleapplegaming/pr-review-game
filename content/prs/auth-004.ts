import type { PullRequest } from '../../shared/types';

export const pr: PullRequest = {
  id: 'auth-004',
  title: 'Audit failed logins with the DB client',
  author: 'mei.l',
  area: 'auth',
  description: 'Writes failed login attempts to the audit table in the same connection.',
  language: 'ts',
  diff: `
@@ auth/login.ts @@
 import { accounts } from '../db/accounts';
 import { pool } from '../db/pool';
 import { HttpError } from '../http/errors';
 import { audit } from './audit';
 import { verifyPassword } from './password';

 export async function login(req: Request) {
   const { email, password } = req.body;
+  const client = await pool.connect();
   const account = await accounts.findByEmail(email, client);
   if (!account || !(await verifyPassword(account, password))) {
-    await audit.loginFailed(email);
+    await audit.loginFailed(email, client);
     throw new HttpError(401, 'invalid credentials');
   }
+  client.release();
   return issueSession(account);
 }
`,
  featureValue: 500_000,
  bug: {
    type: 'outage',
    severity: 'major',
    lines: [9, 16],
    explanation:
      'The client is released only on the success path. Each failed login throws before client.release() runs, so the connection never returns to the pool. Bad passwords, including password guessing, drain the pool until no login can get a connection.',
    incident: '🔥 Failed logins leak DB connections shipped. Logins hang for everyone. 4h down',
  },
};
