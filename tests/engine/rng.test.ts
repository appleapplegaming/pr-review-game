import { describe, expect, it } from 'vitest';
import { createRng, randomInt, shuffle } from '../../server/engine/rng';

function take(seed: number, n: number): number[] {
  const rng = createRng(seed);
  return Array.from({ length: n }, () => rng.next());
}

describe('createRng', () => {
  it('gives the same sequence for the same seed', () => {
    expect(take(42, 20)).toEqual(take(42, 20));
  });

  it('gives different sequences for different seeds', () => {
    expect(take(1, 20)).not.toEqual(take(2, 20));
  });

  it('returns values in [0, 1)', () => {
    for (const value of take(7, 5000)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('is roughly uniform', () => {
    const values = take(99, 10_000);
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    expect(Math.abs(mean - 0.5)).toBeLessThan(0.02);
  });
});

describe('randomInt', () => {
  it('stays within the inclusive range and reaches both ends', () => {
    const rng = createRng(3);
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) {
      const n = randomInt(rng, 1, 3);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(3);
      seen.add(n);
    }
    expect([...seen].sort()).toEqual([1, 2, 3]);
  });

  it('returns min when min equals max', () => {
    expect(randomInt(createRng(5), 4, 4)).toBe(4);
  });
});

describe('shuffle', () => {
  const items = ['a', 'b', 'c', 'd', 'e', 'f'];

  it('returns a permutation of the same items without mutating the input', () => {
    const copy = [...items];
    const out = shuffle(createRng(11), items);
    expect([...out].sort()).toEqual([...items].sort());
    expect(items).toEqual(copy);
  });

  it('is deterministic for a given seed', () => {
    expect(shuffle(createRng(8), items)).toEqual(shuffle(createRng(8), items));
  });

  it('actually reorders for some seeds', () => {
    const orders = new Set(
      Array.from({ length: 20 }, (_, seed) => shuffle(createRng(seed), items).join('')),
    );
    expect(orders.size).toBeGreaterThan(1);
  });
});
