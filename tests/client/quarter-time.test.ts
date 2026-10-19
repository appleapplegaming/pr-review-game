import { describe, expect, it } from 'vitest';
import { formatClock, timeLeftMs } from '../../client/src/views/game/quarter-time';

describe('formatClock', () => {
  it('formats whole seconds as mm:ss and drops the fraction', () => {
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(9_999)).toBe('00:09');
    expect(formatClock(65_000)).toBe('01:05');
    expect(formatClock(600_000)).toBe('10:00');
  });

  it('keeps counting minutes past an hour instead of wrapping', () => {
    expect(formatClock(3_725_000)).toBe('62:05');
  });

  it('clamps negative input to zero', () => {
    expect(formatClock(-5_000)).toBe('00:00');
  });
});

describe('timeLeftMs', () => {
  it('is the server end time minus the server now', () => {
    expect(timeLeftMs(10_000, 4_000)).toBe(6_000);
  });

  it('never goes below zero after the end', () => {
    expect(timeLeftMs(10_000, 12_000)).toBe(0);
  });
});
