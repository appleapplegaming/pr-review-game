import type { PullRequest } from '../../shared/types';
import { pr as pay004 } from './pay-004';
import { pr as auth001 } from './auth-001';
import { pr as infra001 } from './infra-001';
import { pr as ui001 } from './ui-001';
import { batchA } from './batch-a';
import { batchB } from './batch-b';
import { batchC } from './batch-c';
import { batchJava } from './batch-java';
import { batchPython } from './batch-python';

/**
 * The PR pool: the 30 TypeScript PRs (Task 3 seeds plus the batches from Tasks 24-26), then the
 * Java and Python batches.
 */
export const pool: readonly PullRequest[] = [
  pay004,
  auth001,
  infra001,
  ui001,
  ...batchA,
  ...batchB,
  ...batchC,
  ...batchJava,
  ...batchPython,
];
