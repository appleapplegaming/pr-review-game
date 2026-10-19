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
      at: 1,
    };
    expect(eventText(event)).toBe('Sara declined Add refund endpoint as a security bug');
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
});
