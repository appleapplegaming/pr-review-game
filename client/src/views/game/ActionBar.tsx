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
import { useMediaQuery } from '../../net/use-media';
import {
  DECLINE_HINT,
  DECLINE_OPTIONS,
  MERGE_ARM_MS,
  canAct,
  errorNotice,
  isTypingTarget,
  neighbourPrId,
  pausedReason,
  nextSheetChoice,
  shortcutFor,
  type Baseline,
} from './action-rules';
import styles from './ActionBar.module.css';

export interface ActionBarProps {
  pr: PublicPr;
  /** The open queue, in the order the player moves through it with j and k. */
  queue: readonly PublicPr[];
  onSelect(prId: string): void;
  /** False when the PR is hidden (a phone on another tab), so m and d must not act on it. */
  keysActive: boolean;
}

export function ActionBar({ pr, queue, onSelect, keysActive }: ActionBarProps) {
  const conn = useStore((s) => s.conn);
  const error = useStore((s) => s.error);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [baseline, setBaseline] = useState<Baseline | null>(null);
  const [armed, setArmed] = useState(false);
  const coarse = useMediaQuery('(pointer: coarse)');
  const sheetRef = useRef<HTMLDivElement>(null);
  const declineRef = useRef<HTMLButtonElement>(null);

  const enabled = canAct(pr, conn);

  // The keydown handler reads the latest values through this ref, so one listener serves every render.
  const latest = useRef({ pr, queue, onSelect, enabled, sheetOpen, keysActive });
  latest.current = { pr, queue, onSelect, enabled, sheetOpen, keysActive };

  // Errors older than the selection of this PR are not shown for it. Acting also moves the baseline,
  // so an error only shows once, for the action that caused it.
  useEffect(() => {
    setBaseline({ prId: pr.id, seq: store.getState().errorSeq });
    setArmed(false);
  }, [pr.id]);

  // An armed merge (touch screens) reverts if the second tap does not come.
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), MERGE_ARM_MS);
    return () => clearTimeout(timer);
  }, [armed]);

  function send(prId: string, msg: ClientMsg): void {
    setBaseline({ prId, seq: store.getState().errorSeq });
    net.send(msg);
  }

  function merge(): void {
    if (!latest.current.enabled) return;
    setArmed(false);
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
          if (!current.keysActive) return;
          const id = neighbourPrId(current.queue, current.pr.id, action.kind === 'next' ? 1 : -1);
          if (id !== null && id !== current.pr.id) current.onSelect(id);
          break;
        }
        case 'merge':
          if (!current.enabled || !current.keysActive) return;
          event.preventDefault();
          merge();
          break;
        case 'decline':
          if (!current.enabled || !current.keysActive) return;
          event.preventDefault();
          setSheetOpen(true);
          break;
        case 'close':
          if (!current.sheetOpen) return;
          event.preventDefault();
          setSheetOpen(false);
          // The sheet's choices leave the page when it closes, so hand focus back to its trigger.
          declineRef.current?.focus();
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

  // While the sheet is open, Tab and Shift+Tab cycle through its choices instead of leaving it.
  // Escape (handled above) closes it and returns focus to the Decline button.
  function trapTab(event: KeyboardEvent): void {
    if (event.key !== 'Tab' || sheetRef.current === null) return;
    const choices = Array.from(sheetRef.current.querySelectorAll('button'));
    const current = choices.indexOf(document.activeElement as HTMLButtonElement);
    const next = nextSheetChoice(current, choices.length, event.shiftKey);
    if (next < 0) return;
    event.preventDefault();
    choices[next]?.focus();
  }

  function onMergeClick(): void {
    if (coarse && !armed) {
      setArmed(true);
      return;
    }
    merge();
  }

  const notice = errorNotice(error, baseline, pr.id);
  const paused = pr.status === 'open' ? pausedReason(conn) : '';
  if (pr.status !== 'open' && notice === null) return null;

  return (
    <div className={styles.bar}>
      {notice !== null && (
        <p role="alert" className={styles.notice}>
          {notice}
        </p>
      )}

      {pr.status === 'open' && (
        <p id="action-paused" role="status" className={styles.paused}>
          {paused}
        </p>
      )}

      {pr.status === 'open' && (
        <div className={styles.buttons}>
          <button
            type="button"
            className={styles.merge}
            disabled={!enabled}
            aria-describedby={paused !== '' ? 'action-paused' : undefined}
            onClick={onMergeClick}
          >
            {armed ? 'Tap again to merge' : 'Merge'}
            {!coarse && <kbd className={styles.key}>m</kbd>}
          </button>

          <div className={styles.declineWrap}>
            <button
              type="button"
              ref={declineRef}
              className={styles.decline}
              disabled={!enabled}
              aria-describedby={paused !== '' ? 'action-paused' : undefined}
              aria-expanded={sheetOpen}
              aria-controls="decline-sheet"
              onClick={() => setSheetOpen((open) => !open)}
            >
              Decline ▾{!coarse && <kbd className={styles.key}>d</kbd>}
            </button>

            {sheetOpen && (
              <div
                id="decline-sheet"
                ref={sheetRef}
                role="group"
                aria-label="Decline: pick the bug type"
                className={styles.sheet}
                onKeyDown={trapTab}
              >
                <p className={styles.sheetTitle}>What is wrong with it?</p>
                <p className={styles.sheetHint}>{DECLINE_HINT}</p>
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
