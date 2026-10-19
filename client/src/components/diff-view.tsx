// Renders a PR diff. Line numbers come from parseDiff() in shared/, the same numbering the
// engine uses for bug.lines and comment lines. Never array positions.
//
// Hooks for later tasks (no comment UI lives here):
//  - onLineSelect: makes each line a button. Without it the rows are plain and nothing is clickable.
//  - selectedLine: the line index shown as pressed.
//  - renderAfterLine: returns content placed as its own row directly under a line (Task 18 uses it
//    for the comment box and the thread under a line).

import type { ComponentChildren } from 'preact';
import { useRef, useState } from 'preact/hooks';
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
const LABEL: Record<DiffLine['kind'], string> = {
  add: 'added',
  remove: 'removed',
  context: 'unchanged',
};

// Only the line-number control is a tab stop (roving tabindex, one group); the whole row is also
// a pointer target. Up/Down/Home/End move between line controls.
export function DiffView({
  diff,
  selectedLine = null,
  onLineSelect,
  renderAfterLine,
}: DiffViewProps) {
  const lines = parseDiff(diff);
  const interactive = onLineSelect !== undefined;
  const listRef = useRef<HTMLOListElement>(null);
  const [focusLine, setFocusLine] = useState<number | null>(null);

  const indices = lines.map((l) => l.index);
  const tabStop =
    focusLine !== null && indices.includes(focusLine)
      ? focusLine
      : selectedLine !== null && indices.includes(selectedLine)
        ? selectedLine
        : (indices[0] ?? null);

  function moveTo(index: number) {
    setFocusLine(index);
    listRef.current
      ?.querySelector<HTMLElement>(`[data-line="${index}"] [data-line-control]`)
      ?.focus();
  }

  function onKeyDown(e: KeyboardEvent, position: number) {
    let next: number;
    if (e.key === 'ArrowDown') next = Math.min(position + 1, indices.length - 1);
    else if (e.key === 'ArrowUp') next = Math.max(position - 1, 0);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = indices.length - 1;
    else return;
    e.preventDefault();
    const target = indices[next];
    if (target !== undefined) moveTo(target);
  }

  return (
    <ol className={styles.diff} aria-label="Diff" ref={listRef}>
      {lines.map((line, position) => {
        const after = renderAfterLine?.(line);
        const selected = selectedLine === line.index;
        return (
          <li
            key={line.index}
            className={styles.row}
            data-line={line.index}
            data-kind={line.kind}
            data-selected={interactive && selected ? 'true' : undefined}
          >
            <div
              className={interactive ? styles.rowInteractive : styles.rowBody}
              onClick={interactive ? () => onLineSelect(line) : undefined}
            >
              {interactive ? (
                <button
                  type="button"
                  data-line-control
                  className={styles.gutterButton}
                  aria-pressed={selected}
                  aria-label={`Line ${line.index}, ${LABEL[line.kind]}`}
                  tabIndex={tabStop === line.index ? 0 : -1}
                  onFocus={() => setFocusLine(line.index)}
                  onKeyDown={(e) => onKeyDown(e, position)}
                >
                  {line.index}
                </button>
              ) : (
                <span className={styles.gutter}>{line.index}</span>
              )}
              <span className={styles.marker} aria-hidden="true">
                {SIGN[line.kind]}
              </span>
              <span className={styles.sr}>{WORD[line.kind]}</span>
              <span className={styles.code}>{line.text}</span>
            </div>
            {after !== undefined && after !== null && <div className={styles.after}>{after}</div>}
          </li>
        );
      })}
    </ol>
  );
}
