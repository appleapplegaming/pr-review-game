// A ring that empties as a PR's window runs out, with its m:ss label beside it. Pure presentation:
// the caller computes the fraction and urgency (queue-rules.ts), so this never reads the clock.
// The ring is one image named by its time ("auto-merges in 1:30", or "auto-merges soon" when urgent). The drawn parts are hidden from
// assistive tech. The ring is not a live region, so the changing time is not announced on each tick.

import styles from './countdown-ring.module.css';

export interface CountdownRingProps {
  /** Share of the window left, 0..1. */
  fraction: number;
  /** m:ss, shown as text and read by screen readers. */
  label: string;
  /** Urgent state: red, thicker stroke and an "Auto-merges soon" text cue. Set below config.countdownUrgentMs. */
  urgent: boolean;
}

const RADIUS = 16;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function CountdownRing({ fraction, label, urgent }: CountdownRingProps) {
  const offset = CIRCUMFERENCE * (1 - Math.min(1, Math.max(0, fraction)));
  return (
    <span
      className={urgent ? styles.urgent : styles.ring}
      role="img"
      aria-label={urgent ? `auto-merges soon, in ${label}` : `auto-merges in ${label}`}
    >
      <svg className={styles.svg} viewBox="0 0 36 36" aria-hidden="true" focusable="false">
        <circle className={styles.track} cx="18" cy="18" r={RADIUS} />
        <circle
          className={styles.arc}
          cx="18"
          cy="18"
          r={RADIUS}
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
        />
      </svg>
      <span className={styles.label} aria-hidden="true">
        {label}
      </span>
      {urgent && (
        <span className={styles.cue} aria-hidden="true">
          Auto-merges soon
        </span>
      )}
    </span>
  );
}
