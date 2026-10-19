# Engine rules to tests (Checkpoint B)

Each rule in SPEC.md → Game Rules, with the engine test that proves it. Paths are under `tests/engine/`. A test is named by its `describe` block and, where useful, its `it` title. `simulation.test.ts` also plays whole quarters on the real pool and checks the cross-rule invariants (money adds up, one incident per merged bug, no early leak).

## Quarter

| Rule | Test |
|---|---|
| PRs per quarter `clamp(8 + 4 × players, 12, 30)` | `setup.test.ts` → "createQuarter: PR count" (including "caps the draw at 30 PRs") |
| Draw is seeded and has no repeats | `setup.test.ts` → "gives the same draw for the same seed", "never draws the same PR twice" |
| About ⅓ clean, ⅔ buggy | `setup.test.ts` → "draws about a third clean across many seeds", "draws exactly a third clean for 12 PRs" |
| At least one of each bug type | `setup.test.ts` → "has at least one money, one security and one outage PR in every draw" |
| Spawns evenly over the first 8:30, ±20% jitter | `setup.test.ts` → "createQuarter: spawn schedule" |
| Per-PR timer is 90 s from spawn | `tick.test.ts` → "a scheduled PR spawns at its spawnAt, open, with its 90 s timer from that moment" |
| Open PR auto-merges at 90 s, nobody reviewed it | `tick.test.ts` → "auto-merges at exactly 90 s, recorded as nobody reviewed it", "a late tick still auto-merges at the PR expiry time" |
| A late click cannot beat the timer | `decisions.test.ts` → "the 90 s timer beats a late decision" |
| Joining mid-quarter drops straight into the game | `decisions.test.ts` → "joining mid-quarter" |
| Quarter ends at 10:00; open PRs auto-merge; pending incidents fire at once | `tick.test.ts` → "at time-up: open PRs auto-merge and pending incidents fire at once, in order", "time-up is measured against endsAt even if the tick arrives late" |
| Quarter ends early when every PR is resolved and none is left to spawn | `tick.test.ts` → "early: once every PR is resolved...", "early: does not end while a PR is still due to spawn" |
| Decisions are rejected after the quarter | `decisions.test.ts` → "guards" |

## Starting state

| Rule | Test |
|---|---|
| $10.0M, 100.000% uptime, 0 breaches | `setup.test.ts` → "starts the clock and sets the starting metrics"; `projection.test.ts` → "in the lobby, shows the starting company with no quarter" |

## Decisions

| Rule | Test |
|---|---|
| Clean + merge: `+featureValue` | `decisions.test.ts` → "clean merge adds the feature value..." |
| Clean + decline: no change, logged as lost revenue | `decisions.test.ts` → "clean decline changes no value..."; `postmortem.test.ts` → "lists declined clean PRs as lost revenue, with the total of their feature value" |
| Buggy + merge: `+featureValue` now, incident after 4-12 s | `decisions.test.ts` → "buggy merge adds the feature value now...", "buggy merge schedules one incident" |
| Buggy + decline, correct type: no incident, +$150k | `decisions.test.ts` → "buggy decline with the correct type pays the +$150k catch bonus..." |
| Buggy + decline, wrong type: no incident, no bonus | `decisions.test.ts` → "buggy decline with the wrong type is 'right call, wrong reason'..." |
| Unknown bug type is rejected | `decisions.test.ts` → "decline validation" |
| First decision wins, with "Already merged by Sara" | `decisions.test.ts` → "first decision wins" (merge/merge, merge/decline, decline/merge, no double bonus, auto-merge wording) |
| Opening only shows 👀 and never locks | `decisions.test.ts` → "open is presence only", "presence follows the player" |

## Incidents

| Rule | Test |
|---|---|
| All nine type × severity cells (downtime, value loss, breaches) | `incidents.test.ts` → "incident effects (the Incidents table)" (`it.each` over the nine cells) |
| Incident fires at its time, not before, in order | `tick.test.ts` → "incidents fire at their time" |
| Outage downtime at $40k per hour | `incidents.test.ts` (outage cells); `postmortem.test.ts` → "damageOf: value lost per bug" |
| `uptime = 1 − downtime / 129,600`, shown to 3 decimals (4 h gives 99.815%) | `tick.test.ts` → "uptime: 4 h of outage gives 99.815%" |
| Value floors at $0; reaching $0 is bankruptcy and ends the quarter | `incidents.test.ts` → "applying an incident to the metrics"; `tick.test.ts` → "bankruptcy: ...", "value never drops below 0 across several incidents" |
| Bankruptcy stops the timeline but owed incidents still fire | `tick.test.ts` → "bankruptcy stops the timeline...", "bankruptcy still fires incidents that were already owed..." |

## End-of-quarter badge

| Rule | Test |
|---|---|
| Each badge threshold and its boundary | `postmortem.test.ts` → "badgeFor: thresholds and exact boundaries", "badgeFor: the same boundaries reached from downtime minutes" |

## Comments and second opinion

| Rule | Test |
|---|---|
| Comment is 1-280 characters, trimmed, text only | `collab.test.ts` → "comments" (empty, whitespace, 280 / 281, code points) |
| Line comment must point at a real diff line, or be whole-PR (null) | `collab.test.ts` → "rejects a line past the end of the diff...", "accepts a comment on a diff line that exists" |
| Comments are readable and addable after resolve | `collab.test.ts` → "accepts a comment on a merged or declined PR..." |
| Comment count for the queue badge, live to everyone | `projection.test.ts` → "maps status, decider, viewers and comments", "comments and pings made through the real engine" |
| Ping emits an event and highlights the PR until it resolves | `collab.test.ts` → "records the ping, emits a ping event and highlights the PR", "clears the highlight when the PR resolves" |
| One ping per player per PR per 20 s (exactly 20 s allowed) | `collab.test.ts` → "second-opinion pings" (cooldown, per player, per PR) |
| Comments and pings never move the timer | `collab.test.ts` → "comments and pings never move the PR timer" |

## Postmortem

| Rule | Test |
|---|---|
| Sections in spec order | `postmortem.test.ts` → "postmortem: section order" |
| Headline: value, uptime, breaches, badge | `postmortem.test.ts` → "postmortem: headline" |
| Slipped: merged buggy PRs only, sorted by damage then severity | `postmortem.test.ts` → "postmortem: what slipped through", "compareSlipped: sort order" |
| Merger name, or "nobody reviewed it" for auto-merge | `postmortem.test.ts` → "names the merger, and marks an auto-merge as nobody reviewing it" |
| Comment thread and pings ("Sara flagged line 42, Tom merged it anyway") | `postmortem.test.ts` → "shows the comment thread and pings..." |
| Great catches, right call wrong reason, lost revenue | `postmortem.test.ts` → "great catches, right call wrong reason and lost revenue" |
| Team stats per player | `postmortem.test.ts` → "postmortem: team stats" |
| Bankruptcy flag and banner data | `postmortem.test.ts` → "flags bankruptcy and gives the this-is-fine badge at $0" |

## Answer-key boundary (SPEC → Content rules)

| Rule | Test |
|---|---|
| No bug data in the public state | `projection.test.ts` → "the answer key never reaches the public state" |
| Unspawned PRs are not in the public state | `projection.test.ts` → "a PR that has not spawned yet does not appear..." |
| No bug data in events or states from real play | `simulation.test.ts` → "never sends bug lines, explanations or incident text...", "sends incident text only in incident events..."; `projection.test.ts` → "comments and pings made through the real engine" |

## Judgment calls reviewed (Checkpoint B)

| Call | Verdict |
|---|---|
| Bankruptcy: open PRs are not auto-merged, owed incidents fire | Kept. Auto-merging would add value to a $0 company and undo the bankruptcy; skipping owed incidents would leave slipped PRs with no incident in the numbers. |
| Postmortem damage is the nominal incident value, not capped by the $0 floor | Kept. It is deterministic, matches the "sorted by damage" rule and does not depend on firing order. |
| "Misses" = slipped bugs a player merged by hand | Kept. Auto-merges have no player; a wrong-reason decline stopped the bug. |
| After bankruptcy, open PRs appear in no section | Kept. They were never decided; showing them as slipped would be false. |
| Badge uses raw uptime | Kept. Downtime comes in 30-minute steps, so no reachable value sits between the rounded and raw thresholds. |
| `open` on a resolved PR is a silent no-op | Kept. Harmless race with the tick. |
| Pings on resolved PRs are rejected | Kept. The highlight lasts "until it resolves". |
| `totalPrs` reveals the unspawned count | Kept. It is a number only and follows from the player count by the public formula. |
