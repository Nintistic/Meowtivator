export const formatMs = (ms = 0) => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds
    .toString()
    .padStart(2, '0')}`;
};

export const getDueDateFromNow = (unit = 'once', interval = 1, fromDate = new Date()) => {
  const base = new Date(fromDate);
  switch (unit) {
    case 'days':
      return new Date(base.getTime() + interval * 24 * 60 * 60 * 1000);
    case 'weeks':
      return new Date(base.getTime() + interval * 7 * 24 * 60 * 60 * 1000);
    case 'months': {
      const cloned = new Date(base);
      cloned.setMonth(cloned.getMonth() + interval);
      return cloned;
    }
    case 'once':
    default:
      return base;
  }
};

export const coerceDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (value.toDate && typeof value.toDate === 'function') return value.toDate();
  return new Date(value);
};

export const calculateXpWithFairness = (targetUserId, baseXp, weeklyStats = {}) => {
  const lowestUser = weeklyStats.lowest;
  const highestWeekly = weeklyStats.highest || 0;
  if (!lowestUser || !targetUserId) {
    return { xpAward: baseXp, fairnessApplied: false };
  }

  const lowestWeekly = lowestUser.weekly_xp || 0;
  const gap = highestWeekly - lowestWeekly;
  const threshold =
    typeof lowestUser.fairness_threshold === 'number'
      ? lowestUser.fairness_threshold
      : 1000;

  const fairnessApplied = lowestUser.id === targetUserId && gap > threshold;
  return {
    xpAward: fairnessApplied ? Math.round(baseXp * 1.5) : baseXp,
    fairnessApplied,
  };
};


