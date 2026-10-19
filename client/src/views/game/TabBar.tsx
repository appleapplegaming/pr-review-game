// The phone tab bar: Queue, PR and Dashboard. Fixed to the bottom of the screen below 900 px and
// hidden from 900 px up (see tab-bar.module.css). The Queue badge counts open PRs; the PR tab shows
// a dot while a ping is waiting to be seen.

import { queueBadge, type PhoneTab } from './tab-rules';
import styles from './tab-bar.module.css';

export interface TabBarProps {
  active: PhoneTab;
  openCount: number;
  pingDot: boolean;
  onSelect(tab: PhoneTab): void;
}

const TABS: ReadonlyArray<{ id: PhoneTab; icon: string; label: string }> = [
  { id: 'queue', icon: '📥', label: 'Queue' },
  { id: 'pr', icon: '📄', label: 'PR' },
  { id: 'dashboard', icon: '📊', label: 'Dashboard' },
];

export function TabBar({ active, openCount, pingDot, onSelect }: TabBarProps) {
  const badge = queueBadge(openCount);
  return (
    <nav className={styles.bar} aria-label="Game sections" data-slot="tab-bar">
      <ul className={styles.list}>
        {TABS.map((tab) => {
          const current = tab.id === active;
          return (
            <li key={tab.id} className={styles.item}>
              <button
                type="button"
                className={current ? styles.tabActive : styles.tab}
                aria-current={current ? 'page' : undefined}
                onClick={() => onSelect(tab.id)}
              >
                <span className={styles.icon} aria-hidden="true">
                  {tab.icon}
                </span>
                <span className={styles.label}>{tab.label}</span>
                {tab.id === 'queue' && badge !== null && (
                  <span className={styles.badge}>
                    <span aria-hidden="true">{badge}</span>
                    <span className={styles.sr}>, {openCount} open PRs</span>
                  </span>
                )}
                {tab.id === 'pr' && pingDot && (
                  <span className={styles.dot}>
                    <span className={styles.sr}>, someone asked for a second opinion</span>
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
