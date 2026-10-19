import { useState } from 'preact/hooks';
import { net } from '../net/live';
import { selectIsHost, store } from '../net/store';
import { useStore } from '../net/use-store';
import type { PublicRoomState } from '../../../shared/types';
import { roomLink, validateCompanyName } from './lobby-rules';
import styles from './lobby.module.css';

/** The room before the quarter starts: share link, player list, and host controls. */
export function Lobby({ room }: { room: PublicRoomState }) {
  const conn = useStore((s) => s.conn);
  const serverError = useStore((s) => s.error);
  const myId = useStore((s) => s.session?.playerId ?? null);
  const isHost = useStore(selectIsHost);
  const [companyDraft, setCompanyDraft] = useState(room.companyName);
  const [problem, setProblem] = useState<string | null>(null);
  const [copied, setCopied] = useState<'yes' | 'no' | null>(null);
  const canSend = conn === 'open';
  const shown = problem ?? serverError?.message ?? null;
  const link = roomLink(window.location.origin, room.code);

  function submit(msg: Parameters<typeof net.send>[0]) {
    store.dispatch({ type: 'clearError' });
    setProblem(net.send(msg) ? null : 'Not connected. Wait for "Connected" and try again.');
  }

  function onStart() {
    submit({ t: 'start' });
  }

  function onRename(event: Event) {
    event.preventDefault();
    const checked = validateCompanyName(companyDraft);
    if (!checked.ok) return setProblem(checked.message);
    submit({ t: 'rename', companyName: checked.value });
  }

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied('yes');
    } catch {
      // No clipboard (insecure page or denied permission). The link stays selectable in the field.
      setCopied('no');
    }
  }

  return (
    <section className={styles.panel} aria-labelledby="lobby-title">
      <header className={styles.header}>
        <p className={styles.kicker}>Lobby</p>
        <h1 id="lobby-title" className={styles.title}>
          {room.companyName}
        </h1>
        <p className={styles.code}>
          Room <span aria-label={`room code ${room.code.split('').join(' ')}`}>{room.code}</span>
        </p>
      </header>

      <div className={styles.share}>
        <label htmlFor="share-link" className={styles.label}>
          Share link
        </label>
        <div className={styles.shareRow}>
          <input
            id="share-link"
            className={styles.linkField}
            value={link}
            readOnly
            onFocus={(e) => e.currentTarget.select()}
          />
          <button type="button" className={styles.secondary} onClick={onCopy}>
            Copy link
          </button>
        </div>
        <p role="status" className={styles.muted}>
          {copied === 'yes'
            ? 'Link copied.'
            : copied === 'no'
              ? 'Copy failed. Select the link and copy it.'
              : ''}
        </p>
      </div>

      <section aria-labelledby="players-title">
        <h2 id="players-title" className={styles.subtitle}>
          Players ({room.players.length})
        </h2>
        <ul className={styles.players}>
          {room.players.map((player) => (
            <li key={player.id} className={styles.player}>
              <span>
                {player.name}
                {player.id === myId ? ' (you)' : ''}
              </span>
              <span className={styles.badges}>
                {player.isHost && <span className={styles.badge}>Host</span>}
                {!player.connected && <span className={styles.muted}>offline</span>}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {isHost ? (
        <section className={styles.hostControls} aria-labelledby="host-title">
          <h2 id="host-title" className={styles.subtitle}>
            Host controls
          </h2>
          <form className={styles.renameForm} onSubmit={onRename} noValidate>
            <label className={styles.label} htmlFor="company-name">
              Company name
            </label>
            <div className={styles.shareRow}>
              <input
                id="company-name"
                className={styles.linkField}
                maxLength={40}
                value={companyDraft}
                onInput={(e) => setCompanyDraft(e.currentTarget.value)}
                disabled={!canSend}
              />
              <button type="submit" className={styles.secondary} disabled={!canSend}>
                Rename
              </button>
            </div>
          </form>
          <button type="button" className={styles.primary} onClick={onStart} disabled={!canSend}>
            Start quarter
          </button>
        </section>
      ) : (
        <p className={styles.muted}>Waiting for the host to start the quarter.</p>
      )}

      {shown !== null && (
        <p role="alert" className={styles.error}>
          {shown}
        </p>
      )}
    </section>
  );
}
