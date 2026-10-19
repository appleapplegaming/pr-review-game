// 🙋 Second opinion? Pings the team and highlights the PR in everyone's queue.
// Disabled while this tab's cooldown runs, so the number on the button is the real wait.

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
  return (
    <button
      type="button"
      className={styles.ping}
      disabled={disabled || cooling}
      onClick={() => {
        onPing();
      }}
    >
      <span aria-hidden="true">🙋</span> Second opinion?
      {cooling && (
        <span className={styles.cooldown}>
          {` · available in ${cooldownSeconds(cooldownLeftMs)} s`}
        </span>
      )}
    </button>
  );
}
