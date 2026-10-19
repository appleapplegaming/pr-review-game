// Which screen the app shows. Pure: a function of the store state only.
//
// The phase decides the screen once the tab holds a seat: lobby, then game, then postmortem.
// Without a seat, or before the first room snapshot, the landing page is shown.
// "Play again" moves the room back to the lobby phase, so the same mapping covers it.

import type { ClientState } from './net/store';

export type Screen = 'landing' | 'lobby' | 'game' | 'postmortem';

export function screenFor(state: ClientState): Screen {
  if (state.session === null || state.room === null) return 'landing';
  switch (state.room.phase) {
    case 'lobby':
      return 'lobby';
    case 'playing':
      return 'game';
    case 'ended':
      return 'postmortem';
  }
}
