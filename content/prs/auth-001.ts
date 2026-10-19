import type { PullRequest } from '../../shared/types';

export const pr: PullRequest = {
  id: 'auth-001',
  title: 'Let support staff read any account',
  author: 'marco.r',
  area: 'auth',
  description: 'Lets the support tool read account details for a customer ticket.',
  language: 'ts',
  diff: `
@@ auth/account.ts @@
 import { accounts } from '../db/accounts';
 import { HttpError } from '../http/errors';
 
 export async function getAccount(req: Request, session: Session) {
   const id = req.params.id;
-  if (session.userId !== id) {
+  if (session.userId !== id && !req.query.admin) {
     throw new HttpError(403, 'forbidden');
   }
   const account = await accounts.findById(id);
   return toPublicAccount(account);
 }
`,
  featureValue: 1_200_000,
  bug: {
    type: 'security',
    severity: 'major',
    lines: [7],
    explanation:
      'The ownership check now passes whenever the request has an admin query parameter. Any logged-in user can add ?admin=1 and read any other account.',
    incident: '🔓 Admin override on account reads shipped. Any user can read any account. −$3M',
  },
};
