// The whole-PR discussion: the second-opinion ping, the comments on the PR as a whole and the box
// to add one. Goes in PrView's `prComments` slot. Comments stay open after the PR resolves; the
// ping only works while it is open.

import type { Comment } from '../../../../shared/types';
import { CommentBox } from './CommentBox';
import { CommentThread } from './CommentThread';
import { commentsOn, pingCooldownLeft } from './comment-rules';
import { PingButton } from './PingButton';
import styles from './Comments.module.css';

export interface PrCommentsProps {
  /** Every comment on the PR. Only the whole-PR ones (line null) are shown here. */
  comments: readonly Comment[];
  open: boolean;
  connected: boolean;
  now: number;
  /** Server time of this tab's last ping on this PR, or undefined. */
  lastPingAt: number | undefined;
  onPing(): boolean;
  onSubmit(text: string): boolean;
}

export function PrComments({
  comments,
  open,
  connected,
  now,
  lastPingAt,
  onPing,
  onSubmit,
}: PrCommentsProps) {
  return (
    <section className={styles.section} aria-label="PR discussion">
      <PingButton
        cooldownLeftMs={pingCooldownLeft(lastPingAt, now)}
        disabled={!open || !connected}
        onPing={onPing}
      />
      <CommentThread comments={commentsOn(comments, null)} />
      <CommentBox label="Comment on this PR" connected={connected} onSubmit={onSubmit} />
    </section>
  );
}
