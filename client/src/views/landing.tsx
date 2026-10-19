import { useRef, useState } from 'preact/hooks';
import { config } from '../../../shared/config';
import { net } from '../net/live';
import { browserStorage, loadSession } from '../net/session';
import { store } from '../net/store';
import { useStore } from '../net/use-store';
import { CONN_COPY } from './conn-copy';
import {
  codeProblem,
  filterCodeInput,
  isValidCode,
  normalizeCode,
  validateName,
} from './lobby-rules';
import styles from './landing.module.css';

interface Props {
  /** The valid room code from a /r/CODE link, or null. */
  initialCode: string | null;
  /** True when the page was opened from a /r/ link whose code is not valid. */
  linkInvalid?: boolean;
}

/** Create a room, or join one by code. */
export function Landing({ initialCode, linkInvalid = false }: Props) {
  const conn = useStore((s) => s.conn);
  const serverError = useStore((s) => s.error);
  const [name, setName] = useState('');
  const [code, setCode] = useState(initialCode ?? '');
  const [nameError, setNameError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const canSend = conn === 'open';
  const copy = CONN_COPY[conn];
  const shownFormError = formError ?? serverError?.message ?? null;
  // A stored seat means the socket is rejoining it. Show that instead of an empty form, until the
  // room arrives (this view unmounts) or the server refuses (serverError, or the seat is cleared).
  const rejoining = serverError === null && loadSession(browserStorage()) !== null;

  /** Sends one message after the local checks pass. Clears the previous error first. */
  function submit(msg: Parameters<typeof net.send>[0]) {
    store.dispatch({ type: 'clearError' });
    setFormError(net.send(msg) ? null : 'Not connected. Wait for the connection and try again.');
  }

  /** Validates the fields, shows errors beside them and focuses the first bad one. */
  function check(needCode: boolean): { name: string; code: string } | null {
    const checkedName = validateName(name);
    const typed = normalizeCode(code);
    const codeBad = needCode && !isValidCode(typed);
    setNameError(checkedName.ok ? null : checkedName.message);
    setCodeError(codeBad ? codeProblem() : null);
    if (!checkedName.ok) {
      nameRef.current?.focus();
      return null;
    }
    if (codeBad) {
      codeRef.current?.focus();
      return null;
    }
    return { name: checkedName.value, code: typed };
  }

  function onCreate() {
    const ok = check(false);
    if (ok !== null) submit({ t: 'create', name: ok.name });
  }

  /** Enter in either field: with no code it creates a room, with a code it joins. */
  function onSubmit(event: Event) {
    event.preventDefault();
    if (normalizeCode(code) === '') return onCreate();
    const ok = check(true);
    if (ok !== null) submit({ t: 'join', code: ok.code, name: ok.name });
  }

  const intro =
    initialCode !== null ? (
      <p className={styles.notice}>Joining room {initialCode}</p>
    ) : linkInvalid ? (
      <p className={styles.notice}>That room link isn&apos;t valid. Enter a code instead.</p>
    ) : null;

  return (
    <section className={styles.panel} aria-labelledby="landing-title">
      <h1 id="landing-title" className={styles.title}>
        Ship It
      </h1>
      <p className={styles.lede}>
        Ship It is a co-op game: you and your team review the same queue of pull requests for one
        shared quarter at a fictional company. Merge what is safe, decline what is not, and keep the
        company running.
      </p>
      <p className={styles.lede}>
        To play, create a room and send the link or code to your team, or enter a code you were
        given.
      </p>
      <details className={styles.how}>
        <summary>How it works</summary>
        <ol>
          <li>One person creates a room and shares its link or room code.</li>
          <li>Everyone joins the lobby. The host starts the quarter.</li>
          <li>
            Pull requests arrive over the quarter. Read each diff, then merge or decline it before
            its timer runs out.
          </li>
          <li>Bad merges cause incidents and cost company value. Ending value is your score.</li>
        </ol>
      </details>

      {rejoining ? (
        <p className={styles.notice}>Rejoining your room…</p>
      ) : (
        <form className={styles.form} onSubmit={onSubmit} noValidate>
          {intro}
          {copy.detail !== null && (
            <div className={styles.connRow}>
              <p className={styles.muted}>{copy.detail}</p>
              {copy.canRetry && (
                <button type="button" className="btn btn-secondary" onClick={() => net.retry()}>
                  Retry
                </button>
              )}
            </div>
          )}
          <div className={styles.field}>
            <label htmlFor="landing-name">Your name</label>
            <input
              id="landing-name"
              ref={nameRef}
              name="name"
              autoComplete="nickname"
              maxLength={config.name.max}
              value={name}
              onInput={(e) => setName(e.currentTarget.value)}
              aria-invalid={nameError !== null}
              aria-describedby={nameError !== null ? 'landing-name-error' : undefined}
            />
            {nameError !== null && (
              <p id="landing-name-error" className={styles.error}>
                {nameError}
              </p>
            )}
          </div>
          <div className={styles.field}>
            <label htmlFor="landing-code">Room code</label>
            <input
              id="landing-code"
              ref={codeRef}
              name="code"
              autoCapitalize="characters"
              autoComplete="off"
              spellcheck={false}
              maxLength={config.roomCodeLength}
              value={code}
              onInput={(e) => setCode(filterCodeInput(e.currentTarget.value))}
              aria-invalid={codeError !== null}
              aria-describedby={
                codeError !== null ? 'landing-code-hint landing-code-error' : 'landing-code-hint'
              }
            />
            <p id="landing-code-hint" className={styles.hint}>
              Leave empty to create a new room.
            </p>
            {codeError !== null && (
              <p id="landing-code-error" className={styles.error}>
                {codeError}
              </p>
            )}
          </div>
          <div className={styles.actions}>
            <button type="submit" className="btn btn-primary" disabled={!canSend}>
              Join room
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onCreate}
              disabled={!canSend}
            >
              Create room
            </button>
          </div>
        </form>
      )}

      {shownFormError !== null && (
        <p role="alert" className={styles.error}>
          {shownFormError}
        </p>
      )}
    </section>
  );
}
