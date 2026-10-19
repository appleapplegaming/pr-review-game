// Renders a PR diff. Line numbers come from parseDiff() in shared/, the same numbering the
// engine uses for bug.lines and comment lines. Never array positions.
//
// Hooks for later tasks (no comment UI lives here):
//  - onLineSelect: makes each line a button. Without it the rows are plain and nothing is clickable.
//  - selectedLine: the line index shown as pressed.
//  - renderAfterLine: returns content placed as its own row directly under a line (Task 18 uses it
//    for the comment box and the thread under a line).

import type { ComponentChildren } from 'preact';
import { parseDiff, type DiffLine } from '../../../shared/diff';
import styles from './diff-view.module.css';

export interface DiffViewProps {
  diff: string;
  selectedLine?: number | null;
  onLineSelect?: (line: DiffLine) => void;
  renderAfterLine?: (line: DiffLine) => ComponentChildren;
}

const SIGN: Record<DiffLine['kind'], string> = { add: '+', remove: '−', context: ' ' };
const WORD: Record<DiffLine['kind'], string> = { add: 'added: ', remove: 'removed: ', context: '' };

export function DiffView({
  diff,
  selectedLine = null,
  onLineSelect,
  renderAfterLine,
}: DiffViewProps) {
  const lines = parseDiff(diff);
  const interactive = onLineSelect !== undefined;

  return (
    <ol className={styles.diff} aria-label="Diff">
      {lines.map((line) => {
        const content = (
          <>
            <span className={styles.gutter}>{line.index}</span>
            <span className={styles.marker} aria-hidden="true">
              {SIGN[line.kind]}
            </span>
            <span className={styles.sr}>{WORD[line.kind]}</span>
            <span className={styles.code}>{line.text}</span>
          </>
        );
        const after = renderAfterLine?.(line);
        return (
          <li key={line.index} className={styles.row} data-line={line.index} data-kind={line.kind}>
            {interactive ? (
              <button
                type="button"
                className={styles.rowButton}
                aria-pressed={selectedLine === line.index}
                onClick={() => onLineSelect(line)}
              >
                {content}
              </button>
            ) : (
              <div className={styles.rowBody}>{content}</div>
            )}
            {after !== undefined && after !== null && <div className={styles.after}>{after}</div>}
          </li>
        );
      })}
    </ol>
  );
}
