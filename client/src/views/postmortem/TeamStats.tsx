// Team stats: one card per player, so each number has a label and nothing needs a wide table.

import type { PlayerStats } from '../../../../shared/types';
import { Emoji } from './Emoji';
import styles from './postmortem.module.css';

const CATCHES_HINT = 'Buggy PRs this player declined with the right type.';
const MISSES_HINT = 'Buggy PRs this player merged, which then slipped through.';

export function TeamStats({ stats }: { stats: PlayerStats[] }) {
  return (
    <section className={styles.section} aria-labelledby="stats-title">
      <h2 id="stats-title" className={styles.sectionTitle}>
        <Emoji>📊</Emoji>Team stats
      </h2>
      <p className={styles.definition}>
        Catches: {CATCHES_HINT} Misses: {MISSES_HINT}
      </p>
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
                <Stat label="Catches" value={p.catches} hint={CATCHES_HINT} />
                <Stat label="Misses" value={p.misses} hint={MISSES_HINT} />
              </dl>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className={styles.stat} title={hint}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
