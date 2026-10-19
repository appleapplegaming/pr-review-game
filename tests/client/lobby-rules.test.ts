import { describe, expect, it } from 'vitest';
import { config } from '../../shared/config';
import {
  codeFromPath,
  isValidCode,
  normalizeCode,
  roomLink,
  validateCompanyName,
  validateName,
} from '../../client/src/views/lobby-rules';
import { screenFor } from '../../client/src/routing';
import { initialState, type ClientState } from '../../client/src/net/store';
import type { PublicRoomState } from '../../shared/types';

function room(overrides: Partial<PublicRoomState> = {}): PublicRoomState {
  return {
    code: 'KZQX',
    companyName: 'Acme',
    phase: 'lobby',
    hostId: 'p1',
    players: [],
    startedAt: null,
    endsAt: null,
    totalPrs: 0,
    prs: [],
    metrics: { value: 0, downtimeMinutes: 0, uptime: 1, breaches: 0 },
    bankrupt: false,
    ...overrides,
  };
}

function stateWith(opts: {
  session?: boolean;
  room?: PublicRoomState | null;
  postmortem?: boolean;
}): ClientState {
  const s = initialState();
  return {
    ...s,
    session: opts.session === false ? null : { playerId: 'p1', code: 'KZQX' },
    room: opts.room === undefined ? room() : opts.room,
    postmortem: opts.postmortem ? ({} as ClientState['postmortem']) : null,
  };
}

describe('normalizeCode / isValidCode', () => {
  it('trims and uppercases a typed code', () => {
    expect(normalizeCode('  kzqx ')).toBe('KZQX');
  });

  it('accepts the server alphabet only (no I or O)', () => {
    expect(isValidCode('KZQX')).toBe(true);
    expect(isValidCode('KIZQ')).toBe(false);
    expect(isValidCode('KOZQ')).toBe(false);
  });

  it('rejects codes of the wrong length or with digits', () => {
    expect(isValidCode('KZQ')).toBe(false);
    expect(isValidCode('KZQXA')).toBe(false);
    expect(isValidCode('KZ2X')).toBe(false);
    expect(isValidCode('')).toBe(false);
  });

  it('uses the configured code length', () => {
    expect(config.roomCodeLength).toBe(4);
  });
});

describe('codeFromPath', () => {
  it('reads the code from a /r/CODE share link', () => {
    expect(codeFromPath('/r/KZQX')).toBe('KZQX');
    expect(codeFromPath('/r/kzqx')).toBe('KZQX');
    expect(codeFromPath('/r/KZQX/')).toBe('KZQX');
  });

  it('returns null for any other path', () => {
    expect(codeFromPath('/')).toBeNull();
    expect(codeFromPath('/r/')).toBeNull();
    expect(codeFromPath('/r/KZQX/extra')).toBeNull();
    expect(codeFromPath('/r/KIZQ')).toBeNull();
  });
});

describe('roomLink', () => {
  it('builds the share link from the page origin', () => {
    expect(roomLink('https://game.example', 'KZQX')).toBe('https://game.example/r/KZQX');
  });
});

describe('validateName', () => {
  it('trims and accepts a name within the limits', () => {
    expect(validateName('  Sara ')).toEqual({ ok: true, value: 'Sara' });
  });

  it('rejects an empty or whitespace-only name', () => {
    expect(validateName('   ').ok).toBe(false);
  });

  it('rejects a name longer than the limit', () => {
    const tooLong = 'x'.repeat(config.name.max + 1);
    expect(validateName(tooLong).ok).toBe(false);
    expect(validateName('x'.repeat(config.name.max)).ok).toBe(true);
  });

  it('rejects control characters', () => {
    expect(validateName('Sa\u0007ra').ok).toBe(false);
  });
});

describe('validateCompanyName', () => {
  it('uses the company name limits', () => {
    expect(validateCompanyName(' Globex ')).toEqual({ ok: true, value: 'Globex' });
    expect(validateCompanyName('').ok).toBe(false);
    expect(validateCompanyName('x'.repeat(config.companyName.max + 1)).ok).toBe(false);
  });
});

describe('screenFor', () => {
  it('shows the landing page when there is no seat or no room snapshot', () => {
    expect(screenFor(stateWith({ session: false, room: null }))).toBe('landing');
    expect(screenFor(stateWith({ session: false }))).toBe('landing');
    expect(screenFor(stateWith({ room: null }))).toBe('landing');
  });

  it('shows the lobby while the room is in the lobby phase', () => {
    expect(screenFor(stateWith({}))).toBe('lobby');
  });

  it('shows the game screen while playing', () => {
    expect(screenFor(stateWith({ room: room({ phase: 'playing' }) }))).toBe('game');
  });

  it('shows the postmortem once the quarter has ended', () => {
    expect(screenFor(stateWith({ room: room({ phase: 'ended' }), postmortem: true }))).toBe(
      'postmortem',
    );
  });

  it('returns to the lobby on play again (phase lobby, postmortem cleared)', () => {
    expect(screenFor(stateWith({ room: room({ phase: 'lobby' }), postmortem: false }))).toBe(
      'lobby',
    );
  });

  it('shows the postmortem screen when ended, even before the report arrives', () => {
    expect(screenFor(stateWith({ room: room({ phase: 'ended' }), postmortem: false }))).toBe(
      'postmortem',
    );
  });
});
