import type { PullRequest } from '../../shared/types';

export const pr: PullRequest = {
  id: 'pay-003',
  title: 'Log card details on failed webhooks',
  author: 'sam.o',
  area: 'payments',
  description: 'Adds the card number to the webhook log so failed charges are easier to trace.',
  language: 'ts',
  diff: `
@@ payments/webhooks/log.ts @@
 import { appendFile } from 'node:fs/promises';
 import { EOL } from 'node:os';
 import type { ChargeEvent } from './types';

 const LOG_PATH = '/var/log/payments/webhooks.log';

 export async function recordWebhook(event: ChargeEvent) {
   const { id, type, data } = event;
-  const entry = { id, type, customer: data.customerId };
+  const entry = {
+    id,
+    type,
+    customer: data.customerId,
+    card: data.card.number,
+  };
   await appendFile(LOG_PATH, JSON.stringify(entry) + EOL);
 }
`,
  featureValue: 400_000,
  bug: {
    type: 'security',
    severity: 'minor',
    lines: [14],
    explanation:
      'The webhook log now writes the full card number. The log is plain text on disk and keeps every line, so any copy of the log carries card numbers outside the payment boundary.',
    incident: '🔓 Full card numbers written to plain-text webhook log. −$1M',
  },
};
