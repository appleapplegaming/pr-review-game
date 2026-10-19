import type { PullRequest } from '../../shared/types';

export const pr: PullRequest = {
  id: 'ui-006',
  title: 'Return users to the page they came from after login',
  author: 'elena.m',
  area: 'ui',
  description: 'Reads a next parameter on the login form so users land back where they started.',
  language: 'python',
  diff: `
@@ app/web/login.py @@
 from flask import redirect, render_template, request, session


 @app.post("/login")
 def login():
     user = check_credentials(request.form)
     if user is None:
         return render_template("login.html", error=True), 401
     session["user_id"] = user.id
-    return redirect("/dashboard")
+    next_url = request.args.get("next") or "/dashboard"
+    return redirect(next_url)
`,
  featureValue: 300_000,
  bug: {
    type: 'security',
    severity: 'minor',
    lines: [11, 12],
    explanation:
      'The next parameter comes straight from the query string and is passed to redirect() with no check. An attacker can send a victim a real login link with next set to an external site, and after signing in the user lands on a look-alike page that can steal credentials. The target should be limited to relative paths on this site.',
    incident:
      '🔓 Login redirect followed any next URL. Users sent to phishing pages after sign-in. −$1M',
  },
};
