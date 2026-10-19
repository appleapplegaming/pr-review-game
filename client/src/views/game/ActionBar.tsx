// The merge and decline bar for the PR being reviewed. Rendered by PrView into its action-bar slot.
//
// Merge is one tap. Decline opens a sheet of bug types, and nothing is sent until one is picked.
// Keyboard: j/k move through the queue, m merges, d opens the decline sheet, Escape closes it. Keys
// are ignored while the player types in a field (comment boxes, from Task 18).
//
// Rejections: any server error the player caused while this PR is selected is shown here, for
// example "Already merged by Sara" when another player merged first, or a ping cooldown message.

import { useEffect, useRef, useState } from 'preact/hooks';
import type { ClientMsg } from '../../../../shared/protocol';
import type { BugType, PublicPr } from '../../../../shared/types';
import { net } from '../../net/live';
import { store } from '../../net/store';
import { useStore } from '../../net/use-store';
import {
  DECLINE_OPTIONS,
  canAct,
  errorNotice,
  isTypingTarget,
  neighbourPrId,
  shortcutFor,
  type Baseline,
} from './action-rules';
import styles from './ActionBar.module.css';

export interface ActionBarProps {
  pr: PublicPr;
  /** The open queue, in the order the player moves through it with j and k. */
  queue: readonly PublicPr[];
  onSelect(prId: string): void;
}

export function ActionBar({ pr, queue, onSelect }: ActionBarProps) {
  const conn = useStore((s) => s.conn);
  const error = useStore((s) => s.error);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [baseline, setBaseline] = useState<Baseline | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  const enabled = canAct(pr, conn);

  // The keydown handler reads the latest values through this ref, so one listener serves every render.
  const latest = useRef({ pr, queue, onSelect, enabled, sheetOpen });
  latest.current = { pr, queue, onSelect, enabled, sheetOpen };

  // Errors older than the selection of this PR are not shown for it. Acting also moves the baseline,
  // so an error only shows once, for the action that caused it.
  useEffect(() => {
    setBaseline({ prId: pr.id, seq: store.getState().errorSeq });
  }, [pr.id]);

  function send(prId: string, msg: ClientMsg): void {
    setBaseline({ prId, seq: store.getState().errorSeq });
    net.send(msg);
  }

  function merge(): void {
    if (!latest.current.enabled) return;
    send(latest.current.pr.id, { t: 'merge', prId: latest.current.pr.id });
  }

  function decline(bugType: BugType): void {
    const prId = latest.current.pr.id;
    setSheetOpen(false);
    send(prId, { t: 'decline', prId, bugType });
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.defaultPrevented || event.repeat) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (isTypingTarget(target)) return;

      const action = shortcutFor(event.key);
      if (action === null) return;
      const current = latest.current;

      switch (action.kind) {
        case 'next':
        case 'prev': {
          const id = neighbourPrId(current.queue, current.pr.id, action.kind === 'next' ? 1 : -1);
          if (id !== null && id !== current.pr.id) current.onSelect(id);
          break;
        }
        case 'merge':
          if (!current.enabled) return;
          event.preventDefault();
          merge();
          break;
        case 'decline':
          if (!current.enabled) return;
          event.preventDefault();
          setSheetOpen(true);
          break;
        case 'close':
          if (!current.sheetOpen) return;
          event.preventDefault();
          setSheetOpen(false);
          break;
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Focus the first choice when the sheet opens, so the keyboard can pick a type straight away.
  useEffect(() => {
    if (sheetOpen) sheetRef.current?.querySelector('button')?.focus();
  }, [sheetOpen]);

  const notice = errorNotice(error, baseline, pr.id);
  if (pr.status !== 'open' && notice === null) return null;

  return (
    <div className={styles.bar}>
      {notice !== null && (
        <p role="alert" className={styles.notice}>
          {notice}
        </p>
      )}

      {pr.status === 'open' && (
        <div className={styles.buttons}>
          <button type="button" className={styles.merge} disabled={!enabled} onClick={merge}>
            Merge <kbd className={styles.key}>m</kbd>
          </button>

          <div className={styles.declineWrap}>
            <button
              type="button"
              className={styles.decline}
              disabled={!enabled}
              aria-expanded={sheetOpen}
              aria-controls="decline-sheet"
              onClick={() => setSheetOpen((open) => !open)}
            >
              Decline ▾ <kbd className={styles.key}>d</kbd>
            </button>

            {sheetOpen && (
              <div
                id="decline-sheet"
                ref={sheetRef}
                role="group"
                aria-label="Decline: pick the bug type"
                className={styles.sheet}
              >
                <p className={styles.sheetTitle}>What is wrong with it?</p>
                {DECLINE_OPTIONS.map((option) => (
                  <button
                    key={option.bugType}
                    type="button"
                    className={styles.option}
                    onClick={() => decline(option.bugType)}
                  >
                    <span aria-hidden="true">{option.icon}</span> {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
