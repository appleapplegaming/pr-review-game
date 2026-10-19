// The queue: one card per open PR, soonest expiry first. Each card is a button, so the queue is
// reachable by keyboard. Selection and presence live in GameScreen; this only shows and reports.

import type { PublicPlayer, PublicPr } from '../../../../shared/types';
import { CountdownRing } from '../../components/countdown-ring';
import { countdown, viewerNames } from './queue-rules';
import styles from './queue.module.css';

export interface QueueProps {
  prs: readonly PublicPr[];
  players: readonly PublicPlayer[];
  myId: string | null;
  now: number;
  selectedId: string | null;
  onSelect(prId: string): void;
}

export function Queue({ prs, players, myId, now, selectedId, onSelect }: QueueProps) {
  if (prs.length === 0) {
    return (
      <p role="status" className={styles.empty}>
        No PRs are waiting for review right now.
      </p>
    );
  }
  return (
    <ul className={styles.list} aria-label="Review queue">
      {prs.map((pr) => {
        const timer = countdown({ expiresAt: pr.expiresAt, spawnAt: pr.spawnAt, now });
        const others = viewerNames(pr.viewers, players, myId);
        const selected = pr.id === selectedId;
        return (
          <li key={pr.id}>
            <button
              type="button"
              className={selected ? styles.cardSelected : styles.card}
              aria-current={selected ? 'true' : undefined}
              onClick={() => onSelect(pr.id)}
            >
              <span className={styles.title}>{pr.title}</span>
              <span className={styles.area}>{pr.area}</span>
              <span className={styles.footer}>
                <CountdownRing
                  fraction={timer.fraction}
                  label={timer.label}
                  urgent={timer.urgent}
                />
                <span className={styles.signals}>
                  {others.length > 0 && (
                    <span className={styles.viewers}>
                      <span aria-hidden="true">👀</span>
                      <span className={styles.sr}>Viewed by </span> {others.join(', ')}
                    </span>
                  )}
                  <span>
                    <span aria-hidden="true">💬</span>
                    <span className={styles.sr}>Comments: </span>
                    {pr.comments.length}
                  </span>
                  {pr.highlighted && (
                    <span className={styles.highlight}>
                      <span aria-hidden="true">🙋</span>
                      <span className={styles.sr}>Second opinion requested</span>
                    </span>
                  )}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
