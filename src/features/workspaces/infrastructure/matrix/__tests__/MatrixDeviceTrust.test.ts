import { describe, expect, it } from "vitest";

import { isDeviceSignedByOwner } from "../MatrixDeviceTrust";

describe("Matrix workspace device trust", () => {
  it("accepts an owner-signed device before optional cross-user SAS", () => {
    expect(
      isDeviceSignedByOwner({
        signedByOwner: true,
        crossSigningVerified: false,
        localVerified: false,
      })
    ).toBe(true);
  });

  it("rejects an unsigned device even when it was marked locally verified", () => {
    expect(
      isDeviceSignedByOwner({
        signedByOwner: false,
        crossSigningVerified: false,
        localVerified: true,
      })
    ).toBe(false);
  });
});
