// The PR diff with the bug lines marked. Numbering comes from parseDiff() in shared/, the same
// numbering the engine uses for bug.lines. A bug line gets a visible "BUG" tag and a screen-reader
// prefix, so the highlight does not rely on colour alone.

import { parseDiff, type DiffLineKind } from '../../../../shared/diff';
import styles from './postmortem.module.css';

const SIGN: Record<DiffLineKind, string> = { add: '+', remove: '−', context: ' ' };
const WORD: Record<DiffLineKind, string> = { add: 'added: ', remove: 'removed: ', context: '' };

export function PostmortemDiff({ diff, bugLines }: { diff: string; bugLines: Set<number> }) {
  const lines = parseDiff(diff);
  return (
    <ol className={styles.diff} aria-label="Diff with the bug lines highlighted">
      {lines.map((line) => {
        const isBug = bugLines.has(line.index);
        return (
          <li
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
          </li>
        );
      })}
    </ol>
  );
}
