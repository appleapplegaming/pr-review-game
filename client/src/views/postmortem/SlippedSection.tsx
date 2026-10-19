// "What slipped through": every merged bug, most damage first. Each entry shows the diff with the
// bug lines highlighted, the explanation, the incident text, who merged it, and the thread.

import { formatMoney } from '../../../../shared/money';
import type { SlippedEntry } from '../../../../shared/types';
import { DECLINE_LABEL, downtimeLabel, highlightedLines, mergedByLabel } from './postmortem-rules';
import { PostmortemDiff } from './PostmortemDiff';
import { Thread } from './Thread';
import styles from './postmortem.module.css';

export function SlippedSection({ entries }: { entries: SlippedEntry[] }) {
  return (
    <section className={styles.section} aria-labelledby="slipped-title">
      <h2 id="slipped-title" className={styles.sectionTitle}>
        🚨 What slipped through
      </h2>
      {entries.length === 0 ? (
        <p className={styles.empty}>No bugs got through this quarter. Nice work.</p>
      ) : (
        <ol className={styles.cards}>
          {entries.map((entry) => {
            const downtime = downtimeLabel(entry.downtimeMinutes);
            return (
              <li key={entry.pr.id} className={styles.card}>
                <h3 className={styles.cardTitle}>{entry.pr.title}</h3>
                <p className={styles.muted}>
                  {entry.pr.author} · {entry.pr.area} · {DECLINE_LABEL[entry.bug.type]} ·{' '}
                  {entry.bug.severity}
                </p>
                <p className={styles.loss}>
                  Lost {formatMoney(entry.damage)}
                  {downtime !== '' && <span className={styles.muted}> · {downtime}</span>}
                </p>
                <p className={styles.merger}>{mergedByLabel(entry)}</p>
                <PostmortemDiff diff={entry.pr.diff} bugLines={highlightedLines(entry.bug)} />
                <h4 className={styles.threadTitle}>What the bug does</h4>
                <p>{entry.bug.explanation}</p>
                <h4 className={styles.threadTitle}>Incident</h4>
                <p className={styles.incident}>{entry.bug.incident}</p>
                <Thread comments={entry.comments} pings={entry.pings} />
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
