import { useState } from 'preact/hooks';
import { net } from '../net/live';
import { store } from '../net/store';
import { useStore } from '../net/use-store';
import { normalizeCode, isValidCode, validateName } from './lobby-rules';
import styles from './landing.module.css';

/** Create a room, or join one by code. `initialCode` comes from a /r/CODE link. */
export function Landing({ initialCode }: { initialCode: string | null }) {
  const conn = useStore((s) => s.conn);
  const serverError = useStore((s) => s.error);
  const [name, setName] = useState('');
  const [code, setCode] = useState(initialCode ?? '');
  const [problem, setProblem] = useState<string | null>(null);
  const canSend = conn === 'open';
  const shown = problem ?? serverError?.message ?? null;

  /** Sends one message after the local checks pass. Clears the previous error first. */
  function submit(msg: Parameters<typeof net.send>[0]) {
    store.dispatch({ type: 'clearError' });
    setProblem(net.send(msg) ? null : 'Not connected. Wait for "Connected" and try again.');
  }

  function onCreate(event: Event) {
    event.preventDefault();
    const checked = validateName(name);
    if (!checked.ok) return setProblem(checked.message);
    submit({ t: 'create', name: checked.value });
  }

  function onJoin(event: Event) {
    event.preventDefault();
    const checked = validateName(name);
    if (!checked.ok) return setProblem(checked.message);
    const typed = normalizeCode(code);
    if (!isValidCode(typed)) return setProblem('Enter the 4-letter room code');
    submit({ t: 'join', code: typed, name: checked.value });
  }

  return (
    <section className={styles.panel} aria-labelledby="landing-title">
      <h1 id="landing-title" className={styles.title}>
        Ship It
      </h1>
      <p className={styles.lede}>
        Review the queue, merge what is safe, and keep the company running.
      </p>

      <form className={styles.form} onSubmit={onJoin} noValidate>
        <label className={styles.field}>
          <span>Your name</span>
          <input
            name="name"
            autoComplete="nickname"
            maxLength={40}
            value={name}
            onInput={(e) => setName(e.currentTarget.value)}
            disabled={!canSend}
          />
        </label>
        <label className={styles.field}>
          <span>Room code</span>
          <input
            name="code"
            autoCapitalize="characters"
            autoComplete="off"
            maxLength={4}
            value={code}
            onInput={(e) => setCode(e.currentTarget.value)}
            disabled={!canSend}
          />
        </label>
        <div className={styles.actions}>
          <button type="submit" className={styles.primary} disabled={!canSend}>
            Join room
          </button>
          <button type="button" className={styles.secondary} onClick={onCreate} disabled={!canSend}>
            Create room
          </button>
        </div>
      </form>

      {shown !== null && (
        <p role="alert" className={styles.error}>
          {shown}
        </p>
      )}
      {!canSend && (
        <p role="status" className={styles.muted}>
          Connecting to the server…
        </p>
      )}
    </section>
  );
}
