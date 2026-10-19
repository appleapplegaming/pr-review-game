import type { PullRequest } from '../../shared/types';
import { pr as pay001 } from './pay-001';
import { pr as pay002 } from './pay-002';
import { pr as pay003 } from './pay-003';
import { pr as pay005 } from './pay-005';
import { pr as data001 } from './data-001';
import { pr as data002 } from './data-002';
import { pr as data003 } from './data-003';
import { pr as data004 } from './data-004';
import { pr as data005 } from './data-005';

/** PR batch A (see tasks/todo.md). Each PR lives in its own file and is listed here. */
export const batchA: readonly PullRequest[] = [
  pay001,
  pay002,
  pay003,
  pay005,
  data001,
  data002,
  data003,
  data004,
  data005,
];
