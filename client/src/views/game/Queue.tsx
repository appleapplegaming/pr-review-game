// The queue: one card per open PR, soonest expiry first. Each card is a button, so the queue is
// reachable by keyboard. Selection and presence live in GameScreen; this only shows and reports.

import type { PublicPlayer, PublicPr } from '../../../../shared/types';
import { CountdownRing } from '../../components/countdown-ring';
import { commentLabel, countdown, viewerNames } from './queue-rules';
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
  // The status region is always mounted, so screen readers catch the empty message when it appears.
  return (
    <>
      <div role="status" className={styles.empty}>
        {prs.length === 0 ? 'No PRs are waiting for review right now.' : null}
      </div>
      {prs.length > 0 && (
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
                  <span className={styles.timer}>
                    <CountdownRing
                      fraction={timer.fraction}
                      label={timer.label}
                      urgent={timer.urgent}
                    />
                  </span>
                  <span className={styles.title}>{pr.title}</span>
                  <span className={styles.area}>{pr.area}</span>
                  <span className={styles.signals}>
                    <span>{commentLabel(pr.comments.length)}</span>
                    {pr.highlighted && (
                      <span className={styles.highlight}>
                        Second opinion<span className="sr-only"> requested</span>
                      </span>
                    )}
                    {others.length > 0 && (
                      <span className={styles.viewers}>
                        <span aria-hidden="true">👀</span>
                        <span className={styles.sr}>Viewed by </span> {others.join(', ')}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
