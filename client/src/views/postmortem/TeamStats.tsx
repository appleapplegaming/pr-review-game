// Team stats: one card per player, so each number has a label and nothing needs a wide table.

import type { PlayerStats } from '../../../../shared/types';
import styles from './postmortem.module.css';

export function TeamStats({ stats }: { stats: PlayerStats[] }) {
  return (
    <section className={styles.section} aria-labelledby="stats-title">
      <h2 id="stats-title" className={styles.sectionTitle}>
        📊 Team stats
      </h2>
      {stats.length === 0 ? (
        <p className={styles.empty}>No players to show.</p>
      ) : (
        <ul className={styles.cards}>
          {stats.map((p) => (
            <li key={p.playerId} className={styles.card}>
              <h3 className={styles.cardTitle}>{p.name}</h3>
              <dl className={styles.statGrid}>
                <Stat label="Merged" value={p.merged} />
                <Stat label="Declined" value={p.declined} />
                <Stat label="Comments" value={p.comments} />
                <Stat label="Catches" value={p.catches} />
                <Stat label="Misses" value={p.misses} />
              </dl>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className={styles.stat}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
