import type { PullRequest } from '../../shared/types';

export const pr: PullRequest = {
  id: 'api-004',
  title: 'Tune webhook delivery timeout',
  author: 'leo.m',
  area: 'api',
  description: 'Changes the webhook delivery timeout in shared config.',
  language: 'ts',
  diff: `
@@ shared/config.ts @@
 export const config = {
   webhooks: {
     maxAttempts: 5,
-    timeoutMs: 5_000,
+    timeoutMs: 0,
     retryBackoffMs: 2_000,
   },
   upstream: {
     timeoutMs: 8_000,
     maxSockets: 50,
   },
 };
@@ api/webhooks/sender.ts @@
 import { config } from '../../shared/config';
 import { http } from '../http/client';

 export async function deliver(hook: Hook, body: unknown) {
   const res = await http.post(hook.url, body, {
     timeout: config.webhooks.timeoutMs,
   });
   return res.status < 300;
 }
`,
  featureValue: 500_000,
  bug: {
    type: 'outage',
    severity: 'critical',
    lines: [5],
    explanation:
      'The webhook timeout went from 5 seconds to 0, which means no limit. A hung receiver holds its worker and socket forever. Calls pile up until the worker pool is full, and deliveries stop for a day.',
    incident: '🔥 Webhook timeout set to zero shipped. Hung calls pile up for a day. 24h down',
  },
};
