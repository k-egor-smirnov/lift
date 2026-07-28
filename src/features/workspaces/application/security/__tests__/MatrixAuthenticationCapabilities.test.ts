import { describe, expect, it } from "vitest";

import { MATRIX_AUTHENTICATION_CAPABILITIES } from "../MatrixAuthenticationCapabilities";

describe("Matrix authentication capabilities", () => {
  it("exposes password and recovery key while SAS emoji verification is deferred", () => {
    expect(MATRIX_AUTHENTICATION_CAPABILITIES).toEqual({
      password: true,
      recoveryKey: true,
      sasEmojiVerification: false,
    });
  });
});
