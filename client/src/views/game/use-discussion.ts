// Per-screen state for comments and pings: which diff line is open, and when this tab last
// pinged each PR. Kept in GameScreen (one call), so it survives switching between PRs.

import { useState } from 'preact/hooks';
import type { DiffLine } from '../../../../shared/diff';
import { selectedLineFor, toggleLine, type LineSelection } from './comment-rules';

export function useDiscussion(prId: string | null) {
  const [line, setLine] = useState<LineSelection | null>(null);
  const [pings, setPings] = useState<Record<string, number>>({});

  return {
    selectedLine: selectedLineFor(line, prId),
    selectLine(diffLine: DiffLine) {
      const id = prId;
      if (id === null) return;
      setLine((current) => toggleLine(current, id, diffLine.index));
    },
    lastPingAt: prId === null ? undefined : pings[prId],
    recordPing(id: string, at: number) {
      setPings((current) => ({ ...current, [id]: at }));
    },
  };
}
