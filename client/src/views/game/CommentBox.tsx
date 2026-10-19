// The comment form: a textarea, a live count of characters left and a submit button.
// Used under a diff line and for the whole PR. The text is sent as typed, never as HTML.

import { useState } from 'preact/hooks';
import { charsLeft, checkComment } from './comment-rules';
import styles from './Comments.module.css';

export interface CommentBoxProps {
  label: string;
  connected?: boolean;
  /** Returns true when the message was sent. The box clears only then, so a refused send keeps the text. */
  onSubmit(text: string): boolean;
}

export function CommentBox({ label, connected = true, onSubmit }: CommentBoxProps) {
  const [text, setText] = useState('');
  const check = checkComment(text);
  const left = charsLeft(text);
  const canSend = check.ok && connected;

  return (
    <form
      className={styles.box}
      onSubmit={(event) => {
        event.preventDefault();
        if (!check.ok || !connected) return;
        if (onSubmit(check.text)) setText('');
      }}
    >
      <textarea
        className={styles.input}
        aria-label={label}
        rows={2}
        placeholder="Add a comment"
        value={text}
        onInput={(event) => setText(event.currentTarget.value)}
      />
      <div className={styles.boxFooter}>
        <span className={left < 0 ? styles.countOver : styles.count}>
          {left >= 0 ? `${left} characters left` : `${-left} characters over the limit`}
        </span>
        <button type="submit" className={styles.submit} disabled={!canSend}>
          Comment
        </button>
      </div>
    </form>
  );
}
