import { useStore } from './net/use-store';
import type { ConnState } from './net/store';
import styles from './app.module.css';

const LABELS: Record<ConnState, string> = {
  connecting: 'Connecting…',
  open: 'Connected',
  reconnecting: 'Reconnecting…',
  closed: 'Disconnected',
};

/** Placeholder shell. Task 15 replaces the body with the landing and lobby screens. */
export function App() {
  const conn = useStore((s) => s.conn);
  return (
    <main className={styles.shell}>
      <h1 className={styles.title}>Ship It</h1>
      <p className={styles.status} role="status">
        {LABELS[conn]}
      </p>
    </main>
  );
}
