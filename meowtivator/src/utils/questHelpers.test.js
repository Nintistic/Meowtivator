import {
  formatMs,
  getDueDateFromNow,
  coerceDate,
  calculateXpWithFairness,
} from './questHelpers';

describe('formatMs', () => {
  it('formats milliseconds into H:MM:SS', () => {
    expect(formatMs(0)).toBe('0:00:00');
    expect(formatMs(3661000)).toBe('1:01:01');
    expect(formatMs(59_000)).toBe('0:00:59');
  });
});

describe('getDueDateFromNow', () => {
  const baseDate = new Date('2025-01-01T00:00:00.000Z');

  it('handles daily intervals', () => {
    const result = getDueDateFromNow('days', 2, baseDate);
    expect(result.toISOString()).toBe('2025-01-03T00:00:00.000Z');
  });

  it('handles weekly intervals', () => {
    const result = getDueDateFromNow('weeks', 1, baseDate);
    expect(result.toISOString()).toBe('2025-01-08T00:00:00.000Z');
  });

  it('handles monthly intervals', () => {
    const result = getDueDateFromNow('months', 1, baseDate);
    expect(result.toISOString()).toBe('2025-02-01T00:00:00.000Z');
  });

  it('defaults to the provided date for one-off quests', () => {
    const result = getDueDateFromNow('once', 1, baseDate);
    expect(result.toISOString()).toBe('2025-01-01T00:00:00.000Z');
  });
});

describe('coerceDate', () => {
  it('returns the same Date instance', () => {
    const now = new Date();
    expect(coerceDate(now)).toBe(now);
  });

  it('converts Firestore Timestamp-like objects', () => {
    const expected = new Date('2025-05-01T12:00:00.000Z');
    const fakeTimestamp = { toDate: () => expected };
    expect(coerceDate(fakeTimestamp)).toBe(expected);
  });

  it('converts string values', () => {
    const result = coerceDate('2025-01-15T00:00:00.000Z');
    expect(result).toBeInstanceOf(Date);
    expect(result.toISOString()).toBe('2025-01-15T00:00:00.000Z');
  });
});

describe('calculateXpWithFairness', () => {
  const baseStats = {
    highest: 2000,
    lowest: {
      id: 'player-low',
      weekly_xp: 600,
      fairness_threshold: 1000,
    },
  };

  it('applies 1.5x multiplier when threshold exceeded for lowest player', () => {
    const { xpAward, fairnessApplied } = calculateXpWithFairness('player-low', 100, baseStats);
    expect(xpAward).toBe(150);
    expect(fairnessApplied).toBe(true);
  });

  it('does not apply multiplier when target is not lowest earner', () => {
    const { xpAward, fairnessApplied } = calculateXpWithFairness('player-high', 100, baseStats);
    expect(xpAward).toBe(100);
    expect(fairnessApplied).toBe(false);
  });

  it('does not apply multiplier when XP gap is below threshold', () => {
    const stats = {
      highest: 1600,
      lowest: {
        id: 'player-low',
        weekly_xp: 700,
        fairness_threshold: 1000,
      },
    };
    const { xpAward, fairnessApplied } = calculateXpWithFairness('player-low', 100, stats);
    expect(xpAward).toBe(100);
    expect(fairnessApplied).toBe(false);
  });
});


