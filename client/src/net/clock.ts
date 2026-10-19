// Clock sync. Pure. The server stamps `welcome.serverNow`; the client assumes that stamp was taken
// halfway through the join round trip, which is the usual NTP-style estimate.
//
// Every countdown is computed as serverTime() − some server timestamp, so a skewed local clock
// does not move timers. The offset is measured again on every welcome, that is, on every reconnect.

/** Server time minus local time, in whole milliseconds. Positive when the server clock is ahead. */
export function offsetFromWelcome(input: {
  /** `welcome.serverNow`: the server's clock when it answered the join. */
  serverNow: number;
  /** Local time when the join was sent. */
  sentAt: number;
  /** Local time when the welcome arrived. */
  receivedAt: number;
}): number {
  const localMidpoint = (input.sentAt + input.receivedAt) / 2;
  return Math.round(input.serverNow - localMidpoint);
}

/** The server's current time, estimated from the local time and the stored offset. */
export function serverTimeFrom(offset: number, localNow: number): number {
  return localNow + offset;
}
