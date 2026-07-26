export const retryDelay = (
  attempt: number,
  random: () => number = Math.random
): number => {
  const ceiling = Math.min(300_000, 1_000 * 2 ** Math.min(attempt, 8));
  const jitter = Math.min(1, Math.max(0, random()));
  return Math.floor(ceiling * jitter);
};
