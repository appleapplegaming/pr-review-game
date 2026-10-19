import type { PullRequest } from '../../shared/types';
import { pr as pay008 } from './pay-008';
import { pr as pay009 } from './pay-009';
import { pr as auth008 } from './auth-008';
import { pr as auth009 } from './auth-009';
import { pr as data008 } from './data-008';
import { pr as data009 } from './data-009';
import { pr as api007 } from './api-007';
import { pr as ui006 } from './ui-006';

/** Python PRs: 2 clean, 2 money, 2 security, 2 outage. */
export const batchPython: readonly PullRequest[] = [
  pay008,
  pay009,
  auth008,
  auth009,
  data008,
  data009,
  api007,
  ui006,
];
