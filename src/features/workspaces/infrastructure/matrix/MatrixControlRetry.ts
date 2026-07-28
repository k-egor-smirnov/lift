interface MatrixRateLimitRetryOptions {
  readonly maxAttempts?: number;
  readonly wait?: (milliseconds: number) => Promise<void>;
}

const objectRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;

const rateLimitDelay = (error: unknown): number | null => {
  const value = objectRecord(error);
  const data = objectRecord(value?.data);
  const errcode = value?.errcode ?? data?.errcode;
  if (errcode !== "M_LIMIT_EXCEEDED") return null;
  const retryAfter = data?.retry_after_ms ?? value?.retry_after_ms;
  return typeof retryAfter === "number" &&
    Number.isFinite(retryAfter) &&
    retryAfter >= 0
    ? Math.min(retryAfter, 30_000)
    : 1_000;
};

const defaultWait = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => window.setTimeout(resolve, milliseconds));

export const withMatrixRateLimitRetry = async <T>(
  operation: () => Promise<T>,
  options: MatrixRateLimitRetryOptions = {}
): Promise<T> => {
  const maxAttempts = options.maxAttempts ?? 5;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new Error("Matrix control retry requires at least one attempt");
  }
  const wait = options.wait ?? defaultWait;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const delay = rateLimitDelay(error);
      if (delay === null || attempt === maxAttempts) throw error;
      await wait(delay);
    }
  }
  throw new Error("Matrix control retry exhausted unexpectedly");
};
