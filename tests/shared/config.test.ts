import { describe, expect, it } from 'vitest';
import { config } from '../../shared/config';

describe('config matches SPEC Game Rules', () => {
  it('has the quarter timing', () => {
    expect(config.quarterMs).toBe(600_000);
    expect(config.spawnWindowMs).toBe(510_000);
    expect(config.spawnJitter).toBe(0.2);
    expect(config.prTimerMs).toBe(90_000);
    expect(config.quarterMinutes).toBe(90 * 24 * 60);
  });

  it('has the PR count, value and incident numbers', () => {
    expect(config.prCount).toEqual({ base: 8, perPlayer: 4, min: 12, max: 30 });
    expect(config.cleanShare).toBeCloseTo(1 / 3, 12);
    expect(config.startingValue).toBe(10_000_000);
    expect(config.incidentDelayMs).toEqual({ min: 4_000, max: 12_000 });
    expect(config.catchBonus).toBe(150_000);
    expect(config.outage.minutes).toEqual({ minor: 30, major: 240, critical: 1440 });
    expect(config.outage.valuePerHour).toBe(40_000);
    expect(config.money).toEqual({ minor: 500_000, major: 2_000_000, critical: 5_000_000 });
    expect(config.security).toEqual({ minor: 1_000_000, major: 3_000_000, critical: 8_000_000 });
  });

  it('has the badge thresholds', () => {
    expect(config.badges.fiveNines).toEqual({ uptime: 0.9999, maxBreaches: 0 });
    expect(config.badges.threeNines).toEqual({ uptime: 0.999, maxBreaches: 1 });
    expect(config.badges.businessAsUsual).toEqual({ uptime: 0.99 });
  });

  it('has the protocol and room limits', () => {
    expect(config.pingCooldownMs).toBe(20_000);
    expect(config.comment).toEqual({ min: 1, max: 280 });
    expect(config.name).toEqual({ min: 1, max: 20 });
    expect(config.companyName).toEqual({ min: 1, max: 40 });
    expect(config.rateLimit).toEqual({ messages: 10, windowMs: 1000 });
    expect(config.tickMs).toBe(250);
    expect(config.roomCleanupMs).toBe(1_800_000);
    expect(config.featureValue).toEqual({ min: 200_000, max: 2_000_000 });
    expect(config.diffLines).toEqual({ min: 10, max: 40 });
    expect(config.contentLineMax).toBe(70);
    expect(config.toastMs).toBe(4000);
    expect(config.toastIncidentMs).toBe(8000);
    expect(config.toastMax).toBe(3);
    expect(config.roomCodeLength).toBe(4);
  });
});
