// The activity feed: every event this quarter, newest first. Reads the activity log, so it can
// unmount and remount (phone tabs) without losing history. Needs no props.

import { useSyncExternalStore } from 'preact/compat';
import { useStore } from '../../net/use-store';
import { activityLog } from './activity-log';
import { formatClock } from './quarter-time';
import styles from './ActivityFeed.module.css';

export function ActivityFeed() {
  const startedAt = useStore((s) => s.room?.startedAt ?? null);
  const entries = useSyncExternalStore(activityLog.subscribe, activityLog.getEntries);
  const newestFirst = [...entries].reverse();

  return (
    <section className={styles.panel} aria-labelledby="feed-title">
      <h2 id="feed-title" className={styles.title}>
        Activity
      </h2>
      {newestFirst.length === 0 ? (
        <p className={styles.empty}>
          Nothing has happened yet. Merges, pings and incidents show up here.
        </p>
      ) : (
        <ol className={styles.list}>
          {newestFirst.map((entry) => (
            <li key={entry.id} className={styles.item}>
              {startedAt !== null && (
                <time className={styles.time}>{formatClock(entry.at - startedAt)}</time>
              )}
              <span>{entry.text}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
