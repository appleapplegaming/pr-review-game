// Comments and pings on one PR, in the order they happened, each with its quarter time (mm:ss).
// Text is rendered as text, never HTML. Comments on a bug line are tagged, and a ping says whether
// the PR was merged or declined afterwards.

import type { Comment, Ping } from '../../../../shared/types';
import { useStore } from '../../net/use-store';
import { formatClock } from '../game/quarter-time';
import { Emoji } from './Emoji';
import {
  flaggedBugLine,
  lineLabel,
  pingOutcomeText,
  pingText,
  threadItems,
  type Outcome,
} from './postmortem-rules';
import styles from './postmortem.module.css';

interface Props {
  comments: Comment[];
  pings: Ping[];
  /** How the PR ended, so a ping can say what followed it. */
  outcome: Outcome;
  /** Diff line numbers that hold the bug, or empty for a clean PR. */
  bugLines?: ReadonlySet<number>;
}

const NO_LINES: ReadonlySet<number> = new Set();

export function Thread({ comments, pings, outcome, bugLines = NO_LINES }: Props) {
  const startedAt = useStore((s) => s.room?.startedAt ?? null);
  const items = threadItems(comments, pings);
  if (items.length === 0) {
    return <p className={styles.muted}>No comments or pings on this PR.</p>;
  }
  const time = (at: number) =>
    startedAt === null ? null : (
      <time className={styles.threadTime}>{formatClock(at - startedAt)}</time>
    );
  return (
    <section aria-label="Comments and pings">
      <h4 className={styles.threadTitle}>Thread</h4>
      <ul className={styles.thread}>
        {items.map((item) =>
          item.kind === 'comment' ? (
            <li key={`c-${item.comment.id}`} className={styles.threadItem}>
              <p className={styles.threadMeta}>
                {time(item.at)} <strong>{item.comment.playerName}</strong> ·{' '}
                {lineLabel(item.comment.line)}
                {flaggedBugLine(item.comment, bugLines) && (
                  <span className={styles.flag}> · flagged the bug line</span>
                )}
              </p>
              <p className={styles.threadText}>{item.comment.text}</p>
            </li>
          ) : (
            <li key={`p-${item.at}-${item.ping.playerId}`} className={styles.threadItem}>
              <p className={styles.threadMeta}>
                {time(item.at)} <Emoji>🙋</Emoji>
                {pingText(item.ping)}. {pingOutcomeText(outcome)}
              </p>
            </li>
          ),
        )}
      </ul>
    </section>
  );
}
