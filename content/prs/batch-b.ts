import type { PullRequest } from '../../shared/types';
import { pr as auth002 } from './auth-002';
import { pr as auth003 } from './auth-003';
import { pr as auth004 } from './auth-004';
import { pr as auth005 } from './auth-005';
import { pr as api001 } from './api-001';
import { pr as api002 } from './api-002';
import { pr as api003 } from './api-003';
import { pr as api004 } from './api-004';
import { pr as api005 } from './api-005';

/** PR batch B (see tasks/todo.md). Each PR lives in its own file and is listed here. */
export const batchB: readonly PullRequest[] = [
  auth002,
  auth003,
  auth004,
  auth005,
  api001,
  api002,
  api003,
  api004,
  api005,
];
