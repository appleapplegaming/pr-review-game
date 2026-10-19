import type { PullRequest } from '../../shared/types';

export const pr: PullRequest = {
  id: 'pay-009',
  title: 'Verify signatures on payment webhooks',
  author: 'li.wen',
  area: 'payments',
  description: 'Rejects payment webhooks that are not signed with our shared secret.',
  language: 'python',
  diff: `
@@ app/payments/webhooks.py @@
 import hashlib
 import hmac
 import os

 from flask import abort, request

 SECRET = os.environ["WEBHOOK_SECRET"].encode()


 def verify(body, signature):
     digest = hmac.new(SECRET, body, hashlib.sha256)
-    return hmac.compare_digest(digest.hexdigest(), signature)
+    return digest.hexdigest() == signature


+@app.post("/webhooks/payments")
+def payment_webhook():
+    body = request.get_data()
+    sig = request.headers.get("X-Signature", "")
+    if not verify(body, sig):
+        abort(401)
+    mark_paid(request.get_json()["order_id"])
+    return "", 204
`,
  featureValue: 500_000,
  bug: {
    type: 'security',
    severity: 'major',
    lines: [13],
    explanation:
      'The signature check was changed from hmac.compare_digest to a plain == string comparison. The == operator returns as soon as a character differs, so response timing leaks how much of the signature is correct and an attacker can guess a valid signature one character at a time, then forge payment webhooks that mark unpaid orders as paid.',
    incident:
      '🔓 Webhook check used a plain string compare. Forged payment events marked orders paid. −$3M',
  },
};
