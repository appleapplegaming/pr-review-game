// Three sections that list declined PRs: great catches, right call wrong reason, lost revenue.
// Each has its own friendly empty state so the heading never disappears.

import { formatMoney } from '../../../../shared/money';
import type { DecisionEntry } from '../../../../shared/types';
import { DECLINE_LABEL, declineText } from './postmortem-rules';
import { Thread } from './Thread';
import styles from './postmortem.module.css';

interface ListProps {
  id: string;
  title: string;
  empty: string;
  entries: DecisionEntry[];
  describe: (entry: DecisionEntry) => string;
}

function DecisionList({ id, title, empty, entries, describe }: ListProps) {
  return (
    <section className={styles.section} aria-labelledby={id}>
      <h2 id={id} className={styles.sectionTitle}>
        {title}
      </h2>
      {entries.length === 0 ? (
        <p className={styles.empty}>{empty}</p>
      ) : (
        <ul className={styles.cards}>
          {entries.map((entry) => (
            <li key={entry.pr.id} className={styles.card}>
              <h3 className={styles.cardTitle}>{entry.pr.title}</h3>
              <p className={styles.merger}>{describe(entry)}</p>
              <Thread comments={entry.comments} pings={entry.pings} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function CatchesSection({ entries }: { entries: DecisionEntry[] }) {
  return (
    <DecisionList
      id="catches-title"
      title="🕵️ Great catches"
      empty="No great catches this quarter. Decline a buggy PR with the right type to log one."
      entries={entries}
      describe={(e) => `Caught by ${e.byName}. ${declineText(e.bugType)}`}
    />
  );
}

export function WrongReasonSection({ entries }: { entries: DecisionEntry[] }) {
  return (
    <DecisionList
      id="wrong-title"
      title="🤷 Right call, wrong reason"
      empty="Every decline used the right type."
      entries={entries}
      describe={(e) =>
        `Declined by ${e.byName} as ${e.bugType === null ? 'no type' : DECLINE_LABEL[e.bugType]}. The bug was ${e.pr.bug === null ? 'none' : DECLINE_LABEL[e.pr.bug.type]}.`
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
    <section className={styles.section} aria-labelledby="lost-title">
      <h2 id="lost-title" className={styles.sectionTitle}>
        💤 Lost revenue
      </h2>
      {entries.length === 0 ? (
        <p className={styles.empty}>No clean PRs were declined. Every good change shipped.</p>
      ) : (
        <>
          <p className={styles.loss}>Feature value declined: {formatMoney(total)}</p>
          <ul className={styles.cards}>
            {entries.map((entry) => (
              <li key={entry.pr.id} className={styles.card}>
                <h3 className={styles.cardTitle}>{entry.pr.title}</h3>
                <p className={styles.merger}>
                  Declined by {entry.byName} · worth {formatMoney(entry.pr.featureValue)}
                </p>
                <Thread comments={entry.comments} pings={entry.pings} />
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
