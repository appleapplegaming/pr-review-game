import type { PullRequest } from '../../shared/types';

export const pr: PullRequest = {
  id: 'auth-002',
  title: 'Rate limit login attempts per account',
  author: 'ines.f',
  area: 'auth',
  description: 'Blocks further login attempts after too many failures in 15 minutes.',
  language: 'ts',
  diff: `
@@ auth/rateLimit.ts @@
+import { redis } from '../db/redis';
+import { HttpError } from '../http/errors';
+
+const WINDOW_MS = 15 * 60_000;
+const MAX_ATTEMPTS = 5;
+
+/** Sliding window: counts attempts in the last WINDOW_MS. */
+export async function checkLoginRate(accountKey: string) {
+  const key = 'login:' + accountKey;
+  const now = Date.now();
+  await redis.zremrangebyscore(key, 0, now - WINDOW_MS);
+  const attempts = await redis.zcard(key);
+  if (attempts >= MAX_ATTEMPTS) {
+    throw new HttpError(429, 'too many attempts, try again later');
+  }
+  await redis.zadd(key, now, now + '-' + Math.random());
+  await redis.pexpire(key, WINDOW_MS);
+}
@@ auth/login.ts @@
 import { verifyPassword } from './password';
+import { checkLoginRate } from './rateLimit';

 export async function login(req: Request) {
   const { email, password } = req.body;
   const account = await accounts.findByEmail(email);
+  await checkLoginRate(account?.id ?? email.toLowerCase());
   if (!account || !(await verifyPassword(account, password))) {
     throw new HttpError(401, 'invalid credentials');
   }
`,
  featureValue: 700_000,
  bug: null,
};
