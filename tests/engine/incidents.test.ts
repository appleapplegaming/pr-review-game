import { describe, expect, it } from 'vitest';
import type { Bug, BugType, Severity } from '../../shared/types';
import { applyIncident, incidentEffect } from '../../server/engine/incidents';
import type { Metrics } from '../../server/engine/state';

function bugOf(type: BugType, severity: Severity): Bug {
  return { type, severity, lines: [1], explanation: 'x', incident: 'Something broke.' };
}

// The Incidents table in SPEC.md → Game Rules, cell by cell.
const SPEC_CELLS: {
  type: BugType;
  severity: Severity;
  downtimeMinutes: number;
  valueLoss: number;
  breaches: number;
}[] = [
  { type: 'outage', severity: 'minor', downtimeMinutes: 30, valueLoss: 20_000, breaches: 0 },
  { type: 'outage', severity: 'major', downtimeMinutes: 240, valueLoss: 160_000, breaches: 0 },
  { type: 'outage', severity: 'critical', downtimeMinutes: 1440, valueLoss: 960_000, breaches: 0 },
  { type: 'money', severity: 'minor', downtimeMinutes: 0, valueLoss: 500_000, breaches: 0 },
  { type: 'money', severity: 'major', downtimeMinutes: 0, valueLoss: 2_000_000, breaches: 0 },
  { type: 'money', severity: 'critical', downtimeMinutes: 0, valueLoss: 5_000_000, breaches: 0 },
  { type: 'security', severity: 'minor', downtimeMinutes: 0, valueLoss: 1_000_000, breaches: 1 },
  { type: 'security', severity: 'major', downtimeMinutes: 0, valueLoss: 3_000_000, breaches: 1 },
  { type: 'security', severity: 'critical', downtimeMinutes: 0, valueLoss: 8_000_000, breaches: 1 },
];

function metricsOf(value: number, downtimeMinutes = 0, breaches = 0): Metrics {
  return { value, downtimeMinutes, breaches };
}

describe('incident effects (the Incidents table)', () => {
  it.each(SPEC_CELLS)('$type $severity: downtime, value loss and breaches', (cell) => {
    const effect = incidentEffect(bugOf(cell.type, cell.severity));

    expect(effect).toEqual({
      downtimeMinutes: cell.downtimeMinutes,
      valueLoss: cell.valueLoss,
      breaches: cell.breaches,
    });
  });

  it.each(SPEC_CELLS)('$type $severity applied to 10M takes the loss off the value', (cell) => {
    const { metrics, bankrupt } = applyIncident(
      metricsOf(10_000_000),
      bugOf(cell.type, cell.severity),
    );

    expect(metrics.value).toBe(10_000_000 - cell.valueLoss);
    expect(metrics.downtimeMinutes).toBe(cell.downtimeMinutes);
    expect(metrics.breaches).toBe(cell.breaches);
    expect(bankrupt).toBe(false);
  });
});

describe('applying an incident to the metrics', () => {
  it('adds downtime to the running total', () => {
    const { metrics } = applyIncident(metricsOf(10_000_000, 10), bugOf('outage', 'major'));

    expect(metrics.downtimeMinutes).toBe(250);
  });

  it('adds one breach per security incident to the running total', () => {
    const { metrics } = applyIncident(metricsOf(10_000_000, 0, 1), bugOf('security', 'minor'));

    expect(metrics.breaches).toBe(2);
  });

  it('reaching exactly $0 is bankruptcy and the value is 0', () => {
    const { metrics, bankrupt } = applyIncident(metricsOf(2_000_000), bugOf('money', 'major'));

    expect(metrics.value).toBe(0);
    expect(bankrupt).toBe(true);
  });

  it('a loss larger than the value floors the value at $0 and is bankruptcy', () => {
    const { metrics, bankrupt } = applyIncident(metricsOf(1_000_000), bugOf('money', 'critical'));

    expect(metrics.value).toBe(0);
    expect(bankrupt).toBe(true);
  });

  it('a value that stays above $0 is not bankruptcy', () => {
    const { bankrupt } = applyIncident(metricsOf(2_000_001), bugOf('money', 'major'));

    expect(bankrupt).toBe(false);
  });
});
