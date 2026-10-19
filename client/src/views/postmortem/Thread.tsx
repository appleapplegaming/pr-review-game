// Comments and pings on one PR, in the order they happened. Text is rendered as text, never HTML.

import type { Comment, Ping } from '../../../../shared/types';
import { lineLabel, pingText, threadItems } from './postmortem-rules';
import styles from './postmortem.module.css';

export function Thread({ comments, pings }: { comments: Comment[]; pings: Ping[] }) {
  const items = threadItems(comments, pings);
  if (items.length === 0) {
    return <p className={styles.muted}>No comments or pings on this PR.</p>;
  }
  return (
    <section aria-label="Comments and pings">
      <h4 className={styles.threadTitle}>Thread</h4>
      <ul className={styles.thread}>
        {items.map((item) =>
          item.kind === 'comment' ? (
            <li key={`c-${item.comment.id}`} className={styles.threadItem}>
              <p className={styles.threadMeta}>
                <strong>{item.comment.playerName}</strong> · {lineLabel(item.comment.line)}
              </p>
              <p className={styles.threadText}>{item.comment.text}</p>
            </li>
          ) : (
            <li key={`p-${item.at}-${item.ping.playerId}`} className={styles.threadItem}>
              <p className={styles.threadMeta}>🙋 {pingText(item.ping)}</p>
            </li>
          ),
        )}
      </ul>
    </section>
  );
}
