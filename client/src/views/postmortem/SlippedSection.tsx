// "What slipped through": every merged bug, most damage first. Each entry shows the diff with the
// bug lines highlighted, the explanation, the incident text, who merged it, and the thread.

import { formatMoney } from '../../../../shared/money';
import type { SlippedEntry } from '../../../../shared/types';
import { Emoji } from './Emoji';
import {
  DECLINE_EMOJI,
  DECLINE_LABEL,
  downtimeLabel,
  highlightedLines,
  mergedByLabel,
} from './postmortem-rules';
import { PostmortemDiff } from './PostmortemDiff';
import { Thread } from './Thread';
import styles from './postmortem.module.css';

export function SlippedSection({ entries }: { entries: SlippedEntry[] }) {
  return (
    <section className={styles.section} aria-labelledby="slipped-title">
      <h2 id="slipped-title" className={styles.sectionTitle}>
        <Emoji>🚨</Emoji>What slipped through
      </h2>
      <p className={styles.definition}>
        Buggy PRs that were merged, biggest damage first. Damage is the value lost, with outage
        downtime counted at $40k per hour.
      </p>
      {entries.length === 0 ? (
        <p className={styles.empty}>No bugs got through this quarter. Nice work.</p>
      ) : (
        <ol className={`${styles.cards} ${styles.cardsSingle}`}>
          {entries.map((entry) => {
            const downtime = downtimeLabel(entry.downtimeMinutes);
            const bugLines = highlightedLines(entry.bug);
            return (
              <li key={entry.pr.id} className={styles.card}>
                <h3 className={styles.cardTitle}>{entry.pr.title}</h3>
                <p className={styles.muted}>
                  {entry.pr.author} · {entry.pr.area} ·{' '}
                  <Emoji>{DECLINE_EMOJI[entry.bug.type]}</Emoji>
                  {DECLINE_LABEL[entry.bug.type]} · {entry.bug.severity}
                </p>
                <p className={styles.loss}>
                  Damage: {formatMoney(entry.damage)}
                  {downtime !== '' && <span className={styles.muted}> · {downtime}</span>}
                </p>
                <p className={styles.merger}>{mergedByLabel(entry)}</p>
                <PostmortemDiff diff={entry.pr.diff} bugLines={bugLines} />
                <h4 className={styles.threadTitle}>What the bug does</h4>
                <p>{entry.bug.explanation}</p>
                <h4 className={styles.threadTitle}>Incident</h4>
                <p className={styles.incident}>{entry.bug.incident}</p>
                <Thread
                  comments={entry.comments}
                  pings={entry.pings}
                  bugLines={bugLines}
                  outcome="merged"
                  resolvedAt={entry.resolvedAt}
                />
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
