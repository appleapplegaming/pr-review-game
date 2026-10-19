// Toast stack for every event. Mount it once, outside the screen switch in app.tsx, so it shows on
// every tab and on the postmortem screen. Needs no props.
//
// Each queued event is shown for config.toastMs (config.toastIncidentMs for incidents), then leaves
// the screen. At most config.toastMax show at once; the rest collapse into "+N more". Hovering or
// focusing the stack holds every timer, so a toast can be read without it leaving. Events are dismissed from
// the store as they are taken in, so the queue stays short. The activity feed keeps its own copy.

import { useEffect, useRef, useState } from 'preact/hooks';
import { config } from '../../../../shared/config';
import type { GameEvent } from '../../../../shared/types';
import { store } from '../../net/store';
import { useStore } from '../../net/use-store';
import { addToasts, holdToasts, liveToasts, visibleToasts, type Toast } from './toast-queue';
import { useNow } from './use-now';
import styles from './Toasts.module.css';

const ICON: Record<GameEvent['kind'], string> = {
  incident: '🚨',
  ping: '🙋',
  merge: '✅',
  decline: '🚫',
  catch: '🎯',
  comment: '💬',
};

export function Toasts() {
  const events = useStore((s) => s.events);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [held, setHeld] = useState(false);
  const now = useNow(toasts.length > 0, 250);
  const lastNow = useRef(now);

  useEffect(() => {
    if (events.length === 0) return;
    setToasts((prev) =>
      addToasts(prev, events, Date.now(), config.toastMs, config.toastIncidentMs),
    );
    for (const queued of events) store.dispatch({ type: 'dismissEvent', id: queued.id });
  }, [events]);

  useEffect(() => {
    const elapsed = now - lastNow.current;
    lastNow.current = now;
    setToasts((prev) => {
      if (held) return holdToasts(prev, elapsed);
      const next = liveToasts(prev, now);
      return next.length === prev.length ? prev : next;
    });
  }, [now, held]);

  const live = held ? toasts : liveToasts(toasts, now);
  const { shown, hidden } = visibleToasts(live, config.toastMax);
  const hold = () => setHeld(true);
  const release = () => setHeld(false);

  return (
    <ul
      className={styles.stack}
      aria-live="polite"
      onMouseEnter={hold}
      onMouseLeave={release}
      onFocusIn={hold}
      onFocusOut={release}
    >
      {shown.map((toast) => (
        <li key={toast.id} tabIndex={0} className={`${styles.toast} ${styles[toast.kind]}`}>
          <span className={styles.icon} aria-hidden="true">
            {ICON[toast.kind]}
          </span>
          <span className={styles.text}>{toast.text}</span>
        </li>
      ))}
      {hidden > 0 && (
        <li className={styles.more} tabIndex={0}>
          +{hidden} more
        </li>
      )}
    </ul>
  );
}
