import type { PullRequest } from '../../shared/types';
import { pr as pay004 } from './pay-004';
import { pr as auth001 } from './auth-001';
import { pr as infra001 } from './infra-001';
import { pr as ui001 } from './ui-001';
import { batchA } from './batch-a';
import { batchB } from './batch-b';
import { batchC } from './batch-c';

/** The PR pool: the Task 3 seeds plus the batches from Tasks 24-26. */
export const pool: readonly PullRequest[] = [
  pay004,
  auth001,
  infra001,
  ui001,
  ...batchA,
  ...batchB,
  ...batchC,
];
