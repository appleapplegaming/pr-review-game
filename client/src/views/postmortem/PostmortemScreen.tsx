// The end-of-quarter screen. Sections come in SPEC.md → Postmortem order: headline, what slipped
// through, great catches, right call wrong reason, lost revenue, team stats. The report is read from
// the store (it arrives as a 'postmortem' message). Only the host sees Play again.

import { net } from '../../net/live';
import { selectIsHost, store } from '../../net/store';
import { useStore } from '../../net/use-store';
import { formatMoney, formatUptime } from '../../../../shared/money';
import type { Postmortem } from '../../../../shared/types';
import { BADGE_LABEL } from './postmortem-rules';
import { CatchesSection, LostRevenueSection, WrongReasonSection } from './DecisionSections';
import { SlippedSection } from './SlippedSection';
import { TeamStats } from './TeamStats';
import styles from './postmortem.module.css';

export function PostmortemScreen() {
  const report = useStore((s) => s.postmortem);
  const conn = useStore((s) => s.conn);
  const serverError = useStore((s) => s.error);
  const isHost = useStore(selectIsHost);

  if (report === null) {
    return (
      <section className={styles.screen} aria-labelledby="postmortem-title">
        <h1 id="postmortem-title" className={styles.title}>
          Quarter over
        </h1>
        <p role="status" className={styles.muted}>
          Loading the postmortem…
        </p>
      </section>
    );
  }

  return (
    <article className={styles.screen} aria-labelledby="postmortem-title">
      {report.bankrupt && <Bankrupt />}
      <Headline report={report} />
      <SlippedSection entries={report.slipped} />
      <CatchesSection entries={report.catches} />
      <WrongReasonSection entries={report.wrongReason} />
      <LostRevenueSection entries={report.lostRevenue} total={report.lostRevenueTotal} />
      <TeamStats stats={report.teamStats} />
      <PlayAgain isHost={isHost} connected={conn === 'open'} serverMessage={serverError?.message} />
    </article>
  );
}

function Bankrupt() {
  return (
    <p role="status" className={styles.bankrupt}>
      <strong>Bankrupt.</strong> The company ran out of money, so the quarter ended early.
    </p>
  );
}

function Headline({ report }: { report: Postmortem }) {
  const { finalMetrics } = report;
  return (
    <header className={styles.headline}>
      <p className={styles.kicker}>Postmortem</p>
      <h1 id="postmortem-title" className={styles.title}>
        {report.companyName}
      </h1>
      <p className={styles.badge}>{BADGE_LABEL[report.badge]}</p>
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
    </header>
  );
}

function PlayAgain({
  isHost,
  connected,
  serverMessage,
}: {
  isHost: boolean;
  connected: boolean;
  serverMessage: string | undefined;
}) {
  if (!isHost) {
    return <p className={styles.muted}>Waiting for the host to play again.</p>;
  }

  function onPlayAgain() {
    store.dispatch({ type: 'clearError' });
    net.send({ t: 'playAgain' });
  }

  return (
    <section className={styles.playAgain} aria-label="Next round">
      <button type="button" className={styles.primary} onClick={onPlayAgain} disabled={!connected}>
        Play again
      </button>
      {!connected && <p className={styles.muted}>Not connected. Wait for "Connected".</p>}
      {serverMessage !== undefined && (
        <p role="alert" className={styles.error}>
          {serverMessage}
        </p>
      )}
    </section>
  );
}
