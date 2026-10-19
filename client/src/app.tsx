// App shell and view routing. The screen comes from the store (routing.ts): landing, lobby, game
// or postmortem. Each screen lives in its own file, so tasks can work on them in parallel.

import { net } from './net/live';
import { useStore } from './net/use-store';
import { CONN_COPY } from './views/conn-copy';
import { screenFor } from './routing';
import { codeFromPath, isRoomPath } from './views/lobby-rules';
import { Landing } from './views/landing';
import { Lobby } from './views/lobby';
import { GameScreen } from './views/game/GameScreen';
import { PostmortemScreen } from './views/postmortem/PostmortemScreen';
import { Toasts } from './views/game/Toasts';
import { SoundControls } from './audio/SoundControls';
import styles from './app.module.css';

export function App() {
  const conn = useStore((s) => s.conn);
  const screen = useStore(screenFor);
  const room = useStore((s) => s.room);
  const initialCode = codeFromPath(window.location.pathname);
  const linkInvalid = initialCode === null && isRoomPath(window.location.pathname);

  return (
    <main className={styles.shell}>
      {/* One always-rendered live region. It has text, and shows, only while not connected. */}
      <div role="status" className={styles.banner} data-visible={conn !== 'open'}>
        {conn !== 'open' && <span>{CONN_COPY[conn].label}</span>}
        {CONN_COPY[conn].canRetry && (
          <button type="button" className={styles.retry} onClick={() => net.retry()}>
            Retry now
          </button>
        )}
      </div>
      {screen === 'landing' && <Landing initialCode={initialCode} linkInvalid={linkInvalid} />}
      {screen === 'lobby' && room !== null && <Lobby room={room} />}
      {screen === 'game' && <GameScreen />}
      {screen === 'postmortem' && <PostmortemScreen />}
      <Toasts />
      <SoundControls />
    </main>
  );
}
