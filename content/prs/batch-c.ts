import type { PullRequest } from '../../shared/types';
import { pr as infra002 } from './infra-002';
import { pr as infra003 } from './infra-003';
import { pr as infra004 } from './infra-004';
import { pr as infra005 } from './infra-005';
import { pr as ui002 } from './ui-002';
import { pr as ui003 } from './ui-003';
import { pr as ui004 } from './ui-004';
import { pr as ui005 } from './ui-005';

/** PR batch C (see tasks/todo.md). Each PR lives in its own file and is listed here. */
export const batchC: readonly PullRequest[] = [
  infra002,
  infra003,
  infra004,
  infra005,
  ui002,
  ui003,
  ui004,
  ui005,
];
