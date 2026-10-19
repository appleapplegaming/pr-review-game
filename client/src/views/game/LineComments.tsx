// What sits under one diff line: the comments on that line, and the box when the line is open.
// Renders nothing for a line that has no comments and is not open, so quiet lines add no rows.

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
  if (comments.length === 0 && !selected) return null;
  return (
    <div className={styles.lineThread}>
      <CommentThread comments={comments} />
      {selected && (
        <CommentBox label={`Comment on line ${line}`} connected={connected} onSubmit={onSubmit} />
      )}
    </div>
  );
}
