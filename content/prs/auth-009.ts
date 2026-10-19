import type { PullRequest } from '../../shared/types';

export const pr: PullRequest = {
  id: 'auth-009',
  title: 'Validate access tokens with the identity provider',
  author: 'sven.b',
  area: 'auth',
  description: 'Checks each bearer token against the identity provider before serving a request.',
  language: 'python',
  diff: `
@@ app/auth/introspect.py @@
 import requests

 IDP_URL = "https://idp.example.com/oauth/introspect"


+def introspect(token):
+    # Runs on every API request, in the request worker.
+    resp = requests.post(
+        IDP_URL,
+        data={"token": token},
+        auth=(CLIENT_ID, CLIENT_SECRET),
+    )
+    resp.raise_for_status()
+    return resp.json()["active"]
+
+
+def require_login(request):
+    token = request.headers.get("Authorization", "")[7:]
+    if not introspect(token):
+        raise PermissionError("invalid token")
`,
  featureValue: 800_000,
  bug: {
    type: 'outage',
    severity: 'critical',
    lines: [8],
    explanation:
      'The requests.post call to the identity provider has no timeout, and requests waits forever by default. When the provider hangs, every API request blocks its worker inside introspect, the worker pool fills up, and the whole API stops answering until someone restarts it.',
    incident:
      '🔥 Token check shipped without a timeout. Identity provider hung and froze every API worker. 24h down',
  },
};
