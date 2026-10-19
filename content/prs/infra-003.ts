import type { PullRequest } from '../../shared/types';

export const pr: PullRequest = {
  id: 'infra-003',
  title: 'Speed up the readiness probe',
  author: 'ines.c',
  area: 'infra',
  description: 'Makes the readiness probe cheaper so it stops adding load to the database.',
  language: 'ts',
  diff: `
@@ infra/health/probes.ts @@
 import { db } from '../db/client';
 import { state } from './state';

 export async function liveness(): Promise<boolean> {
   return !state.crashed;
 }

 export async function readiness(): Promise<boolean> {
   // Not ready while the database is unreachable.
   if (state.shuttingDown) return false;
-  const ok = await db.ping({ timeoutMs: 2_000 });
-  return ok;
+  return state.warm;
 }
`,
  featureValue: 900_000,
  bug: {
    type: 'outage',
    severity: 'critical',
    lines: [13],
    explanation:
      'Readiness no longer pings the database. It returns state.warm, which only says the process has booted. When the database dies, pods stay in rotation and every request fails until someone notices.',
    incident:
      '🔥 Readiness probe stopped checking the database. Dead DB stays in rotation. 24h down',
  },
};
