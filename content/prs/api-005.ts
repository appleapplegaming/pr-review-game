import type { PullRequest } from '../../shared/types';

export const pr: PullRequest = {
  id: 'api-005',
  title: 'Verify inbound webhook signatures',
  author: 'ruth.c',
  area: 'api',
  description: 'Rejects inbound webhook calls whose X-Signature does not match the body.',
  language: 'ts',
  diff: `
@@ api/webhooks/verify.ts @@
+import { createHmac, timingSafeEqual } from 'node:crypto';
+import { HttpError } from '../http/errors';
+
+/** Checks X-Signature: hex HMAC-SHA256 of the raw request body. */
+export function verifySignature(
+  rawBody: Buffer,
+  header: string | undefined,
+  secret: string,
+): void {
+  if (!header) throw new HttpError(401, 'missing signature');
+  const mac = createHmac('sha256', secret);
+  const expected = mac.update(rawBody).digest();
+  const given = Buffer.from(header, 'hex');
+  // timingSafeEqual throws on a length mismatch, so check first.
+  if (given.length !== expected.length) {
+    throw new HttpError(401, 'bad signature');
+  }
+  if (!timingSafeEqual(given, expected)) {
+    throw new HttpError(401, 'bad signature');
+  }
+}
@@ api/webhooks/inbound.ts @@
 export async function inbound(req: Request, res: Response) {
+  verifySignature(
+    req.rawBody,
+    req.headers['x-signature'],
+    config.webhooks.secret,
+  );
   const event = JSON.parse(req.rawBody.toString('utf8'));
   await events.enqueue(event);
   res.status(202).end();
 }
`,
  featureValue: 900_000,
  bug: null,
};
