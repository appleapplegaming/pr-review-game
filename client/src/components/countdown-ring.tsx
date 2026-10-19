// A ring that empties as a PR's window runs out, with its m:ss label beside it. Pure presentation:
// the caller computes the fraction and urgency (queue-rules.ts), so this never reads the clock.
// The text label is the accessible value. The ring is decorative and is not a live region.

import styles from './countdown-ring.module.css';

export interface CountdownRingProps {
  /** Share of the window left, 0..1. */
  fraction: number;
  /** m:ss, shown as text and read by screen readers. */
  label: string;
  /** Turns the ring red. Set below config.countdownUrgentMs. */
  urgent: boolean;
}

const RADIUS = 16;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function CountdownRing({ fraction, label, urgent }: CountdownRingProps) {
  const offset = CIRCUMFERENCE * (1 - Math.min(1, Math.max(0, fraction)));
  return (
    <span className={urgent ? styles.urgent : styles.ring}>
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
      <span className={styles.label}>{label}</span>
      <span className={styles.sr}> left to review</span>
    </span>
  );
}
