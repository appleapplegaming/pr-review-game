// Seeded pseudo-random numbers (mulberry32). The engine never calls Math.random(): every
// random draw comes from an Rng passed in by the caller, so the same seed replays the same game.

export interface Rng {
  /** A uniform number in [0, 1). */
  next(): number;
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  return {
    next() {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

/** A whole number from `min` to `max`, both inclusive. */
export function randomInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng.next() * (max - min + 1));
}

/** A new array with the same items in a random order. The input is not changed. */
export function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const rest = [...items];
  const out: T[] = [];
  while (rest.length > 0) {
    const [item] = rest.splice(randomInt(rng, 0, rest.length - 1), 1);
    if (item !== undefined) out.push(item);
  }
  return out;
}
