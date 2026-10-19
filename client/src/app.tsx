// App shell and view routing. The screen comes from the store (routing.ts): landing, lobby, game
// or postmortem. Each screen lives in its own file, so tasks can work on them in parallel.

import { useStore } from './net/use-store';
import type { ConnState } from './net/store';
import { screenFor } from './routing';
import { codeFromPath } from './views/lobby-rules';
import { Landing } from './views/landing';
import { Lobby } from './views/lobby';
import { GameScreen } from './views/game/GameScreen';
import { PostmortemScreen } from './views/postmortem/PostmortemScreen';
import { Toasts } from './views/game/Toasts';
import styles from './app.module.css';

const LABELS: Record<ConnState, string> = {
  connecting: 'Connecting…',
  open: 'Connected',
  reconnecting: 'Reconnecting…',
  closed: 'Disconnected',
};

export function App() {
  const conn = useStore((s) => s.conn);
  const screen = useStore(screenFor);
  const room = useStore((s) => s.room);
  const initialCode = codeFromPath(window.location.pathname);

  return (
    <main className={styles.shell}>
      <p className={styles.status} role="status">
        {LABELS[conn]}
      </p>
      {screen === 'landing' && <Landing initialCode={initialCode} />}
      {screen === 'lobby' && room !== null && <Lobby room={room} />}
      {screen === 'game' && <GameScreen />}
      {screen === 'postmortem' && <PostmortemScreen />}
      <Toasts />
    </main>
  );
}
