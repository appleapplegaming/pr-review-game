// Quarter clock helpers. Pure. Every input is a server timestamp or a difference of two of them.

/** mm:ss for a duration in milliseconds. Whole seconds only; negatives show as 00:00. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/** Milliseconds left until the server's end time, never negative. */
export function timeLeftMs(endsAt: number, serverNow: number): number {
  return Math.max(0, endsAt - serverNow);
}
