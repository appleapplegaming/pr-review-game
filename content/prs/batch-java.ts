import type { PullRequest } from '../../shared/types';
import { pr as pay006 } from './pay-006';
import { pr as pay007 } from './pay-007';
import { pr as auth006 } from './auth-006';
import { pr as auth007 } from './auth-007';
import { pr as data006 } from './data-006';
import { pr as data007 } from './data-007';
import { pr as api006 } from './api-006';
import { pr as infra006 } from './infra-006';

/** Java PRs: 2 clean, 2 money, 2 security, 2 outage. */
export const batchJava: readonly PullRequest[] = [
  pay006,
  pay007,
  auth006,
  auth007,
  data006,
  data007,
  api006,
  infra006,
];
