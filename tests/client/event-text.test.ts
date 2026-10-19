import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../../shared/types';
import { eventText } from '../../client/src/views/game/event-text';

describe('eventText', () => {
  it('shows an incident as its text only, with no PR title', () => {
    const event: GameEvent = {
      kind: 'incident',
      bugType: 'outage',
      text: 'Checkout is down.',
      at: 1,
    };
    expect(eventText(event)).toBe('Checkout is down.');
  });

  it('phrases a second opinion with the player and the PR title', () => {
    const event: GameEvent = {
      kind: 'ping',
      prId: 'p1',
      prTitle: 'Add refund endpoint',
      playerId: 'a',
      playerName: 'Sara',
      at: 1,
    };
    expect(eventText(event)).toBe('Sara wants a second opinion on Add refund endpoint');
  });

  it('phrases a player merge', () => {
    const event: GameEvent = {
      kind: 'merge',
      prId: 'p1',
      prTitle: 'Add refund endpoint',
      by: 'a',
      byName: 'Sara',
      at: 1,
    };
    expect(eventText(event)).toBe('Sara merged Add refund endpoint');
  });

  it('phrases an auto-merge when nobody merged it', () => {
    const event: GameEvent = {
      kind: 'merge',
      prId: 'p1',
      prTitle: 'Add refund endpoint',
      by: null,
      byName: null,
      at: 1,
    };
    expect(eventText(event)).toBe('Auto-merged: Add refund endpoint');
  });

  it('phrases a decline with the bug type the player chose', () => {
    const event: GameEvent = {
      kind: 'decline',
      prId: 'p1',
      prTitle: 'Add refund endpoint',
      by: 'a',
      byName: 'Sara',
      bugType: 'security',
      verdict: 'clean',
      at: 1,
    };
    expect(eventText(event)).toBe(
      'Sara declined Add refund endpoint as a security bug: no bug there, its value is lost',
    );
  });

  it('phrases a wrong-reason decline without revealing the real bug type', () => {
    const event: GameEvent = {
      kind: 'decline',
      prId: 'p1',
      prTitle: 'Add refund endpoint',
      by: 'a',
      byName: 'Sara',
      bugType: 'security',
      verdict: 'wrong-reason',
      at: 1,
    };
    expect(eventText(event)).toBe(
      'Sara declined Add refund endpoint as a security bug: a real bug, but no bonus',
    );
  });

  it('phrases comments without any comment text', () => {
    const base = {
      kind: 'comment' as const,
      prId: 'p1',
      prTitle: 'Add refund endpoint',
      by: 'a',
      byName: 'Sara',
      at: 1,
    };
    expect(eventText({ ...base, onLine: true })).toBe(
      'Sara commented on a line in Add refund endpoint',
    );
    expect(eventText({ ...base, onLine: false })).toBe('Sara commented on Add refund endpoint');
  });

  it('phrases a catch with the bonus formatted by formatMoney', () => {
    const event: GameEvent = {
      kind: 'catch',
      prId: 'p1',
      prTitle: 'Add refund endpoint',
      by: 'a',
      byName: 'Sara',
      bugType: 'money',
      bonus: 150_000,
      at: 1,
    };
    expect(eventText(event)).toBe('Sara caught a money bug in Add refund endpoint: +$150k');
  });

  it('uses "an" before an outage bug, in a decline and in a catch', () => {
    const base = { prId: 'p1', prTitle: 'Add refund endpoint', by: 'a', byName: 'Sara', at: 1 };
    expect(eventText({ ...base, kind: 'decline', bugType: 'outage', verdict: 'clean' })).toBe(
      'Sara declined Add refund endpoint as an outage bug: no bug there, its value is lost',
    );
    expect(eventText({ ...base, kind: 'catch', bugType: 'outage', bonus: 150_000 })).toBe(
      'Sara caught an outage bug in Add refund endpoint: +$150k',
    );
  });
});
