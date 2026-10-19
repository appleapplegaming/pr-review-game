// Parses and validates every client frame. Everything from a socket is untrusted: a frame must be
// JSON, an object with a known `t`, and every field must have the right type and length. Anything
// else returns null and the caller replies BAD_MESSAGE. The semantic checks (is the code a room,
// is the PR open, is the player the host) happen later, in rooms.ts and the engine.

import { z } from 'zod';
import { BUG_TYPES } from '../shared/types';
import { config } from '../shared/config';
import type { ClientMsg } from '../shared/protocol';

/** Length in characters (code points), so an emoji counts once, as a player would count it. */
function codePoints(text: string): number {
  return [...text].length;
}

/** A string of min to max characters. */
function text(min: number, max: number) {
  return z.string().refine(
    (value) => {
      const n = codePoints(value);
      return n >= min && n <= max;
    },
    { message: `must be ${min} to ${max} characters` },
  );
}

const nameSchema = text(config.name.min, config.name.max);
const companyNameSchema = text(config.companyName.min, config.companyName.max);
const codeSchema = text(1, 16);
const idSchema = text(1, 64);
const commentSchema = text(config.comment.min, config.comment.max);
const lineSchema = z.number().int().min(1).max(config.diffLines.max).nullable();

/** Mirrors ClientMsg in shared/protocol.ts. A type test in tests/server/validate.test.ts checks they agree. */
export const clientMsgSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('create'), name: nameSchema }),
  z.object({
    t: z.literal('join'),
    code: codeSchema,
    name: nameSchema,
    playerId: idSchema.optional(),
  }),
  z.object({ t: z.literal('start') }),
  z.object({ t: z.literal('open'), prId: idSchema }),
  z.object({ t: z.literal('merge'), prId: idSchema }),
  z.object({ t: z.literal('decline'), prId: idSchema, bugType: z.enum(BUG_TYPES) }),
  z.object({ t: z.literal('comment'), prId: idSchema, line: lineSchema, text: commentSchema }),
  z.object({ t: z.literal('ping'), prId: idSchema }),
  z.object({ t: z.literal('rename'), companyName: companyNameSchema }),
  z.object({ t: z.literal('playAgain') }),
]);

/** Parses one JSON text frame into a ClientMsg. Returns null for anything that is not one. */
export function parseClientMessage(raw: string): ClientMsg | null {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = clientMsgSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}
