// The comment form: a textarea, a live count of characters left and a submit button.
// Used under a diff line and for the whole PR. The text is sent as typed, never as HTML.

import { useId, useRef, useState } from 'preact/hooks';
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
  const countId = useId();
  const reasonId = useId();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [sent, setSent] = useState('');
  // Why Comment is disabled, shown as text. Empty text has no reason: the placeholder says it.
  const reason = !connected ? 'Offline: comments are paused' : left < 0 ? 'Too long to send' : '';

  return (
    <form
      className={styles.box}
      onSubmit={(event) => {
        event.preventDefault();
        if (!check.ok || !connected) return;
        if (onSubmit(check.text)) {
          setText('');
          // The send is announced politely, and focus stays in the box for the next comment.
          setSent('Comment sent');
          inputRef.current?.focus();
        }
      }}
    >
      <textarea
        className={styles.input}
        ref={inputRef}
        aria-label={label}
        aria-describedby={`${countId}${reason !== '' ? ` ${reasonId}` : ''}`}
        rows={2}
        placeholder="Add a comment"
        value={text}
        onInput={(event) => {
          setText(event.currentTarget.value);
          if (sent !== '') setSent('');
        }}
      />
      <div className={styles.boxFooter}>
        <span id={countId} className={left < 0 ? styles.countOver : styles.count}>
          {left >= 0 ? `${left} characters left` : `${-left} characters over the limit`}
        </span>
        {reason !== '' && (
          <span id={reasonId} className={styles.count}>
            {reason}
          </span>
        )}
        <button type="submit" className={styles.submit} disabled={!canSend}>
          Comment
        </button>
      </div>
      <p role="status" className={styles.sr}>
        {sent}
      </p>
    </form>
  );
}
