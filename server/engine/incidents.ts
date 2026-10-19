// Incident effects: what one fired incident does to the metrics. Pure. The table is SPEC.md →
// Incidents, with its numbers in shared/config.ts.

import type { Bug } from '../../shared/types';
import { config } from '../../shared/config';
import type { Metrics } from './state';

export interface IncidentEffect {
  downtimeMinutes: number;
  valueLoss: number;
  breaches: number;
}

/** The effect of one incident for its bug's type and severity. */
export function incidentEffect(bug: Bug): IncidentEffect {
  switch (bug.type) {
    case 'outage': {
      const minutes = config.outage.minutes[bug.severity];
      return {
        downtimeMinutes: minutes,
        valueLoss: Math.round((minutes * config.outage.valuePerHour) / 60),
        breaches: 0,
      };
    }
    case 'money':
      return { downtimeMinutes: 0, valueLoss: config.money[bug.severity], breaches: 0 };
    case 'security':
      return { downtimeMinutes: 0, valueLoss: config.security[bug.severity], breaches: 1 };
  }
}

/**
 * Applies an incident to the metrics. Value never goes below $0. A value that reaches $0 is
 * bankruptcy, which the caller records and uses to end the quarter.
 */
export function applyIncident(metrics: Metrics, bug: Bug): { metrics: Metrics; bankrupt: boolean } {
  const effect = incidentEffect(bug);
  const value = Math.max(0, metrics.value - effect.valueLoss);
  return {
    metrics: {
      value,
      downtimeMinutes: metrics.downtimeMinutes + effect.downtimeMinutes,
      breaches: metrics.breaches + effect.breaches,
    },
    bankrupt: value <= 0,
  };
}
