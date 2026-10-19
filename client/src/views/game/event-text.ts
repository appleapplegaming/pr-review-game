// Plain-text wording for one game event, shared by toasts and the activity feed.
//
// Incidents show only their text. The incident text does not name the PR that caused it, and that
// is deliberate (plan.md, Resolved Decision 4). Money is formatted with formatMoney() only.

import type { BugType, GameEvent } from '../../../../shared/types';
import { formatMoney } from '../../../../shared/money';

/** The bug type with its article, so "an outage bug" reads right. */
const BUG_LABEL: Record<BugType, string> = {
  money: 'a money bug',
  security: 'a security bug',
  outage: 'an outage bug',
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
      // The verdict is the only outcome revealed. The real bug type stays hidden until the postmortem.
      return event.verdict === 'clean'
        ? `${event.byName} declined ${event.prTitle} as ${BUG_LABEL[event.bugType]}: no bug there, its value is lost`
        : `${event.byName} declined ${event.prTitle} as ${BUG_LABEL[event.bugType]}: a real bug, but no bonus`;
    case 'comment':
      return event.onLine
        ? `${event.byName} commented on a line in ${event.prTitle}`
        : `${event.byName} commented on ${event.prTitle}`;
    case 'catch':
      return `${event.byName} caught ${BUG_LABEL[event.bugType]} in ${event.prTitle}: +${formatMoney(event.bonus)}`;
  }
}
