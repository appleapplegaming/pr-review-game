// Reconnect delay. Pure: the randomness is passed in so tests are deterministic.
//
// The ceiling doubles per failed attempt up to reconnectMaxMs. The delay is drawn from
// [ceiling × (1 − jitter), ceiling], so a room of players who lost their connection together does
// not all retry on the same tick.

import { config } from '../../../shared/config';

/** Delay before reconnect attempt `attempt` (0 for the first retry after a drop). */
export function reconnectDelay(
  attempt: number,
  random: () => number,
  options: {
    baseMs: number;
    maxMs: number;
    factor: number;
    jitter: number;
  } = {
    baseMs: config.reconnectBaseMs,
    maxMs: config.reconnectMaxMs,
    factor: config.reconnectFactor,
    jitter: config.reconnectJitter,
  },
): number {
  // Math.min with Infinity gives the cap, so a very large attempt count never yields NaN.
  const ceiling = Math.min(options.maxMs, options.baseMs * options.factor ** attempt);
  return ceiling * (1 - options.jitter * random());
}
