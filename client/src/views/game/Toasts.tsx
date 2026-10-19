// Toast stack for every event. Mount it once, outside the screen switch in app.tsx, so it shows on
// every tab and on the postmortem screen. Needs no props.
//
// Each queued event is shown for config.toastMs, then leaves the screen. Events are dismissed from
// the store as they are taken in, so the queue stays short. The activity feed keeps its own copy.

import { useEffect, useState } from 'preact/hooks';
import { config } from '../../../../shared/config';
import type { GameEvent } from '../../../../shared/types';
import { store } from '../../net/store';
import { useStore } from '../../net/use-store';
import { addToasts, liveToasts, type Toast } from './toast-queue';
import { useNow } from './use-now';
import styles from './Toasts.module.css';

const ICON: Record<GameEvent['kind'], string> = {
  incident: '🚨',
  ping: '🙋',
  merge: '✅',
  decline: '🚫',
  catch: '🎯',
};

export function Toasts() {
  const events = useStore((s) => s.events);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const now = useNow(toasts.length > 0, 250);

  useEffect(() => {
    if (events.length === 0) return;
    setToasts((prev) => addToasts(prev, events, Date.now(), config.toastMs));
    for (const queued of events) store.dispatch({ type: 'dismissEvent', id: queued.id });
  }, [events]);

  useEffect(() => {
    setToasts((prev) => {
      const next = liveToasts(prev, now);
      return next.length === prev.length ? prev : next;
    });
  }, [now]);

  const visible = liveToasts(toasts, now);

  return (
    <ul className={styles.stack} aria-live="polite">
      {visible.map((toast) => (
        <li key={toast.id} className={`${styles.toast} ${styles[toast.kind]}`}>
          <span className={styles.icon} aria-hidden="true">
            {ICON[toast.kind]}
          </span>
          <span className={styles.text}>{toast.text}</span>
        </li>
      ))}
    </ul>
  );
}
