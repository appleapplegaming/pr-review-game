import type { PullRequest } from '../../shared/types';

export const pr: PullRequest = {
  id: 'api-002',
  title: 'Simplify the user serializer',
  author: 'nadia.h',
  area: 'api',
  description: 'Shortens toPublicUser so new user fields do not need a mapping line.',
  language: 'ts',
  diff: `
@@ api/users/row.ts @@
 export interface UserRow {
   id: string;
   name: string;
   email: string;
   email_verified_token: string | null;
   created_at: string;
 }
@@ api/users/serialize.ts @@
 import type { UserRow } from './row';

-export function toPublicUser(row: UserRow) {
-  return {
-    id: row.id,
-    name: row.name,
-    email: row.email,
-    createdAt: row.created_at,
-  };
-}
+export function toPublicUser(row: UserRow) {
+  return { ...row, createdAt: row.created_at };
+}
`,
  featureValue: 400_000,
  bug: {
    type: 'security',
    severity: 'minor',
    lines: [19],
    explanation:
      'The serializer used to copy four named fields. The spread now copies the whole row, so email_verified_token goes out with every user in the list response. That token confirms an email address, so any caller of the list endpoint can verify addresses they do not own.',
    incident: '🔓 User list leaked email verification tokens shipped. −$1M',
  },
};
