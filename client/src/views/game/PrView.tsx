// The PR being reviewed: title, description, countdown, resolution and the diff.
//
// Slots left for later tasks (empty containers until they land):
//  - actionBar (Task 17): the Merge / Decline bar. Rendered in the [data-slot="action-bar"] box.
//  - prComments (Task 18): the whole-PR comment box and thread.
//  - onLineSelect / renderAfterLine (Task 18): forwarded to DiffView for per-line comments.

import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
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
  selectedLine?: number | null;
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
  selectedLine,
  onLineSelect,
  renderAfterLine,
}: PrViewProps) {
  const timer = countdown({ expiresAt: pr.expiresAt, spawnAt: pr.spawnAt, now });
  const others = viewerNames(pr.viewers, players, myId);
  const open = pr.status === 'open';
  const articleRef = useRef<HTMLElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const wasOpen = useRef({ id: pr.id, open });

  // Merging or declining removes the buttons the player was using, and focus would drop to <body>.
  // When this PR resolves, move focus to its heading, unless focus is already somewhere real (a
  // comment box, say) that another player's action must not steal it from.
  useEffect(() => {
    const before = wasOpen.current;
    wasOpen.current = { id: pr.id, open };
    if (before.id !== pr.id || !before.open || open) return;
    const active = document.activeElement;
    if (active === null || active === document.body) titleRef.current?.focus();
  }, [pr.id, open]);

  // On a phone the action bar is fixed to the screen. Track its height, so the article can leave
  // room for it at the bottom. The bar's height changes when a rejection notice appears.
  useEffect(() => {
    const article = articleRef.current;
    const bar = barRef.current;
    if (article === null || bar === null || typeof ResizeObserver === 'undefined') return;
    const sync = () => article.style.setProperty('--actionbar-h', `${bar.offsetHeight}px`);
    const observer = new ResizeObserver(sync);
    observer.observe(bar);
    sync();
    return () => observer.disconnect();
  }, []);

  return (
    <article ref={articleRef} className={styles.pr} aria-labelledby="pr-title">
      <header className={styles.header}>
        <p className={styles.kicker}>
          {pr.area} · {pr.author}
        </p>
        <h2 id="pr-title" ref={titleRef} tabIndex={-1} className={styles.title}>
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

      <DiffView
        diff={pr.diff}
        selectedLine={selectedLine}
        onLineSelect={onLineSelect}
        renderAfterLine={renderAfterLine}
      />

      <div ref={barRef} className={styles.actionBar} data-slot="action-bar">
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
