import type { PullRequest } from '../../shared/types';

export const pr: PullRequest = {
  id: 'infra-004',
  title: 'Add exponential backoff to job retries',
  author: 'olu.a',
  area: 'infra',
  description: 'Spaces out retries of failed queue jobs so one bad job stops spamming the queue.',
  language: 'ts',
  diff: `
@@ infra/queue/retry.ts @@
 export interface RetryPolicy {
   baseMs: number;
   maxMs: number;
   multiplier: number;
 }

 export const defaultRetry: RetryPolicy = {
   baseMs: 500,
   maxMs: 60_000,
   multiplier: 2,
 };

 /** Delay before retry number attempt (0-based), capped at maxMs. */
 export function nextDelay(policy: RetryPolicy, attempt: number) {
-  const raw = policy.baseMs * policy.multiplier ** attempt;
+  const raw = policy.baseMs / policy.multiplier ** attempt;
   return Math.min(raw, policy.maxMs);
 }
`,
  featureValue: 350_000,
  bug: {
    type: 'outage',
    severity: 'minor',
    lines: [16],
    explanation:
      'The delay is divided by the multiplier instead of multiplied. Retry 0 waits 500 ms, retry 1 waits 250 ms, retry 2 waits 125 ms. The delays shrink, so failed jobs hit the queue faster and faster.',
    incident:
      '🔥 Retry backoff divides instead of multiplies. Retries hammer the queue. 30 min down',
  },
};
