import { describe, expect, it } from 'vitest';
import { computeUptime, formatMoney, formatUptime } from '../../shared/money';

describe('formatMoney', () => {
  it.each([
    [0, '$0'],
    [950, '$950'],
    [999, '$999'],
    [1_000, '$1k'],
    [1_500, '$2k'],
    [40_000, '$40k'],
    [150_000, '$150k'],
    [999_499, '$999k'],
    [999_500, '$1.0M'],
    [1_000_000, '$1.0M'],
    [1_950_000, '$2.0M'],
    [2_000_000, '$2.0M'],
    [5_000_000, '$5.0M'],
    [10_000_000, '$10.0M'],
    [10_400_000, '$10.4M'],
    [-950, '−$950'],
    [-150_000, '−$150k'],
    [-500_000, '−$500k'],
    [-2_000_000, '−$2.0M'],
  ])('formats %i as %s', (input, expected) => {
    expect(formatMoney(input)).toBe(expected);
  });

  it('uses the U+2212 minus sign for negatives, not a hyphen', () => {
    expect(formatMoney(-2_000_000).startsWith('−')).toBe(true);
    expect(formatMoney(-2_000_000)).not.toContain('-');
  });
});

describe('computeUptime', () => {
  it('is 1 with no downtime', () => {
    expect(computeUptime(0)).toBe(1);
  });

  it('is 1 minus downtime over the 129,600-minute quarter', () => {
    expect(computeUptime(240)).toBeCloseTo(1 - 240 / 129_600, 12);
    expect(computeUptime(1_440)).toBeCloseTo(1 - 1_440 / 129_600, 12);
  });

  it('floors at 0 when downtime exceeds the quarter', () => {
    expect(computeUptime(129_600)).toBe(0);
    expect(computeUptime(200_000)).toBe(0);
  });
});

describe('formatUptime', () => {
  it('formats to three decimals as a percent', () => {
    expect(formatUptime(computeUptime(240))).toBe('99.815%');
  });

  it('shows 100.000% for a perfect quarter', () => {
    expect(formatUptime(1)).toBe('100.000%');
  });

  it('keeps three decimals for round fractions', () => {
    expect(formatUptime(0.999)).toBe('99.900%');
    expect(formatUptime(0.99)).toBe('99.000%');
  });
});
