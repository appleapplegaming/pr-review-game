// The game screen: queue on the left, the selected PR in the middle, a sidebar on the right.
// From 900 px wide the three columns sit side by side. Narrower, they stack (Task 20 refines phones).
//
// This file owns selection, the clock tick and presence. Presence sends `open` for the selected PR
// from an effect, so it is sent once per selection and again after every reconnect.
//
// Slots left for other tasks:
//  - Task 17 action bar: PrView `actionBar` prop (rendered in the PR column).
//  - Task 18 comments: PrView `prComments` and the DiffView hooks (`onLineSelect`, `renderAfterLine`).
//  - Toasts are mounted once by app.tsx, not here.

import { useEffect, useState } from 'preact/hooks';
import { config } from '../../../../shared/config';
import { net } from '../../net/live';
import { serverTime } from '../../net/store';
import { useStore } from '../../net/use-store';
import { openQueue } from './queue-rules';
import { ActivityFeed } from './ActivityFeed';
import { Dashboard } from './Dashboard';
import { PrView } from './PrView';
import { Queue } from './Queue';
import styles from './GameScreen.module.css';

export function GameScreen() {
  const room = useStore((s) => s.room);
  const conn = useStore((s) => s.conn);
  const myId = useStore((s) => s.session?.playerId ?? null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [now, setNow] = useState(() => serverTime());

  // One shared ticker for every countdown on the screen.
  useEffect(() => {
    const timer = setInterval(() => setNow(serverTime()), config.tickMs);
    return () => clearInterval(timer);
  }, []);

  const queue = room === null ? [] : openQueue(room.prs);
  // Keep the chosen PR even after it resolves (it shows the result). Fall back to the top of the
  // queue when nothing is chosen or the chosen PR has left the room.
  const selected =
    room === null ? null : (room.prs.find((p) => p.id === selectedId) ?? queue[0] ?? null);

  const selectedPrId = selected?.id ?? null;
  const selectedOpen = selected?.status === 'open';

  // Presence. Opening a PR is sent only while it is open. The server ignores opens on resolved PRs
  // anyway, and skipping them keeps PR_NOT_OPEN out of the store's error. Re-running on reconnect
  // (conn back to 'open') re-sends it, after the join that the socket client sends first.
  useEffect(() => {
    if (conn === 'open' && selectedOpen && selectedPrId !== null) {
      net.send({ t: 'open', prId: selectedPrId });
    }
  }, [conn, selectedOpen, selectedPrId]);

  if (room === null) return null;

  return (
    <section className={styles.game} aria-labelledby="game-title">
      <header className={styles.header}>
        <p className={styles.kicker}>Quarter in progress</p>
        <h1 id="game-title" className={styles.title}>
          {room.companyName}
        </h1>
      </header>

      <div className={styles.columns}>
        <aside className={styles.queue} aria-label="Queue">
          <Queue
            prs={queue}
            players={room.players}
            myId={myId}
            now={now}
            selectedId={selectedPrId}
            onSelect={setSelectedId}
          />
        </aside>

        <section className={styles.review} aria-label="Pull request">
          {selected === null ? (
            <p role="status" className={styles.muted}>
              Select a PR from the queue to review it.
            </p>
          ) : (
            <PrView pr={selected} players={room.players} myId={myId} now={now} />
          )}
        </section>

        <aside className={styles.sidebar} aria-label="Dashboard and activity">
          <Dashboard />
          <ActivityFeed />
        </aside>
      </div>
    </section>
  );
}
