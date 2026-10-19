// A list of comments, newest last. Each comment is plain text: an author and a body.

import type { Comment } from '../../../../shared/types';
import styles from './Comments.module.css';

export interface CommentThreadProps {
  comments: readonly Comment[];
}

export function CommentThread({ comments }: CommentThreadProps) {
  if (comments.length === 0) return null;
  return (
    <ul className={styles.thread} aria-label="Comments">
      {comments.map((comment) => (
        <li key={comment.id} className={styles.item}>
          <p className={styles.author}>{comment.playerName}</p>
          <p className={styles.text}>{comment.text}</p>
        </li>
      ))}
    </ul>
  );
}
