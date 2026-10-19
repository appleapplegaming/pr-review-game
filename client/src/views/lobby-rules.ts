// Client-side checks for the landing and lobby forms. They mirror the server's rules in
// server/rooms.ts so the player sees a message before a round trip. The server stays the authority.
//
// Pure: no DOM, no store, so the rules are unit-tested in Vitest.

import { config } from '../../../shared/config';

export type Checked = { ok: true; value: string } | { ok: false; message: string };

/** Room codes use A-Z without I and O (server/rooms.ts). */
const CODE_PATTERN = new RegExp(`^[A-HJ-NP-Z]{${config.roomCodeLength}}$`);

/** Trims and uppercases a typed room code. */
export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export function isValidCode(code: string): boolean {
  return CODE_PATTERN.test(code);
}

/** The room code from a `/r/CODE` path, or null for any other path or an invalid code. */
export function codeFromPath(pathname: string): string | null {
  const match = /^\/r\/([^/]+)\/?$/.exec(pathname);
  if (match === null) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(match[1] ?? '');
  } catch {
    return null;
  }
  const code = normalizeCode(decoded);
  return isValidCode(code) ? code : null;
}

/** The share link for a room, built from the page origin. */
export function roomLink(origin: string, code: string): string {
  return `${origin}/r/${code}`;
}

function checkText(raw: string, limits: { min: number; max: number }, label: string): Checked {
  const value = raw.trim();
  const length = [...value].length;
  if (length < limits.min || length > limits.max) {
    return { ok: false, message: `${label} must be ${limits.min} to ${limits.max} characters` };
  }
  if (/\p{Cc}/u.test(value)) {
    return { ok: false, message: `${label} can't contain control characters` };
  }
  return { ok: true, value };
}

export function validateName(raw: string): Checked {
  return checkText(raw, config.name, 'Name');
}

export function validateCompanyName(raw: string): Checked {
  return checkText(raw, config.companyName, 'Company name');
}
