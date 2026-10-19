// The game screen: queue on the left, the selected PR in the middle, a sidebar on the right.
// From 900 px wide the three columns sit side by side. Narrower, one column shows at a time, picked
// by the tab bar (queue, PR or dashboard). Hidden columns stay mounted, so drafts and the open diff
// line survive a tab switch.
//
// This file owns selection, the clock tick and presence. Presence sends `open` for the selected PR
// from an effect, so it is sent once per selection and again after every reconnect.
//
// Slots left for other tasks:
//  - Task 17 action bar: PrView `actionBar` prop (rendered in the PR column).
//  - Task 18 comments: PrView `prComments` and the DiffView hooks (`onLineSelect`, `renderAfterLine`).
//  - Toasts are mounted once by app.tsx, not here.

import { useEffect, useRef, useState } from 'preact/hooks';
import { useSyncExternalStore } from 'preact/compat';
import { config } from '../../../../shared/config';
import { formatMoney } from '../../../../shared/money';
import { net } from '../../net/live';
import { serverTime } from '../../net/store';
import { useMediaQuery } from '../../net/use-media';
import { useStore } from '../../net/use-store';
import { openQueue } from './queue-rules';
import { ActionBar } from './ActionBar';
import { ActivityFeed } from './ActivityFeed';
import { Dashboard } from './Dashboard';
import { LineComments } from './LineComments';
import { PrComments } from './PrComments';
import { PrView } from './PrView';
import { Queue } from './Queue';
import { TabBar } from './TabBar';
import { formatClock, timeLeftMs } from './quarter-time';
import { commentsOn } from './comment-rules';
import { pingTracker } from './ping-dot';
import { keysActive, pingDotVisible, type PhoneTab } from './tab-rules';
import { useDiscussion } from './use-discussion';
import { useTyping } from './use-typing';
import styles from './GameScreen.module.css';

export function GameScreen() {
  const room = useStore((s) => s.room);
  const conn = useStore((s) => s.conn);
  const myId = useStore((s) => s.session?.playerId ?? null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [now, setNow] = useState(() => serverTime());
  const [tab, setTab] = useState<PhoneTab>('queue');
  const wide = useMediaQuery('(min-width: 900px)');
  const pings = useSyncExternalStore(pingTracker.subscribe, pingTracker.getState).unseen;

  useTyping();

  // A ping is seen once the PR tab is up, or at once on a wide screen where the PR is always shown.
  useEffect(() => {
    if (wide || tab === 'pr') pingTracker.clear();
  }, [wide, tab, pings]);

  // One shared ticker for every countdown on the screen.
  useEffect(() => {
    const timer = setInterval(() => setNow(serverTime()), config.tickMs);
    return () => clearInterval(timer);
  }, []);

  // Set when a card is chosen, so focus follows the PR once the PR tab is on screen (phone).
  const focusPrAfterOpen = useRef(false);
  useEffect(() => {
    if (!focusPrAfterOpen.current || wide || tab !== 'pr') return;
    focusPrAfterOpen.current = false;
    document.querySelector<HTMLElement>('#pr-title')?.focus();
  }, [tab, wide, selectedId]);

  const queue = room === null ? [] : openQueue(room.prs);
  // Keep the chosen PR even after it resolves (it shows the result). Fall back to the top of the
  // queue when nothing is chosen or the chosen PR has left the room.
  const selected =
    room === null ? null : (room.prs.find((p) => p.id === selectedId) ?? queue[0] ?? null);

  const selectedPrId = selected?.id ?? null;
  const selectedOpen = selected?.status === 'open';
  const discussion = useDiscussion(selectedPrId);

  // Presence. Opening a PR is sent only while it is open. The server ignores opens on resolved PRs
  // anyway, and skipping them keeps PR_NOT_OPEN out of the store's error. Re-running on reconnect
  // (conn back to 'open') re-sends it, after the join that the socket client sends first.
  useEffect(() => {
    if (conn === 'open' && selectedOpen && selectedPrId !== null) {
      net.send({ t: 'open', prId: selectedPrId });
    }
  }, [conn, selectedOpen, selectedPrId]);

  if (room === null) return null;

  // Choosing a card in the queue opens its PR. On a phone that means switching to the PR tab.
  function openPr(prId: string) {
    setSelectedId(prId);
    focusPrAfterOpen.current = true;
    setTab('pr');
  }

  return (
    <section className={styles.game} aria-labelledby="game-title">
      <header className={styles.header}>
        <p className={styles.kicker}>Quarter in progress</p>
        <h1 id="game-title" className={styles.title}>
          {room.companyName}
        </h1>
        {/* Phone only: value and clock stay in view on every tab. Reads the shared `now` ticker. */}
        <p className={styles.strip}>
          <span>
            <span className={styles.stripLabel}>Value </span>
            {formatMoney(room.metrics.value)}
          </span>
          <span aria-hidden="true">|</span>
          <span>
            <span className={styles.stripLabel}>Time left </span>
            {room.endsAt === null ? '—' : formatClock(timeLeftMs(room.endsAt, now))}
          </span>
        </p>
      </header>

      <div className={styles.columns} data-tab={tab}>
        <aside className={styles.queue} aria-label="Queue">
          <Queue
            prs={queue}
            players={room.players}
            myId={myId}
            now={now}
            selectedId={selectedPrId}
            onSelect={openPr}
          />
        </aside>

        <section className={styles.review} aria-label="Pull request">
          <div role="status" className={styles.muted}>
            {selected === null ? 'Select a PR from the queue to review it.' : null}
          </div>
          {selected === null ? null : (
            <PrView
              pr={selected}
              players={room.players}
              myId={myId}
              now={now}
              actionBar={
                <ActionBar
                  pr={selected}
                  queue={queue}
                  onSelect={setSelectedId}
                  keysActive={keysActive(wide, tab)}
                />
              }
              selectedLine={discussion.selectedLine}
              onLineSelect={discussion.selectLine}
              renderAfterLine={(line) => (
                <LineComments
                  line={line.index}
                  comments={commentsOn(selected.comments, line.index)}
                  selected={discussion.selectedLine === line.index}
                  connected={conn === 'open'}
                  onSubmit={(text) =>
                    net.send({ t: 'comment', prId: selected.id, line: line.index, text })
                  }
                />
              )}
              prComments={
                <PrComments
                  comments={selected.comments}
                  open={selectedOpen}
                  connected={conn === 'open'}
                  now={now}
                  lastPingAt={discussion.lastPingAt}
                  onPing={() => {
                    const sent = net.send({ t: 'ping', prId: selected.id });
                    if (sent) discussion.recordPing(selected.id, serverTime());
                    return sent;
                  }}
                  onSubmit={(text) =>
                    net.send({ t: 'comment', prId: selected.id, line: null, text })
                  }
                />
              }
            />
          )}
        </section>

        <aside className={styles.sidebar} aria-label="Dashboard and activity">
          <Dashboard />
          <ActivityFeed />
        </aside>
      </div>

      <TabBar
        active={tab}
        openCount={queue.length}
        pingDot={pingDotVisible(pings, tab)}
        onSelect={setTab}
      />
    </section>
  );
}
