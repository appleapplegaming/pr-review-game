import type { PullRequest } from '../../shared/types';
import { pr as pay004 } from './pay-004';
import { pr as auth001 } from './auth-001';
import { pr as infra001 } from './infra-001';
import { pr as ui001 } from './ui-001';

/** The PR pool. Seeds from Task 3; the batches in Tasks 24-26 add the rest. */
export const pool: readonly PullRequest[] = [pay004, auth001, infra001, ui001];
