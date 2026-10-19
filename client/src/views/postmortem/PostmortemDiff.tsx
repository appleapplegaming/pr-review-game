// The PR diff with the bug lines marked, inside a <details>. Numbering comes from parseDiff() in
// shared/, the same numbering the engine uses for bug.lines. A bug line gets a visible "BUG" tag
// and a screen-reader prefix, so the highlight does not rely on colour alone. The lines sit in one
// <pre>, not a list, so a screen reader does not announce "list item 12 of 40" for every line.
//
// Short diffs are open and complete. Long diffs show only the bug lines with 3 lines of context,
// and a button reveals the rest. `compact` closes the <details> to keep small cards short.

import { useState } from 'preact/hooks';
import { parseDiff, type DiffLineKind } from '../../../../shared/diff';
import { SHORT_DIFF_LINES, diffSummary, visibleLineNumbers } from './postmortem-rules';
import styles from './postmortem.module.css';

const SIGN: Record<DiffLineKind, string> = { add: '+', remove: '−', context: ' ' };
const WORD: Record<DiffLineKind, string> = { add: 'added: ', remove: 'removed: ', context: '' };

interface Props {
  diff: string;
  bugLines: Set<number>;
  /** Start closed, for cards where the diff is secondary. */
  compact?: boolean;
}

export function PostmortemDiff({ diff, bugLines, compact = false }: Props) {
  const [showAll, setShowAll] = useState(false);
  const lines = parseDiff(diff);
  const isLong = lines.length > SHORT_DIFF_LINES && bugLines.size > 0;
  const keep = visibleLineNumbers(lines.length, bugLines);
  const excerpt = isLong && !showAll;

  const rows: preact.ComponentChildren[] = [];
  let hidden = 0;
  const flushGap = (beforeIndex: number) => {
    if (hidden === 0) return;
    rows.push(
      <span key={`gap-${beforeIndex}`} className={styles.diffGap}>
        {hidden === 1 ? '1 line not shown' : `${hidden} lines not shown`}
      </span>,
    );
    hidden = 0;
  };
  for (const line of lines) {
    if (excerpt && !keep.has(line.index)) {
      hidden++;
      continue;
    }
    flushGap(line.index);
    const isBug = bugLines.has(line.index);
    rows.push(
      <span
        key={line.index}
        className={styles.diffRow}
        data-kind={line.kind}
        data-bug={isBug ? 'yes' : 'no'}
      >
        <span className={styles.gutter}>{line.index}</span>
        <span className={styles.marker} aria-hidden="true">
          {SIGN[line.kind]}
        </span>
        <span className={styles.sr}>{`${isBug ? 'Bug line, ' : ''}${WORD[line.kind]}`}</span>
        <span className={styles.code}>{line.text}</span>
        {isBug && <span className={styles.bugTag}>BUG</span>}
      </span>,
    );
  }
  flushGap(lines.length + 1);

  return (
    <details className={styles.diffBox} open={!compact}>
      <summary className={styles.diffSummary}>
        {diffSummary(lines.length, bugLines.size, excerpt)}
      </summary>
      <pre className={styles.diff} tabIndex={0} role="group" aria-label="Diff lines">
        {rows}
      </pre>
      {isLong && (
        <button type="button" className={styles.linkButton} onClick={() => setShowAll(!showAll)}>
          {showAll ? 'Show only the bug lines' : `Show all ${lines.length} lines`}
        </button>
      )}
    </details>
  );
}
