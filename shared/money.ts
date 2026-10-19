import { config } from './config';

const MINUS = '−';

/**
 * Formats whole dollars for display: "$0", "$950", "$150k", "$10.4M".
 * Negatives use the U+2212 minus sign, e.g. "−$2.0M".
 */
export function formatMoney(dollars: number): string {
  if (dollars === 0) return '$0';
  const sign = dollars < 0 ? MINUS : '';
  const abs = Math.abs(dollars);

  if (abs < 1_000) return `${sign}$${Math.round(abs)}`;

  if (abs < 1_000_000) {
    const thousands = Math.round(abs / 1_000);
    if (thousands < 1_000) return `${sign}$${thousands}k`;
    // Rounds up to a whole million, so show it in millions.
  }

  // Millions with one decimal, computed in integer tenths to avoid float drift.
  const tenths = Math.round(abs / 100_000);
  const whole = Math.floor(tenths / 10);
  const frac = tenths % 10;
  return `${sign}$${whole}.${frac}M`;
}

/** Uptime fraction (0..1) for a quarter with the given downtime in minutes. */
export function computeUptime(downtimeMinutes: number): number {
  return Math.max(0, 1 - downtimeMinutes / config.quarterMinutes);
}

/** Uptime fraction as a percent with three decimals, e.g. "99.815%". */
export function formatUptime(fraction: number): string {
  return `${(fraction * 100).toFixed(3)}%`;
}
