// One place for what each connection state says to the player. Used by the app banner and the
// landing form, so the two never disagree.

import type { ConnState } from '../net/store';

export interface ConnCopy {
  /** Short label for the banner. */
  label: string;
  /** Longer explanation for the landing form, or null when connected. */
  detail: string | null;
  /** True when a manual Retry makes sense. */
  canRetry: boolean;
}

export const CONN_COPY: Record<ConnState, ConnCopy> = {
  connecting: { label: 'Connecting…', detail: 'Connecting to the server…', canRetry: false },
  open: { label: 'Connected', detail: null, canRetry: false },
  reconnecting: {
    label: 'Reconnecting…',
    detail: 'Connection dropped. Reconnecting automatically, or retry now.',
    canRetry: true,
  },
  closed: {
    label: 'Lost connection',
    detail: 'Lost connection to the server. Retry to try again.',
    canRetry: true,
  },
};
