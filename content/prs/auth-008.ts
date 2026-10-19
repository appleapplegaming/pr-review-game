import type { PullRequest } from '../../shared/types';

export const pr: PullRequest = {
  id: 'auth-008',
  title: 'Start billing when a free trial ends',
  author: 'omar.d',
  area: 'auth',
  description: 'Adds a nightly job that charges subscribers once their 14-day trial is over.',
  language: 'python',
  diff: `
@@ app/accounts/trials.py @@
 from datetime import timedelta

 TRIAL_DAYS = 14


 def start_trial(sub, today):
     sub.trial_ends = today + timedelta(days=TRIAL_DAYS)


+def needs_first_charge(sub, today):
+    # Billing starts on the day the trial ends.
+    if sub.status != "active":
+        return False
+    return today > sub.trial_ends
+
+
+def run_billing(db, gateway, today):
+    for sub in db.active_subscriptions():
+        if needs_first_charge(sub, today):
+            gateway.charge(sub.customer_id, sub.plan_cents)
+            sub.status = "paying"
+            db.save(sub)
`,
  featureValue: 600_000,
  bug: {
    type: 'money',
    severity: 'minor',
    lines: [14],
    explanation:
      'The comment says billing starts on the day the trial ends, but the check uses a strict > instead of >=. On trial_ends itself the function returns False, so every subscriber gets one extra free day before their first charge, and that day of revenue is lost across all trials.',
    incident:
      '💸 Trial billing shipped one day late. Every new subscriber got a free extra day. −$0.5M',
  },
};
