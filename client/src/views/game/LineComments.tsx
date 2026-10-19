// What sits under one diff line: the comments on that line, and the box when the line is open.
// Renders nothing for a line that has no comments and is not open, so quiet lines add no rows.

import { useEffect, useRef } from 'preact/hooks';
import type { Comment } from '../../../../shared/types';
import { CommentBox } from './CommentBox';
import { CommentThread } from './CommentThread';
import styles from './Comments.module.css';

export interface LineCommentsProps {
  line: number;
  comments: readonly Comment[];
  selected: boolean;
  connected: boolean;
  onSubmit(text: string): boolean;
}

export function LineComments({ line, comments, selected, connected, onSubmit }: LineCommentsProps) {
  const ref = useRef<HTMLDivElement>(null);
  const wasSelected = useRef(false);

  // When the line becomes selected, bring the box into view above any fixed phone chrome and
  // put the cursor in it. CommentBox is not edited here, so the textarea is found by query.
  useEffect(() => {
    const opened = selected && !wasSelected.current;
    wasSelected.current = selected;
    if (!opened || !ref.current) return;
    ref.current.scrollIntoView?.({ block: 'nearest' });
    ref.current.querySelector<HTMLTextAreaElement>('textarea')?.focus({ preventScroll: true });
  }, [selected]);

  if (comments.length === 0 && !selected) return null;
  return (
    <div
      className={styles.lineThread}
      ref={ref}
      style={{
        scrollMarginBottom: 'calc(var(--actionbar-h, 0px) + var(--tabbar-total, 0px) + 1rem)',
      }}
    >
      <CommentThread comments={comments} />
      {selected && (
        <CommentBox label={`Comment on line ${line}`} connected={connected} onSubmit={onSubmit} />
      )}
    </div>
  );
}
