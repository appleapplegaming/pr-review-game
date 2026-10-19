import type { PullRequest } from '../../shared/types';

export const pr: PullRequest = {
  id: 'pay-003',
  title: 'Log card details on failed webhooks',
  author: 'sam.o',
  area: 'payments',
  description: 'Adds the card identifier to the webhook log so failed charges are easier to trace.',
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
+    card: data.card.last4,
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
      'The webhook log now writes the last four digits of the card. The log is plain text on disk and keeps every line. Card digits have no place in it, and any copy of the log now carries card data outside the payment boundary.',
    incident: '🔓 Card digits written to plain-text webhook log. −$1M',
  },
};
