// The company dashboard: value, uptime, breaches and time left. Reads the store itself and needs
// no props. Renders nothing until the first room snapshot arrives.

import { formatMoney, formatUptime } from '../../../../shared/money';
import { serverTime, store } from '../../net/store';
import { useStore } from '../../net/use-store';
import { formatClock, timeLeftMs } from './quarter-time';
import { useNow } from './use-now';
import styles from './Dashboard.module.css';

export function Dashboard() {
  const room = useStore((s) => s.room);
  const playing = room?.phase === 'playing';
  // Time left is server time, so the countdown ticks while the quarter runs and stops with it.
  useNow(playing, 1000);
  if (room === null) return null;

  const { metrics } = room;
  const left = room.endsAt === null ? '—' : formatClock(timeLeftMs(room.endsAt, serverTime(store)));

  return (
    <section className={styles.panel} aria-labelledby="dashboard-title">
      <h2 id="dashboard-title" className={styles.title}>
        Dashboard
      </h2>
      <dl className={styles.stats}>
        <div className={styles.stat}>
          <dt>Company value</dt>
          <dd className={styles.value}>{formatMoney(metrics.value)}</dd>
        </div>
        <div className={styles.stat}>
          <dt>Uptime</dt>
          <dd>{formatUptime(metrics.uptime)}</dd>
        </div>
        <div className={styles.stat}>
          <dt>Breaches</dt>
          <dd>{metrics.breaches}</dd>
        </div>
        <div className={styles.stat}>
          <dt>Time left</dt>
          <dd>{left}</dd>
        </div>
      </dl>
      {room.bankrupt && (
        <p className={styles.bankrupt}>Bankrupt: the company has run out of money.</p>
      )}
    </section>
  );
}
