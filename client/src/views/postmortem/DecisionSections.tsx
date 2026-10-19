// Three sections that list declined PRs: great catches, right call wrong reason, missed value.
// Each has its own friendly empty state so the heading never disappears.

import type { ComponentChildren } from 'preact';
import { formatMoney } from '../../../../shared/money';
import type { Bug, DecisionEntry } from '../../../../shared/types';
import { Emoji } from './Emoji';
import { PostmortemDiff } from './PostmortemDiff';
import { Thread } from './Thread';
import {
  declineText,
  highlightedLines,
  whyDeclineRight,
  wrongReasonText,
} from './postmortem-rules';
import styles from './postmortem.module.css';

interface ListProps {
  id: string;
  emoji: string;
  title: string;
  definition: string;
  empty: string;
  entries: DecisionEntry[];
  describe: (entry: DecisionEntry) => string;
  /** Extra card content, shown between the summary line and the thread. */
  detail: (entry: DecisionEntry, bug: Bug | null) => ComponentChildren;
  /** Cards with a diff are one per row at every width, like the slipped cards. */
  wide?: boolean;
  /** A total line above the cards, only shown when there are cards. */
  summary?: string;
}

function DecisionList({
  id,
  emoji,
  title,
  definition,
  empty,
  entries,
  describe,
  detail,
  wide = false,
  summary,
}: ListProps) {
  return (
    <section className={styles.section} aria-labelledby={id}>
      <h2 id={id} className={styles.sectionTitle}>
        <Emoji>{emoji}</Emoji>
        {title}
      </h2>
      <p className={styles.definition}>{definition}</p>
      {entries.length === 0 ? (
        <p className={styles.empty}>{empty}</p>
      ) : (
        <>
          {summary !== undefined && <p className={styles.loss}>{summary}</p>}
          <ul className={wide ? `${styles.cards} ${styles.cardsSingle}` : styles.cards}>
            {entries.map((entry) => {
              const bug = entry.pr.bug;
              return (
                <li key={entry.pr.id} className={styles.card}>
                  <h3 className={styles.cardTitle}>{entry.pr.title}</h3>
                  <p className={styles.merger}>{describe(entry)}</p>
                  {detail(entry, bug)}
                  <Thread
                    comments={entry.comments}
                    pings={entry.pings}
                    bugLines={bug === null ? undefined : highlightedLines(bug)}
                    outcome="declined"
                  />
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

function BugDiff({ entry, bug }: { entry: DecisionEntry; bug: Bug }) {
  return <PostmortemDiff diff={entry.pr.diff} bugLines={highlightedLines(bug)} compact />;
}

export function CatchesSection({ entries }: { entries: DecisionEntry[] }) {
  return (
    <DecisionList
      id="catches-title"
      emoji="🕵️"
      title="Great catches"
      definition="Buggy PRs that were declined with the right bug type."
      empty="No great catches this quarter. Decline a buggy PR with the right type to log one."
      entries={entries}
      describe={(e) => `Caught by ${e.byName}. ${declineText(e.bugType)}`}
      wide
      detail={(entry, bug) =>
        bug === null ? null : (
          <>
            <p>{whyDeclineRight(bug, entry.byName)}</p>
            <h4 className={styles.threadTitle}>What the bug would have done</h4>
            <p>{bug.explanation}</p>
            <BugDiff entry={entry} bug={bug} />
          </>
        )
      }
    />
  );
}

export function WrongReasonSection({ entries }: { entries: DecisionEntry[] }) {
  return (
    <DecisionList
      id="wrong-title"
      emoji="🤷"
      title="Right call, wrong reason"
      definition="Buggy PRs that were declined, but with the wrong bug type or none."
      empty="Every decline used the right type."
      entries={entries}
      describe={wrongReasonText}
      wide
      detail={(entry, bug) =>
        bug === null ? null : (
          <>
            <h4 className={styles.threadTitle}>What the bug does</h4>
            <p>{bug.explanation}</p>
            <BugDiff entry={entry} bug={bug} />
          </>
        )
      }
    />
  );
}

export function LostRevenueSection({
  entries,
  total,
}: {
  entries: DecisionEntry[];
  total: number;
}) {
  return (
    <DecisionList
      id="lost-title"
      emoji="💤"
      title="Missed value"
      definition="Clean PRs that were declined. Their feature value never shipped."
      empty="No clean PRs were declined. Every good change shipped."
      entries={entries}
      describe={(e) => `Declined by ${e.byName} · worth ${formatMoney(e.pr.featureValue)}`}
      detail={() => null}
      summary={`Value never shipped: ${formatMoney(total)}`}
    />
  );
}
