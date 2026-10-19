// 🙋 Second opinion? Pings the team and highlights the PR in everyone's queue.
// While this tab's cooldown runs the button is aria-disabled, not disabled, so a keyboard user
// who just pressed it keeps focus. The visible countdown is hidden from the accessible name and
// from live regions, so a screen reader is not told about every tick.

import { useState } from 'preact/hooks';
import { cooldownSeconds } from './comment-rules';
import styles from './Comments.module.css';

export interface PingButtonProps {
  cooldownLeftMs: number;
  disabled?: boolean;
  /** Returns true when the ping was sent. */
  onPing(): boolean;
}

export function PingButton({ cooldownLeftMs, disabled = false, onPing }: PingButtonProps) {
  const cooling = cooldownLeftMs > 0;
  const blocked = disabled || cooling;
  const [announce, setAnnounce] = useState('');
  return (
    <div className={styles.pingWrap}>
      <button
        type="button"
        className={styles.ping}
        aria-disabled={blocked ? true : undefined}
        onClick={() => {
          if (blocked) return;
          setAnnounce(onPing() ? 'Asked for a second opinion' : '');
        }}
      >
        <span aria-hidden="true">🙋</span> Second opinion?
        {cooling && (
          <span className={styles.cooldown} aria-hidden="true">
            {` · available in ${cooldownSeconds(cooldownLeftMs)} s`}
          </span>
        )}
      </button>
      <p role="status" className={styles.sr}>
        {announce}
      </p>
    </div>
  );
}
