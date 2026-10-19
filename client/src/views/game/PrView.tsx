// The PR being reviewed: title, description, countdown, resolution and the diff.
//
// Slots left for later tasks (empty containers until they land):
//  - actionBar (Task 17): the Merge / Decline bar. Rendered in the [data-slot="action-bar"] box.
//  - prComments (Task 18): the whole-PR comment box and thread.
//  - onLineSelect / renderAfterLine (Task 18): forwarded to DiffView for per-line comments.

import type { ComponentChildren } from 'preact';
import type { DiffLine } from '../../../../shared/diff';
import type { PublicPlayer, PublicPr } from '../../../../shared/types';
import { DiffView } from '../../components/diff-view';
import { CountdownRing } from '../../components/countdown-ring';
import { countdown, viewerNames } from './queue-rules';
import styles from './pr-view.module.css';

export interface PrViewProps {
  pr: PublicPr;
  players: readonly PublicPlayer[];
  myId: string | null;
  now: number;
  actionBar?: ComponentChildren;
  prComments?: ComponentChildren;
  onLineSelect?: (line: DiffLine) => void;
  renderAfterLine?: (line: DiffLine) => ComponentChildren;
}

export function PrView({
  pr,
  players,
  myId,
  now,
  actionBar,
  prComments,
  onLineSelect,
  renderAfterLine,
}: PrViewProps) {
  const timer = countdown({ expiresAt: pr.expiresAt, spawnAt: pr.spawnAt, now });
  const others = viewerNames(pr.viewers, players, myId);
  const open = pr.status === 'open';

  return (
    <article className={styles.pr} aria-labelledby="pr-title">
      <header className={styles.header}>
        <p className={styles.kicker}>
          {pr.area} · {pr.author}
        </p>
        <h2 id="pr-title" className={styles.title}>
          {pr.title}
        </h2>
        <div className={styles.meta}>
          {open ? (
            <CountdownRing fraction={timer.fraction} label={timer.label} urgent={timer.urgent} />
          ) : null}
          {others.length > 0 && (
            <p className={styles.viewers}>
              <span aria-hidden="true">👀</span> {others.join(', ')}{' '}
              {others.length === 1 ? 'is' : 'are'} looking at this PR
            </p>
          )}
        </div>
      </header>

      {!open && <Resolution pr={pr} />}

      <p className={styles.description}>{pr.description}</p>

      <DiffView diff={pr.diff} onLineSelect={onLineSelect} renderAfterLine={renderAfterLine} />

      <div className={styles.actionBar} data-slot="action-bar">
        {actionBar}
      </div>
      <div className={styles.prComments} data-slot="pr-comments">
        {prComments}
      </div>
    </article>
  );
}

function Resolution({ pr }: { pr: PublicPr }) {
  const r = pr.resolution;
  let text = pr.status === 'merged' ? 'Merged.' : 'Declined.';
  if (r?.kind === 'merged') {
    text =
      r.byName !== null ? `Merged by ${r.byName}.` : 'Merged automatically when the timer ran out.';
  } else if (r?.kind === 'declined') {
    text = `Declined by ${r.byName}.`;
  }
  return (
    <p role="status" className={styles.resolution}>
      {text}
    </p>
  );
}
