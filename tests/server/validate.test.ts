import { describe, expect, expectTypeOf, it } from 'vitest';
import type { ClientMsg } from '../../shared/protocol';
import { config } from '../../shared/config';
import { clientMsgSchema, parseClientMessage } from '../../server/validate';
import type { z } from 'zod';

describe('schemas match ClientMsg', () => {
  it('infer the same type as ClientMsg, so the two cannot drift apart', () => {
    expectTypeOf<z.infer<typeof clientMsgSchema>>().toEqualTypeOf<ClientMsg>();
  });
});

describe('parseClientMessage', () => {
  it('accepts every client message in its valid form', () => {
    const valid = [
      { t: 'create', name: 'Sara' },
      { t: 'join', code: 'KZQX', name: 'Sara' },
      { t: 'join', code: 'KZQX', name: 'Sara', playerId: 'p-1' },
      { t: 'start' },
      { t: 'open', prId: 'pay-001' },
      { t: 'merge', prId: 'pay-001' },
      { t: 'decline', prId: 'pay-001', bugType: 'security' },
      { t: 'comment', prId: 'pay-001', line: 6, text: 'Why twice?' },
      { t: 'comment', prId: 'pay-001', line: null, text: 'Looks fine overall' },
      { t: 'ping', prId: 'pay-001' },
      { t: 'rename', companyName: 'Acme Payments' },
      { t: 'playAgain' },
    ];
    for (const msg of valid) {
      expect(parseClientMessage(JSON.stringify(msg)), JSON.stringify(msg)).toEqual(msg);
    }
  });

  it('returns null for malformed JSON', () => {
    expect(parseClientMessage('{"t":"start"')).toBeNull();
    expect(parseClientMessage('not json')).toBeNull();
    expect(parseClientMessage('')).toBeNull();
  });

  it('returns null for JSON that is not an object', () => {
    expect(parseClientMessage('null')).toBeNull();
    expect(parseClientMessage('42')).toBeNull();
    expect(parseClientMessage('"start"')).toBeNull();
    expect(parseClientMessage('[{"t":"start"}]')).toBeNull();
  });

  it('returns null for an unknown message type', () => {
    expect(parseClientMessage(JSON.stringify({ t: 'explode' }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: 'Start' }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ name: 'Sara' }))).toBeNull();
  });

  it('returns null when a field has the wrong type', () => {
    const wrong = [
      { t: 'create', name: 42 },
      { t: 'create', name: null },
      { t: 'join', code: 'KZQX', name: ['Sara'] },
      { t: 'join', code: 1234, name: 'Sara' },
      { t: 'join', code: 'KZQX', name: 'Sara', playerId: 7 },
      { t: 'open', prId: { id: 'pay-001' } },
      { t: 'decline', prId: 'pay-001', bugType: 'typo' },
      { t: 'comment', prId: 'pay-001', line: '6', text: 'hi' },
      { t: 'comment', prId: 'pay-001', line: 1.5, text: 'hi' },
      { t: 'comment', prId: 'pay-001', line: 0, text: 'hi' },
      { t: 'comment', prId: 'pay-001', line: 6, text: 9 },
      { t: 'rename', companyName: true },
    ];
    for (const msg of wrong) {
      expect(parseClientMessage(JSON.stringify(msg)), JSON.stringify(msg)).toBeNull();
    }
  });

  it('returns null when a required field is missing', () => {
    expect(parseClientMessage(JSON.stringify({ t: 'join', name: 'Sara' }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: 'merge' }))).toBeNull();
    expect(
      parseClientMessage(JSON.stringify({ t: 'comment', prId: 'pay-001', text: 'hi' })),
    ).toBeNull();
  });

  it('returns null for strings that are too long', () => {
    const tooLong = {
      name: 'x'.repeat(config.name.max + 1),
      companyName: 'x'.repeat(config.companyName.max + 1),
      text: 'x'.repeat(config.comment.max + 1),
      prId: 'x'.repeat(65),
    };
    expect(parseClientMessage(JSON.stringify({ t: 'create', name: tooLong.name }))).toBeNull();
    expect(
      parseClientMessage(JSON.stringify({ t: 'rename', companyName: tooLong.companyName })),
    ).toBeNull();
    expect(
      parseClientMessage(
        JSON.stringify({ t: 'comment', prId: 'pay-001', line: 1, text: tooLong.text }),
      ),
    ).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: 'open', prId: tooLong.prId }))).toBeNull();
  });

  it('counts length in characters, not UTF-16 units', () => {
    // 20 emoji are 40 UTF-16 units but 20 characters, so they fit the 20-character name limit.
    const name = '🎉'.repeat(config.name.max);
    expect(parseClientMessage(JSON.stringify({ t: 'create', name }))).toEqual({
      t: 'create',
      name,
    });
    expect(parseClientMessage(JSON.stringify({ t: 'create', name: name + '🎉' }))).toBeNull();
  });

  it('rejects empty names and empty comments', () => {
    expect(parseClientMessage(JSON.stringify({ t: 'create', name: '' }))).toBeNull();
    expect(
      parseClientMessage(JSON.stringify({ t: 'comment', prId: 'pay-001', line: 1, text: '' })),
    ).toBeNull();
  });

  it('keeps a line number inside the diff size limit', () => {
    const line = config.diffLines.max;
    expect(
      parseClientMessage(JSON.stringify({ t: 'comment', prId: 'p', line, text: 'hi' })),
    ).not.toBeNull();
    expect(
      parseClientMessage(JSON.stringify({ t: 'comment', prId: 'p', line: line + 1, text: 'hi' })),
    ).toBeNull();
  });
});
