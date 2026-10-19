import type { PullRequest } from '../../shared/types';

export const pr: PullRequest = {
  id: 'infra-005',
  title: 'Add a batch plan to the billing tiers',
  author: 'hana.k',
  area: 'infra',
  description: 'Adds a spot-priced batch plan and tidies the plan-to-tier mapping.',
  language: 'ts',
  diff: `
@@ infra/billing/tiers.ts @@
 export type Tier = 'on_demand' | 'reserved' | 'spot';

 export const HOURLY_RATE: Record<Tier, number> = {
   on_demand: 0.096,
   reserved: 0.061,
   spot: 0.029,
 };

 export const PLAN_TIERS: Record<string, Tier> = {
   starter: 'on_demand',
   growth: 'on_demand',
-  enterprise: 'reserved',
+  enterpise: 'reserved',
+  batch: 'spot',
 };

 export function tierFor(plan: string): Tier {
   return PLAN_TIERS[plan] ?? 'on_demand';
 }

 export function hourlyCharge(plan: string, hours: number): number {
   return HOURLY_RATE[tierFor(plan)] * hours;
 }
`,
  featureValue: 700_000,
  bug: {
    type: 'money',
    severity: 'major',
    lines: [13],
    explanation:
      'The enterprise key is misspelled. Enterprise accounts miss the lookup and fall back to the on-demand rate, so reserved-instance customers are billed on-demand prices for every hour they run.',
    incident: '💸 Plan tier typo shipped. Enterprise accounts billed on-demand rates. −$2M',
  },
};
