import type { PullRequest } from '../../shared/types';

export const pr: PullRequest = {
  id: 'infra-001',
  title: 'Add maintenance mode gate to the API',
  author: 'priya.s',
  area: 'infra',
  description: 'Lets ops put the API into maintenance mode, with a bypass token for the team.',
  language: 'ts',
  diff: `
@@ infra/middleware/maintenance.ts @@
 import type { Handler } from 'express';
 import { flags } from '../config/flags';
 
 export const maintenanceGate: Handler = (req, res, next) => {
   if (req.path.startsWith('/healthz')) return next();
-  if (flags.maintenanceMode && !req.headers['x-ops-token']) {
+  if (!flags.maintenanceMode || !req.headers['x-ops-token']) {
     res.status(503).json({ error: 'maintenance' });
     return;
   }
   next();
 };
`,
  featureValue: 600_000,
  bug: {
    type: 'outage',
    severity: 'major',
    lines: [7],
    explanation:
      'The maintenance check was inverted. When maintenance mode is off, the condition is true, so every request without an ops token gets a 503.',
    incident: '🔥 Maintenance gate shipped. Whole API returns 503 to customers. 4h down',
  },
};
