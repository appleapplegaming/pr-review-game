// The end-of-quarter screen. Sections come in SPEC.md → Postmortem order: headline, what slipped
// through, great catches, right call wrong reason, missed value, team stats. The report is read
// from the store (it arrives as a 'postmortem' message). Only the host gets Play again; everyone
// else sees who the host is. On arrival a polite live region announces the report and focus moves
// to the headline.

import { useEffect, useRef } from 'preact/hooks';
import { net } from '../../net/live';
import { selectIsHost, store } from '../../net/store';
import { useStore } from '../../net/use-store';
import { formatMoney, formatUptime } from '../../../../shared/money';
import type { Postmortem } from '../../../../shared/types';
import { BADGE_EMOJI, BADGE_LABEL, badgeCaption, outcomeLine } from './postmortem-rules';
import { CatchesSection, LostRevenueSection, WrongReasonSection } from './DecisionSections';
import { Emoji } from './Emoji';
import { SlippedSection } from './SlippedSection';
import { TeamStats } from './TeamStats';
import styles from './postmortem.module.css';

const SECTIONS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'slipped-title', label: 'What slipped through' },
  { id: 'catches-title', label: 'Great catches' },
  { id: 'wrong-title', label: 'Right call, wrong reason' },
  { id: 'lost-title', label: 'Missed value' },
  { id: 'stats-title', label: 'Team stats' },
];

export function PostmortemScreen() {
  const report = useStore((s) => s.postmortem);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const ready = report !== null;

  // Move focus to the headline once, when the report first renders.
  useEffect(() => {
    if (ready) headingRef.current?.focus();
  }, [ready]);

  return (
    <article className={styles.screen} aria-labelledby="postmortem-title">
      <p className={styles.sr} aria-live="polite">
        {ready ? 'Quarter over, the postmortem is ready.' : ''}
      </p>
      {report === null ? (
        <>
          <h1 id="postmortem-title" className={styles.title}>
            Quarter over
          </h1>
          <p className={styles.muted}>Loading the postmortem…</p>
        </>
      ) : (
        <>
          <Headline report={report} headingRef={headingRef} />
          <nav aria-label="Jump to section" className={styles.jumpNav}>
            <ul className={styles.jumpList}>
              {SECTIONS.map((s) => (
                <li key={s.id}>
                  <a className={styles.jumpLink} href={`#${s.id}`}>
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <SlippedSection entries={report.slipped} />
          <CatchesSection entries={report.catches} />
          <WrongReasonSection entries={report.wrongReason} />
          <LostRevenueSection entries={report.lostRevenue} total={report.lostRevenueTotal} />
          <TeamStats stats={report.teamStats} />
        </>
      )}
    </article>
  );
}

function Headline({
  report,
  headingRef,
}: {
  report: Postmortem;
  headingRef: { current: HTMLHeadingElement | null };
}) {
  const { finalMetrics } = report;
  return (
    <header className={styles.headline}>
      <p className={styles.kicker}>Postmortem</p>
      <h1 id="postmortem-title" className={styles.title} tabIndex={-1} ref={headingRef}>
        {report.companyName}
      </h1>
      {report.bankrupt && (
        <p className={styles.bankrupt}>
          <strong>Bankrupt.</strong> The company ran out of money, so the quarter ended early.
        </p>
      )}
      <p className={styles.badge}>
        <Emoji>{BADGE_EMOJI[report.badge]}</Emoji>
        {BADGE_LABEL[report.badge]}
      </p>
      <p className={styles.muted}>{badgeCaption(report.badge)}</p>
      <p className={styles.outcome}>{outcomeLine(report.badge, report.bankrupt)}</p>
      <dl className={styles.headlineStats}>
        <div className={styles.stat}>
          <dt>Final company value</dt>
          <dd>{formatMoney(finalMetrics.value)}</dd>
        </div>
        <div className={styles.stat}>
          <dt>Uptime</dt>
          <dd>{formatUptime(finalMetrics.uptime)}</dd>
        </div>
        <div className={styles.stat}>
          <dt>Breaches</dt>
          <dd>{finalMetrics.breaches}</dd>
        </div>
      </dl>
      <NextRound />
    </header>
  );
}

function NextRound() {
  const conn = useStore((s) => s.conn);
  const serverMessage = useStore((s) => s.error?.message);
  const isHost = useStore(selectIsHost);
  const hostName = useStore((s) => s.room?.players.find((p) => p.id === s.room?.hostId)?.name);
  const connected = conn === 'open';

  if (!isHost) {
    return (
      <p className={styles.muted}>
        {hostName === undefined
          ? 'Waiting for the host to play again.'
          : `Waiting for ${hostName}, the host, to play again.`}
      </p>
    );
  }

  function onPlayAgain() {
    store.dispatch({ type: 'clearError' });
    net.send({ t: 'playAgain' });
  }

  return (
    <div className={styles.playAgain}>
      <button type="button" className={styles.primary} onClick={onPlayAgain} disabled={!connected}>
        Play again
      </button>
      {!connected && <p className={styles.muted}>Not connected. Wait for "Connected".</p>}
      {serverMessage !== undefined && (
        <p role="alert" className={styles.error}>
          {serverMessage}
        </p>
      )}
    </div>
  );
}
