import { describe, expect, it } from 'vitest';
import { AREAS, LANGUAGES } from '../../shared/types';
import { pool } from '../../content/prs';
import { validatePool } from '../../content/validate';

describe('PR pool mix', () => {
  const ts = pool.filter((p) => p.language === 'ts');

  it('has 46 PRs with unique ids', () => {
    expect(pool).toHaveLength(46);
    expect(new Set(pool.map((p) => p.id)).size).toBe(46);
  });

  it('has 30 TypeScript, 8 Java and 8 Python PRs', () => {
    expect(ts).toHaveLength(30);
    expect(pool.filter((p) => p.language === 'java')).toHaveLength(8);
    expect(pool.filter((p) => p.language === 'python')).toHaveLength(8);
    for (const language of LANGUAGES) {
      expect(
        pool.some((p) => p.language === language),
        language,
      ).toBe(true);
    }
  });

  const count = (prs: typeof pool, kind: string) =>
    prs.filter((p) => (p.bug?.type ?? 'clean') === kind).length;

  it('has 9 clean, 7 money, 7 security and 7 outage TypeScript PRs', () => {
    expect(count(ts, 'clean')).toBe(9);
    expect(count(ts, 'money')).toBe(7);
    expect(count(ts, 'security')).toBe(7);
    expect(count(ts, 'outage')).toBe(7);
  });

  it.each(['java', 'python'] as const)(
    'has 2 clean, 2 money, 2 security and 2 outage %s PRs',
    (language) => {
      const prs = pool.filter((p) => p.language === language);
      for (const kind of ['clean', 'money', 'security', 'outage']) {
        expect(count(prs, kind), kind).toBe(2);
      }
    },
  );

  it('has at least 3 PRs in every area', () => {
    for (const area of AREAS) {
      expect(pool.filter((p) => p.area === area).length, area).toBeGreaterThanOrEqual(3);
    }
  });

  it('passes every content rule', () => {
    expect(validatePool(pool)).toEqual([]);
  });
});
