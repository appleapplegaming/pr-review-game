import type { PullRequest } from '../../shared/types';

export const pr: PullRequest = {
  id: 'auth-003',
  title: 'Simplify password reset token lookup',
  author: 'tomas.v',
  area: 'auth',
  description: 'Replaces the valid-token query with a plain lookup in the reset handler.',
  language: 'ts',
  diff: `
@@ auth/passwordReset.ts @@
 import { tokens } from '../db/tokens';
 import { accounts } from '../db/accounts';
 import { sessions } from './sessions';
 import { hashPassword, hashToken } from './password';
 import { HttpError } from '../http/errors';

 export async function resetPassword(req: Request) {
   const { token, password } = req.body;
   if (password.length < 12) {
     throw new HttpError(400, 'password too short');
   }
-  const record = await tokens.findValid(hashToken(token));
+  const record = await tokens.find(hashToken(token));
   if (!record) {
     throw new HttpError(400, 'invalid or expired token');
   }
   await accounts.setPasswordHash(
     record.accountId,
     await hashPassword(password),
   );
   await tokens.markUsed(record.id);
   await sessions.revokeAll(record.accountId);
   return { ok: true };
 }
`,
  featureValue: 1_200_000,
  bug: {
    type: 'security',
    severity: 'critical',
    lines: [13],
    explanation:
      'The lookup changed from findValid to find, so tokens that were already used or have expired are accepted again. markUsed still runs, but nothing checks it. Anyone who sees an old reset email can set a new password and take over the account.',
    incident:
      '🔓 Reset links reusable after first use shipped. Old emails take over accounts. −$8M',
  },
};
