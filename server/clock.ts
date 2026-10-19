// The real clock for the server. rooms.ts and ws.ts take a RoomClock so tests can drive time by hand;
// this is the one they use in production.

import type { RoomClock } from './rooms';

export function systemClock(): RoomClock {
  const timers = new Map<number, ReturnType<typeof setTimeout>>();
  let nextId = 1;
  return {
    now: () => Date.now(),
    setTimer(fn, ms) {
      const id = nextId++;
      timers.set(
        id,
        setTimeout(() => {
          timers.delete(id);
          fn();
        }, ms),
      );
      return id;
    },
    clearTimer(id) {
      const handle = timers.get(id);
      if (handle !== undefined) clearTimeout(handle);
      timers.delete(id);
    },
  };
}
