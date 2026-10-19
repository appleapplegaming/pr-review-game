import { describe, expect, it } from 'vitest';
import { AREAS } from '../../shared/types';
import { pool } from '../../content/prs';

describe('PR pool mix', () => {
  it('has exactly 30 PRs with unique ids', () => {
    expect(pool).toHaveLength(30);
    expect(new Set(pool.map((p) => p.id)).size).toBe(30);
  });

  it('has 9 clean, 7 money, 7 security and 7 outage PRs', () => {
    const count = (kind: string) => pool.filter((p) => (p.bug?.type ?? 'clean') === kind).length;
    expect(count('clean')).toBe(9);
    expect(count('money')).toBe(7);
    expect(count('security')).toBe(7);
    expect(count('outage')).toBe(7);
  });

  it('has at least 3 PRs in every area', () => {
    for (const area of AREAS) {
      expect(pool.filter((p) => p.area === area).length, area).toBeGreaterThanOrEqual(3);
    }
  });
});
