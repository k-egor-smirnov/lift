import { describe, expect, it, vi } from "vitest";

import { withMatrixRateLimitRetry } from "../MatrixControlRetry";

describe("Matrix control-plane rate-limit retry", () => {
  it("honors retry_after_ms and retries an idempotent control operation", async () => {
    const wait = vi.fn<(milliseconds: number) => Promise<void>>(
      async () => undefined
    );
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce({
        errcode: "M_LIMIT_EXCEEDED",
        data: { retry_after_ms: 125 },
      })
      .mockResolvedValue("$accepted");

    await expect(
      withMatrixRateLimitRetry(operation, { wait, maxAttempts: 3 })
    ).resolves.toBe("$accepted");
    expect(operation).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledWith(125);
  });

  it("does not retry a non-rate-limit Matrix failure", async () => {
    const wait = vi.fn<(milliseconds: number) => Promise<void>>(
      async () => undefined
    );
    const failure = { errcode: "M_FORBIDDEN" };
    const operation = vi.fn<() => Promise<void>>().mockRejectedValue(failure);

    await expect(
      withMatrixRateLimitRetry(operation, { wait, maxAttempts: 3 })
    ).rejects.toBe(failure);
    expect(operation).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
  });
});
