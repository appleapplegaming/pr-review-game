import type { BugType, ErrorCode, GameEvent, PublicRoomState, Postmortem } from './types';

// client → server
export type ClientMsg =
  | { t: 'create'; name: string }
  | { t: 'join'; code: string; name: string; playerId?: string } // playerId lets you rejoin after a reconnect
  | { t: 'start'; minutes?: number } // host only, from the lobby; minutes is the game length, default 10
  | { t: 'open'; prId: string } // presence only ("👀 Sara")
  | { t: 'merge'; prId: string }
  | { t: 'decline'; prId: string; bugType: BugType }
  | { t: 'comment'; prId: string; line: number | null; text: string }
  | { t: 'ping'; prId: string }
  | { t: 'rename'; companyName: string } // host only, from the lobby
  | { t: 'playAgain' }; // host only, from the postmortem

// server → client
export type ServerMsg =
  | { t: 'welcome'; playerId: string; code: string; serverNow: number }
  | { t: 'state'; state: PublicRoomState } // full snapshot, never includes the answer key
  | { t: 'event'; event: GameEvent } // toasts: incident, ping, merge, catch
  | { t: 'postmortem'; report: Postmortem } // includes the answer key
  | { t: 'error'; code: ErrorCode; message: string };

/** Client messages that act on a PR during play. */
export type Intent = Extract<ClientMsg, { t: 'open' | 'merge' | 'decline' | 'comment' | 'ping' }>;
