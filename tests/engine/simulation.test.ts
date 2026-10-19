// Full-game simulations: bots play whole quarters on the real content pool, driving the engine
// only through applyIntent, tick and toPublicState (nothing hand-built). Each run checks the
// rules that must hold in every game: money adds up, every merged bug fires exactly once, the
// quarter always ends, and nothing in a broadcast state or event leaks an open PR's answer key.

import { describe, expect, it } from 'vitest';
import { pool } from '../../content/prs';
import { config } from '../../shared/config';
import { BUG_TYPES, type GameEvent } from '../../shared/types';
import { createRng, type Rng } from '../../server/engine/rng';
import { startQuarter } from '../../server/engine/setup';
import { applyIntent } from '../../server/engine/apply-intent';
import { tick } from '../../server/engine/tick';
import { toPublicState } from '../../server/engine/projection';
import { postmortem } from '../../server/engine/postmortem';
import { incidentEffect } from '../../server/engine/incidents';
import type { Intent } from '../../shared/protocol';
import type { GameState } from '../../server/engine/state';

const T0 = 1_700_000_000_000;
const PLAYERS = ['a', 'b', 'c', 'd'].map((id, i) => ({
  id,
  name: `Player ${id}`,
  joinedAt: T0 + i,
  connected: true,
}));

function lobby(playerCount: number): GameState {
  return {
    code: 'SIMX',
    companyName: 'Sim Co',
    hostId: 'a',
    players: PLAYERS.slice(0, playerCount),
    phase: 'lobby',
    quarter: null,
  };
}

interface Run {
  final: GameState;
  states: string[];
  events: GameEvent[];
  bonuses: number;
}

/** Plays a quarter in 250 ms ticks. `skill` is the chance a bot spots a bug and declines it. */
function play(seed: number, playerCount: number, skill: number, mergeRate: number): Run {
  const rng: Rng = createRng(seed);
  const bot = createRng(seed + 1);
  let state = startQuarter(lobby(playerCount), pool, rng, T0);
  const states: string[] = [];
  const events: GameEvent[] = [];
  let bonuses = 0;
  let now = T0;

  const act = (intent: Intent, playerId: string): void => {
    const result = applyIntent(state, playerId, intent, now, rng);
    if (!result.ok) return;
    state = result.state;
    events.push(...result.events);
    for (const e of result.events) if (e.kind === 'catch') bonuses += e.bonus;
  };

  for (; state.phase === 'playing'; now += config.tickMs) {
    const ticked = tick(state, now, rng);
    state = ticked.state;
    events.push(...ticked.events);
    if (state.phase !== 'playing') break;

    for (const pr of [...(state.quarter?.prs.values() ?? [])]) {
      if (pr.status !== 'open' || bot.next() > 0.04) continue;
      const player = PLAYERS[Math.floor(bot.next() * playerCount)];
      if (player === undefined) continue;
      act({ t: 'open', prId: pr.pr.id }, player.id);
      act({ t: 'comment', prId: pr.pr.id, line: null, text: 'looks odd' }, player.id);
      act({ t: 'ping', prId: pr.pr.id }, player.id);
      if (pr.pr.bug !== null && bot.next() < skill) {
        const wrong = bot.next() < 0.2;
        const type = BUG_TYPES.find((t) => (t === pr.pr.bug?.type) !== wrong) ?? 'money';
        act({ t: 'decline', prId: pr.pr.id, bugType: type }, player.id);
      } else if (bot.next() < mergeRate) {
        act({ t: 'merge', prId: pr.pr.id }, player.id);
      }
    }
    states.push(JSON.stringify(toPublicState(state)));
  }
  return { final: state, states, events, bonuses };
}

const CASES = [
  { seed: 1, players: 2, skill: 0.5, mergeRate: 0.7 },
  { seed: 2, players: 4, skill: 0.2, mergeRate: 0.9 },
  { seed: 3, players: 3, skill: 0.9, mergeRate: 0.3 },
  { seed: 4, players: 4, skill: 0, mergeRate: 1 },
  { seed: 5, players: 2, skill: 0, mergeRate: 0 },
  { seed: 6, players: 4, skill: 0.5, mergeRate: 0.5 },
];

describe('full-game simulation on the real pool', () => {
  for (const c of CASES) {
    describe(`seed ${c.seed}, ${c.players} players, skill ${c.skill}`, () => {
      const run = play(c.seed, c.players, c.skill, c.mergeRate);
      const quarter = run.final.quarter;

      it('ends the quarter with no incident left waiting and the value never below $0', () => {
        expect(run.final.phase).toBe('ended');
        expect(quarter?.incidents).toEqual([]);
        expect(quarter?.metrics.value).toBeGreaterThanOrEqual(0);
      });

      it('fires exactly one incident per merged buggy PR, and the metrics are their sum', () => {
        const prs = [...(quarter?.prs.values() ?? [])];
        const slipped = prs.filter((p) => p.status === 'merged' && p.pr.bug !== null);
        expect(run.events.filter((e) => e.kind === 'incident')).toHaveLength(slipped.length);
        const effects = slipped.map((p) => (p.pr.bug === null ? null : incidentEffect(p.pr.bug)));
        const sum = (pick: (e: NonNullable<(typeof effects)[number]>) => number): number =>
          effects.reduce((total, e) => total + (e === null ? 0 : pick(e)), 0);
        expect(quarter?.metrics.downtimeMinutes).toBe(sum((e) => e.downtimeMinutes));
        expect(quarter?.metrics.breaches).toBe(sum((e) => e.breaches));
      });

      it('adds up the value: start + merged features + bonuses - losses, unless it went bankrupt', () => {
        if (quarter === undefined || quarter === null || quarter.bankrupt) return;
        const prs = [...quarter.prs.values()];
        const merged = prs.filter((p) => p.status === 'merged');
        const features = merged.reduce((t, p) => t + p.pr.featureValue, 0);
        const losses = merged.reduce(
          (t, p) => t + (p.pr.bug === null ? 0 : incidentEffect(p.pr.bug).valueLoss),
          0,
        );
        expect(quarter.metrics.value).toBe(config.startingValue + features + run.bonuses - losses);
      });

      it('leaves no PR open unless the company went bankrupt', () => {
        const open = [...(quarter?.prs.values() ?? [])].filter((p) => p.status === 'open');
        expect(quarter?.bankrupt || open.length === 0).toBe(true);
      });

      it('never sends bug lines, explanations or incident text of a PR in any public state', () => {
        const secrets = pool.flatMap((p) =>
          p.bug === null ? [] : [p.bug.explanation, p.bug.incident],
        );
        for (const json of run.states) {
          for (const secret of secrets)
            expect(json).not.toContain(JSON.stringify(secret).slice(1, -1));
          expect(json).not.toContain('"bug"');
          expect(json).not.toContain('"explanation"');
        }
      });

      it('sends incident text only in incident events, and never an explanation', () => {
        const explanations = pool.flatMap((p) => (p.bug === null ? [] : [p.bug.explanation]));
        const incidents = new Map(
          pool.flatMap((p) => (p.bug === null ? [] : [[p.bug.incident, p.id]])),
        );
        for (const e of run.events) {
          const json = JSON.stringify(e);
          for (const x of explanations) expect(json).not.toContain(JSON.stringify(x).slice(1, -1));
          if (e.kind !== 'incident') {
            for (const text of incidents.keys())
              expect(json).not.toContain(JSON.stringify(text).slice(1, -1));
            expect(json).not.toContain('"bug"');
            expect(json).not.toContain('"lines"');
          }
        }
      });

      it('produces a postmortem that accounts for every resolved PR exactly once', () => {
        const report = postmortem(run.final);
        const resolved = [...(quarter?.prs.values() ?? [])].filter((p) => p.status !== 'open');
        const cleanMerged = resolved.filter((p) => p.status === 'merged' && p.pr.bug === null);
        const sections =
          report.slipped.length +
          report.catches.length +
          report.wrongReason.length +
          report.lostRevenue.length +
          cleanMerged.length;
        expect(sections).toBe(resolved.length);
      });
    });
  }

  it('is deterministic: the same seed replays the same game', () => {
    const a = play(11, 3, 0.5, 0.6);
    const b = play(11, 3, 0.5, 0.6);
    expect(JSON.stringify(postmortem(a.final))).toBe(JSON.stringify(postmortem(b.final)));
    expect(a.events).toEqual(b.events);
  });
});
