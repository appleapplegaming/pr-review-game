// Plain-text wording for one game event, shared by toasts and the activity feed.
//
// Incidents show only their text. The incident text does not name the PR that caused it, and that
// is deliberate (plan.md, Resolved Decision 4). Money is formatted with formatMoney() only.

import type { BugType, GameEvent } from '../../../../shared/types';
import { formatMoney } from '../../../../shared/money';

const BUG_LABEL: Record<BugType, string> = {
  money: 'money bug',
  security: 'security bug',
  outage: 'outage bug',
};

export function eventText(event: GameEvent): string {
  switch (event.kind) {
    case 'incident':
      return event.text;
    case 'ping':
      return `${event.playerName} wants a second opinion on ${event.prTitle}`;
    case 'merge':
      return event.byName === null
        ? `Auto-merged: ${event.prTitle}`
        : `${event.byName} merged ${event.prTitle}`;
    case 'decline':
      return `${event.byName} declined ${event.prTitle} as a ${BUG_LABEL[event.bugType]}`;
    case 'catch':
      return `${event.byName} caught a ${BUG_LABEL[event.bugType]} in ${event.prTitle}: +${formatMoney(event.bonus)}`;
  }
}
