import { afterEach, describe, expect, it, vi } from 'vitest';
import { systemClock } from '../../server/clock';

describe('systemClock', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs a timer once after its delay', () => {
    vi.useFakeTimers();
    const clock = systemClock();
    const fn = vi.fn();
    clock.setTimer(fn, 100);
    vi.advanceTimersByTime(99);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('a cleared timer never runs', () => {
    vi.useFakeTimers();
    const clock = systemClock();
    const fn = vi.fn();
    const id = clock.setTimer(fn, 100);
    clock.clearTimer(id);
    vi.advanceTimersByTime(1000);
    expect(fn).not.toHaveBeenCalled();
  });
});
