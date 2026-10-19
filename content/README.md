# Content authoring guide

The pool has **46 PRs** (30 TypeScript, 8 Java, 8 Python) across six areas (`payments`, `auth`, `infra`, `ui`, `data`, `api`). Each PR is one file: `content/prs/<id>.ts`, exporting `pr`. The pool is exported from `content/prs/index.ts`. `validatePr()` in `content/validate.ts` checks every rule below.

```ts
import type { PullRequest } from '../../shared/types';

export const pr: PullRequest = {
  id: 'pay-004',                 // unique, <area-prefix>-<nnn>
  title: 'Apply promo codes at checkout',
  author: 'dana.k',              // fictional handle
  area: 'payments',
  description: 'One sentence on what the PR does.',
  language: 'ts',                // 'ts' | 'java' | 'python'
  diff: `
@@ checkout/total.ts @@
 context line
-removed line
+added line
`,
  featureValue: 800_000,         // integer dollars, 200_000 to 2_000_000
  bug: {                         // or `bug: null` for a clean PR
    type: 'money',               // 'money' | 'security' | 'outage'
    severity: 'major',           // 'minor' | 'major' | 'critical'
    lines: [6],                  // 1-based rendered-line indices, each a `+` line
    explanation: 'One paragraph: what is wrong and why it hurts.',
    incident: '💸 Promo stacking shipped. Customers checking out for $0. −$2M',
  },
};
```

The spec's `pay-004` example is illustrative only. Its diff has 8 rendered lines, under the 10-line minimum, so do not copy its size.

## Content rules

- **Diff size:** 10–40 rendered lines. Do not count `@@` headers.
- **Bug lines:** `bug.lines` are 1-based indices into the rendered diff lines, excluding `@@` headers. Each one must point at a `+` line and be in range.
- **Findable:** A careful reviewer finds the bug in about 60 s on a phone. Nothing depends on knowledge outside the diff: no library internals, no company policy, no external facts.
- **Line length:** no line over about 70 characters.
- **Value:** `featureValue` is an integer in dollars from 200_000 to 2_000_000. Bigger features get bigger diffs (roughly 10–15 lines at the low end, 30–40 at the high end).
- **Language:** `'ts'`, `'java'` or `'python'`. The PR file is always a `.ts` module; only the diff text is in the PR's language. Use plain, idiomatic code that any mid-level dev can read, and a matching `@@ path @@` header (`.java` / `.py`). Java gets wordy, so watch the 70-character limit.
- **Clean PRs:** `bug: null`. Some clean PRs should look suspicious (scary-looking but correct), so that declining everything is not a strategy.
- **Answer key:** bug lines and explanations never reach clients before the postmortem. Write them as if a player could read them.

## Severity and incident text

Severity sets the damage. Outage is downtime plus $40k per hour lost.

| Type | minor | major | critical |
|---|---|---|---|
| 🔥 Outage | 30 min down | 4 h down | 24 h down |
| 💸 Money | −$0.5M | −$2M | −$5M |
| 🔓 Security | −$1M, +1 breach | −$3M, +1 breach | −$8M, +1 breach |

Incident text:
- Starts with the type emoji: 💸 money, 🔓 security, 🔥 outage.
- Ends with the impact: a dollar amount such as `−$2M`, or downtime such as `4h down`.
- One sentence in between says what shipped. Plain text, no HTML.

## Assignment matrix

Target mix: 9 clean, 7 money, 7 security, 7 outage. Every area has at least 3 PRs.

Seeds are from Task 3 and already exist. The others are assigned to batches.

| id | area | batch | type | severity | idea / hint |
|---|---|---|---|---|---|
| pay-004 | payments | seed | money | major | Promo applied twice (seed, do not reuse) |
| auth-001 | auth | seed | security | major | Seed from Task 3 (do not reuse) |
| infra-001 | infra | seed | outage | major | Seed from Task 3 (do not reuse) |
| ui-001 | ui | seed | clean | none | Seed from Task 3 (do not reuse) |
| pay-001 | payments | A | clean | none | Refund cap `min(refund, charged)`, correct despite looking like a money bug |
| pay-002 | payments | A | money | critical | Tax rounded per line item, undercharging large carts |
| pay-003 | payments | A | security | minor | Card last-4 written to plain-text webhook log |
| pay-005 | payments | A | clean | none | Float money replaced with integer cents, correct but looks risky |
| data-001 | data | A | clean | none | SQL migration that drops and rebuilds a table inside a transaction (correct, scary-looking) |
| data-002 | data | A | money | minor | Usage report `<` on end date drops the last day's billable rows |
| data-003 | data | A | security | critical | Export filter interpolated into raw SQL |
| data-004 | data | A | outage | minor | Unbounded batch SELECT exhausts memory, nightly job dies |
| data-005 | data | A | security | major | Analytics query drops the `tenant_id` filter on one branch, leaking other tenants' rows |
| auth-002 | auth | B | clean | none | Sliding-window login rate limit per account (correct) |
| auth-003 | auth | B | security | critical | Password reset token never marked used, so the link works again |
| auth-004 | auth | B | outage | major | Login failure path leaks DB connections until the pool is empty |
| auth-005 | auth | B | money | minor | Renewal skips one charge for accounts with a flag set |
| api-001 | api | B | clean | none | Base64 pagination cursor (looks like tampering, is fine) |
| api-002 | api | B | security | minor | List endpoint returns an internal `email_verified_token` field |
| api-003 | api | B | money | major | Bulk discount applied to both unit price and line total |
| api-004 | api | B | outage | critical | Webhook/upstream timeout set to 0, so hung calls pile up for 24 h |
| api-005 | api | B | clean | none | HMAC check with `timingSafeEqual` plus length check (correct, looks hand-rolled) |
| infra-002 | infra | C | clean | none | Deploy script deletes old releases via glob, guarded to keep the last 3 (correct, scary-looking) |
| infra-003 | infra | C | outage | critical | Readiness probe drops the DB ping, so a dead DB stays in rotation |
| infra-004 | infra | C | outage | minor | Retry backoff multiplier inverted, retries hammer the queue |
| infra-005 | infra | C | money | major | Cost config typo drops the reserved-instance tier, overbilling a customer |
| ui-002 | ui | C | clean | none | Dark-mode preference saved to localStorage (correct) |
| ui-003 | ui | C | security | major | Comment preview renders raw user text via `innerHTML` |
| ui-004 | ui | C | outage | minor | `useEffect` missing a dependency, causing a fetch loop on the dashboard |
| ui-005 | ui | C | money | critical | Pay button not disabled in flight, so slow networks double-charge |

## Java and Python batches

Eight PRs per language, each with 2 clean, 2 money, 2 security and 2 outage. Ids continue each area's numbering (`pay-006` onward).

| language | clean | money | security | outage | ids |
|---|---|---|---|---|---|
| Java | 2 | 2 | 2 | 2 | pay-006, pay-007, auth-006, auth-007, data-006, data-007, api-006, infra-006 |
| Python | 2 | 2 | 2 | 2 | pay-008, pay-009, auth-008, auth-009, data-008, data-009, api-007, ui-006 |

The 9/7/7/7 mix below describes the 30 TypeScript PRs. The game still draws its quarter from the whole pool, so any language can show up in a quarter.

## Pool mix check (TypeScript PRs)

Counts from the matrix above, with the seeds included (TypeScript only):

| area | clean | money | security | outage | total |
|---|---|---|---|---|---|
| payments | 2 | 2 | 1 | 0 | 5 |
| auth | 1 | 1 | 2 | 1 | 5 |
| infra | 1 | 1 | 0 | 3 | 5 |
| ui | 2 | 1 | 1 | 1 | 5 |
| data | 1 | 1 | 2 | 1 | 5 |
| api | 2 | 1 | 1 | 1 | 5 |
| **total** | **9** | **7** | **7** | **7** | **30** |
| target | 9 | 7 | 7 | 7 | 30 |

**Status: matches the target.** Area minimums (at least 3 each) pass.

## Per-PR checklist

- [ ] `id` is unique and matches the matrix; `area` matches the matrix
- [ ] Bug type and severity match the matrix (clean PRs use `bug: null`)
- [ ] Diff is 10–40 rendered lines, excluding `@@` headers
- [ ] Every `bug.lines` entry is in range and points at a `+` line
- [ ] No line is over about 70 characters
- [ ] `featureValue` is an integer from 200_000 to 2_000_000, and the diff size fits the feature
- [ ] The bug is findable in about 60 s on a phone, using only the diff
- [ ] `explanation` is one paragraph; `incident` starts with the type emoji and ends with the impact
- [ ] Looks like real code in its language; `language` matches the diff; author handle is fictional
- [ ] For clean PRs marked suspicious: the scary-looking part is actually correct
- [ ] Imports `PullRequest` from `../../shared/types` and exports `pr`
- [ ] `validatePr()` passes; `npx vitest run tests/content` passes
