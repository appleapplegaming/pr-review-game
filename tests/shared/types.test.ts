import { describe, expectTypeOf, it } from 'vitest';
import {
  AREAS,
  BUG_TYPES,
  SEVERITIES,
  type Area,
  type BugType,
  type Bug,
  type PullRequest,
  type PublicPr,
  type PublicRoomState,
  type Severity,
} from '../../shared/types';
import type { ClientMsg, Intent, ServerMsg } from '../../shared/protocol';

describe('shared domain types', () => {
  it('derives the union types from their const arrays', () => {
    expectTypeOf<BugType>().toEqualTypeOf<'money' | 'security' | 'outage'>();
    expectTypeOf<Severity>().toEqualTypeOf<'minor' | 'major' | 'critical'>();
    expectTypeOf<Area>().toEqualTypeOf<'payments' | 'auth' | 'infra' | 'ui' | 'data' | 'api'>();
    expectTypeOf<(typeof BUG_TYPES)[number]>().toEqualTypeOf<BugType>();
    expectTypeOf<(typeof SEVERITIES)[number]>().toEqualTypeOf<Severity>();
    expectTypeOf<(typeof AREAS)[number]>().toEqualTypeOf<Area>();
  });

  it('keeps the answer key out of PublicPr', () => {
    expectTypeOf<'bug' extends keyof PublicPr ? true : false>().toEqualTypeOf<false>();
    expectTypeOf<PublicPr>().not.toHaveProperty('bug');
  });

  it('keeps the answer key out of PublicRoomState', () => {
    expectTypeOf<'bug' extends keyof PublicRoomState ? true : false>().toEqualTypeOf<false>();
    expectTypeOf<PublicRoomState['prs'][number]>().toEqualTypeOf<PublicPr>();
  });

  it('keeps the answer key on PullRequest (server and postmortem only)', () => {
    expectTypeOf<PullRequest['bug']>().toEqualTypeOf<Bug | null>();
  });

  it('limits Intent to the five player actions', () => {
    expectTypeOf<Intent['t']>().toEqualTypeOf<'open' | 'merge' | 'decline' | 'comment' | 'ping'>();
    expectTypeOf<Extract<ClientMsg, { t: 'create' }>>().not.toEqualTypeOf<never>();
    expectTypeOf<Extract<ServerMsg, { t: 'postmortem' }>>().not.toEqualTypeOf<never>();
  });
});
